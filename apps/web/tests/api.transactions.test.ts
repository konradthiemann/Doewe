import { execSync } from "node:child_process";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Point Prisma to the test database (Postgres in CI, or fall back to local default)
const appDir = path.resolve(__dirname, "..");
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/doewe?schema=public";
}

const TEST_USER_ID = "test-user";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

// Prepare the test database schema
beforeAll(() => {
  execSync("npx prisma generate", { cwd: appDir, stdio: "inherit", env: process.env });
  execSync("npx prisma db push --force-reset", { cwd: appDir, stdio: "inherit", env: process.env });
});

afterAll(() => {
  // nothing for now; could delete test db file if desired
});

describe("/api/transactions", () => {
  it("creates, updates, and lists transactions", async () => {
    // Seed minimal account & category directly via PrismaClient
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const user = await prisma.user.create({
      data: { id: TEST_USER_ID, email: "test@example.com", password: "hashed" }
    });
    const account = await prisma.account.create({ data: { name: "Test Account", userId: user.id } });
    const category = await prisma.category.create({ data: { name: "Test Category", userId: user.id } });

    // Import route after env + schema are ready
    const routes = await import("../app/api/transactions/route");
    const detailRoutes = await import("../app/api/transactions/[id]/route");

    const body = {
      accountId: account.id,
      categoryId: category.id,
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
      accountId: account.id,
      categoryId: category.id,
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

    await prisma.$disconnect();
  }, 20000);
});
