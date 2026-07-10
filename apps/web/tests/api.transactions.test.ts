import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Use the same DATABASE_URL as the main app (set by pretest or .env)
// pretest already runs: prisma generate && prisma db push && db:seed

const TEST_USER_ID = "test-user-tx";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

let prisma: import("@prisma/client").PrismaClient;
let testUserId: string;
let testAccountId: string;
let testCategoryId: string;

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  
  // Create isolated test user, account, and category
  const user = await prisma.user.upsert({
    where: { email: "tx-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "tx-test@example.com", password: "hashed" }
  });
  testUserId = user.id;
  
  const account = await prisma.account.upsert({
    where: { id: "acc_tx_test" },
    update: { userId: user.id },
    create: { id: "acc_tx_test", name: "TX Test Account", userId: user.id }
  });
  testAccountId = account.id;
  
  const category = await prisma.category.upsert({
    where: { userId_name: { userId: user.id, name: "TX Test Category" } },
    update: {},
    create: { name: "TX Test Category", userId: user.id }
  });
  testCategoryId = category.id;
  
  // Clean up any existing transactions for this test account
  await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
});

afterAll(async () => {
  // Cleanup test data
  if (prisma) {
    await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
    await prisma.category.deleteMany({ where: { id: testCategoryId } });
    await prisma.account.deleteMany({ where: { id: testAccountId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
  }
});

describe("/api/transactions", () => {
  it("creates, updates, and lists transactions", async () => {
    // Import route
    const routes = await import("../app/api/transactions/route");
    const detailRoutes = await import("../app/api/transactions/[id]/route");

    const body = {
      accountId: testAccountId,
      categoryId: testCategoryId,
      amountCents: 2500,
      description: "Test Tx",
      occurredAt: new Date().toISOString()
    };
    const req = new Request("http://localhost/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const res = await routes.POST(req);
    expect(res.status).toBe(201);
    const created: { id: string; amountCents: number; description: string; occurredAt: string } = await res.json();
    expect(created.id).toBeTruthy();
    expect(created.amountCents).toBe(2500);

    const patchBody = {
      accountId: testAccountId,
      categoryId: testCategoryId,
      amountCents: -1500,
      description: "Updated Tx",
      occurredAt: created.occurredAt
    };

    const patchReq = new Request(`http://localhost/api/transactions/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchBody)
    });

    const patchRes = await detailRoutes.PATCH(patchReq, { params: { id: created.id } });
    expect(patchRes.status).toBe(200);
    const updated: { id: string; amountCents: number; description: string } = await patchRes.json();
    expect(updated.amountCents).toBe(-1500);
    expect(updated.description).toBe("Updated Tx");

    const listRes = await routes.GET();
    expect(listRes.status).toBe(200);
    const list: Array<{ id: string; description: string; amountCents: number }> = await listRes.json();
    expect(list.length).toBeGreaterThan(0);
    const match = list.find((t) => t.id === created.id);
    expect(match).toBeTruthy();
    expect(match?.amountCents).toBe(-1500);
    expect(match?.description).toBe("Updated Tx");

    const deleteReq = new Request(`http://localhost/api/transactions/${created.id}`, {
      method: "DELETE"
    });
    const deleteRes = await detailRoutes.DELETE(deleteReq, { params: { id: created.id } });
    expect(deleteRes.status).toBe(204);

    const listAfterDeleteRes = await routes.GET();
    expect(listAfterDeleteRes.status).toBe(200);
    const listAfterDelete: Array<{ id: string }> = await listAfterDeleteRes.json();
    expect(listAfterDelete.some((t) => t.id === created.id)).toBe(false);
  }, 20000);

  it("handles the taxRelevant flag on create and update", async () => {
    const routes = await import("../app/api/transactions/route");
    const detailRoutes = await import("../app/api/transactions/[id]/route");

    // Default: ohne Feld → false
    const defaultRes = await routes.POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: testAccountId,
          amountCents: -900,
          description: "No tax flag",
          occurredAt: new Date().toISOString()
        })
      })
    );
    expect(defaultRes.status).toBe(201);
    const defaultTx: { id: string; taxRelevant: boolean } = await defaultRes.json();
    expect(defaultTx.taxRelevant).toBe(false);

    // Explizit true
    const res = await routes.POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: testAccountId,
          categoryId: testCategoryId,
          amountCents: -4200,
          description: "Tax relevant",
          occurredAt: new Date().toISOString(),
          taxRelevant: true
        })
      })
    );
    expect(res.status).toBe(201);
    const created: { id: string; taxRelevant: boolean; occurredAt: string } = await res.json();
    expect(created.taxRelevant).toBe(true);

    // PATCH ohne das Feld darf das Flag nicht zurücksetzen
    const patchWithoutFlag = await detailRoutes.PATCH(
      new Request(`http://localhost/api/transactions/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: testAccountId,
          amountCents: -4200,
          description: "Tax relevant edited",
          occurredAt: created.occurredAt
        })
      }),
      { params: { id: created.id } }
    );
    expect(patchWithoutFlag.status).toBe(200);
    const stillFlagged: { taxRelevant: boolean } = await patchWithoutFlag.json();
    expect(stillFlagged.taxRelevant).toBe(true);

    // PATCH mit false setzt zurück
    const patchRes = await detailRoutes.PATCH(
      new Request(`http://localhost/api/transactions/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: testAccountId,
          amountCents: -4200,
          description: "Tax relevant edited",
          occurredAt: created.occurredAt,
          taxRelevant: false
        })
      }),
      { params: { id: created.id } }
    );
    expect(patchRes.status).toBe(200);
    const unflagged: { taxRelevant: boolean } = await patchRes.json();
    expect(unflagged.taxRelevant).toBe(false);

    // GET-Liste enthält das Feld
    const listRes = await routes.GET();
    const list: Array<{ id: string; taxRelevant: boolean }> = await listRes.json();
    const match = list.find((t) => t.id === created.id);
    expect(match?.taxRelevant).toBe(false);
  }, 20000);

  it("inherits taxRelevant from a tax-relevant category on create", async () => {
    const routes = await import("../app/api/transactions/route");

    const taxCategory = await prisma.category.upsert({
      where: { userId_name: { userId: testUserId, name: "TX Tax Category" } },
      update: { isTaxRelevant: true },
      create: { name: "TX Tax Category", userId: testUserId, isTaxRelevant: true }
    });

    // Ohne Flag → erbt true von der Kategorie
    const inheritRes = await routes.POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: testAccountId,
          categoryId: taxCategory.id,
          amountCents: -1100,
          description: "Inherits tax flag",
          occurredAt: new Date().toISOString()
        })
      })
    );
    expect(inheritRes.status).toBe(201);
    const inherited: { taxRelevant: boolean } = await inheritRes.json();
    expect(inherited.taxRelevant).toBe(true);

    // Explizites false gewinnt gegen den Kategorie-Default
    const explicitRes = await routes.POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: testAccountId,
          categoryId: taxCategory.id,
          amountCents: -1200,
          description: "Explicitly not tax",
          occurredAt: new Date().toISOString(),
          taxRelevant: false
        })
      })
    );
    expect(explicitRes.status).toBe(201);
    const explicit: { taxRelevant: boolean } = await explicitRes.json();
    expect(explicit.taxRelevant).toBe(false);

    await prisma.transaction.deleteMany({ where: { categoryId: taxCategory.id } });
    await prisma.category.delete({ where: { id: taxCategory.id } });
  }, 20000);
});
