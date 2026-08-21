import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

const TEST_USER_ID = "test-user-batch";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

let prisma: import("@prisma/client").PrismaClient;
let testUserId: string;
let testHouseholdId: string;
let testAccountId: string;
let testCategoryId1: string;
let testCategoryId2: string;

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "batch-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "batch-test@example.com", password: "hashed" }
  });
  testUserId = user.id;
  testHouseholdId = await ensureTestHousehold(prisma, user.id);

  const account = await prisma.account.upsert({
    where: { id: "acc_batch_test" },
    update: { userId: user.id, householdId: testHouseholdId },
    create: {
      id: "acc_batch_test",
      name: "Batch Test Account",
      userId: user.id,
      householdId: testHouseholdId
    }
  });
  testAccountId = account.id;

  const cat1 = await prisma.category.upsert({
    where: { householdId_name: { householdId: testHouseholdId, name: "Batch Groceries" } },
    update: {},
    create: { name: "Batch Groceries", userId: user.id, householdId: testHouseholdId }
  });
  testCategoryId1 = cat1.id;

  const cat2 = await prisma.category.upsert({
    where: { householdId_name: { householdId: testHouseholdId, name: "Batch Gifts" } },
    update: {},
    create: { name: "Batch Gifts", userId: user.id, householdId: testHouseholdId }
  });
  testCategoryId2 = cat2.id;
});

afterAll(async () => {
  if (prisma) {
    await prisma.receiptLineItem.deleteMany({
      where: { transaction: { accountId: testAccountId } }
    });
    await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
    await prisma.category.deleteMany({
      where: { id: { in: [testCategoryId1, testCategoryId2] } }
    });
    await prisma.account.deleteMany({ where: { id: testAccountId } });
    await cleanupTestHousehold(prisma, testUserId);
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
  }
});

describe("/api/transactions/batch", () => {
  it("creates grouped transactions with line items", async () => {
    const routes = await import("../app/api/transactions/batch/route");

    const body = {
      receiptDate: "2026-08-19",
      receiptMerchant: "REWE",
      accountId: testAccountId,
      taxRelevant: false,
      groups: [
        {
          categoryId: testCategoryId1,
          items: [
            { name: "Milch", quantity: 1, unitPriceCents: 149, totalCents: 149, position: 1 },
            { name: "Brot", quantity: 1, unitPriceCents: 349, totalCents: 349, position: 2 }
          ]
        },
        {
          categoryId: testCategoryId2,
          items: [
            { name: "Schokolade", quantity: 1, unitPriceCents: 299, totalCents: 299, position: 3 }
          ]
        }
      ]
    };

    const req = new Request("http://localhost/api/transactions/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const res = await routes.POST(req);
    expect(res.status).toBe(201);

    const result = await res.json();
    expect(result.transactions).toHaveLength(2);

    // First group: Groceries (Milch + Brot = 498 cents)
    const groceries = result.transactions.find(
      (t: { categoryId: string }) => t.categoryId === testCategoryId1
    );
    expect(groceries).toBeDefined();
    expect(groceries.amountCents).toBe(-498);
    expect(groceries.lineItemCount).toBe(2);

    // Second group: Gifts (Schokolade = 299 cents)
    const gifts = result.transactions.find(
      (t: { categoryId: string }) => t.categoryId === testCategoryId2
    );
    expect(gifts).toBeDefined();
    expect(gifts.amountCents).toBe(-299);
    expect(gifts.lineItemCount).toBe(1);

    // Verify line items were created in DB
    const lineItems = await prisma.receiptLineItem.findMany({
      where: {
        transactionId: {
          in: result.transactions.map((t: { id: string }) => t.id)
        }
      },
      orderBy: { position: "asc" }
    });
    expect(lineItems).toHaveLength(3);
    expect(lineItems[0].name).toBe("Milch");
    expect(lineItems[1].name).toBe("Brot");
    expect(lineItems[2].name).toBe("Schokolade");

    // Verify receiptMerchant was stored
    const tx = await prisma.transaction.findUnique({
      where: { id: groceries.id }
    });
    expect(tx?.receiptMerchant).toBe("REWE");
  });

  it("rejects invalid account", async () => {
    const routes = await import("../app/api/transactions/batch/route");

    const body = {
      receiptDate: "2026-08-19",
      accountId: "nonexistent",
      groups: [
        {
          categoryId: testCategoryId1,
          items: [
            { name: "X", quantity: 1, unitPriceCents: 100, totalCents: 100, position: 0 }
          ]
        }
      ]
    };

    const req = new Request("http://localhost/api/transactions/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const res = await routes.POST(req);
    expect(res.status).toBe(404);
  });

  it("rejects empty groups", async () => {
    const routes = await import("../app/api/transactions/batch/route");

    const body = {
      receiptDate: "2026-08-19",
      accountId: testAccountId,
      groups: []
    };

    const req = new Request("http://localhost/api/transactions/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const res = await routes.POST(req);
    expect(res.status).toBe(400);
  });

  it("accepts fractional quantities for weight-priced items", async () => {
    const routes = await import("../app/api/transactions/batch/route");

    const body = {
      receiptDate: "2026-08-19",
      accountId: testAccountId,
      groups: [
        {
          categoryId: testCategoryId1,
          items: [
            { name: "Assam Tee (0.100kg)", quantity: 0.1, unitPriceCents: 6800, totalCents: 680, position: 0 }
          ]
        }
      ]
    };

    const req = new Request("http://localhost/api/transactions/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const res = await routes.POST(req);
    expect(res.status).toBe(201);

    const result = await res.json();
    const lineItem = await prisma.receiptLineItem.findFirst({
      where: { transactionId: result.transactions[0].id }
    });
    expect(lineItem?.quantity).toBeCloseTo(0.1);
  });

  it("returns a plain string error message on validation failure", async () => {
    const routes = await import("../app/api/transactions/batch/route");

    const body = {
      receiptDate: "2026-08-19",
      accountId: testAccountId,
      groups: []
    };

    const req = new Request("http://localhost/api/transactions/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const res = await routes.POST(req);
    const result = await res.json();
    expect(typeof result.error).toBe("string");
  });
});
