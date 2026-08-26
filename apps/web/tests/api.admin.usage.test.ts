import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Integrationstests für GET /api/admin/usage (Bearer-Token-Auth, kein Session-Bypass nötig)

const SERVICE_TOKEN = "test-service-token-admin-usage";
process.env.DOEWE_SERVICE_TOKEN = SERVICE_TOKEN;

const OWNER_USER_ID = "test-user-admin-usage-owner";

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let testAccountId: string;

function authedRequest(url: string) {
  return new Request(url, { headers: { Authorization: `Bearer ${SERVICE_TOKEN}` } });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const owner = await prisma.user.upsert({
    where: { email: "admin-usage-owner@example.com" },
    update: {},
    create: { id: OWNER_USER_ID, email: "admin-usage-owner@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, owner.id, "Admin Usage Test Household");

  await prisma.receiptLineItem.deleteMany({ where: { transaction: { account: { householdId } } } });
  await prisma.transaction.deleteMany({ where: { account: { householdId } } });
  await prisma.account.deleteMany({ where: { householdId } });
  await prisma.loginEvent.deleteMany({ where: { userId: owner.id } });

  const account = await prisma.account.create({
    data: { id: "acc_admin_usage_test", name: "Admin Usage Test Account", userId: owner.id, householdId }
  });
  testAccountId = account.id;

  await prisma.loginEvent.create({ data: { userId: owner.id, householdId } });

  const tx = await prisma.transaction.create({
    data: { accountId: testAccountId, amountCents: -1000, description: "Heute gebucht", occurredAt: new Date() }
  });
  // Two line items on ONE transaction, created "today" — must count as ONE receipt scan.
  await prisma.receiptLineItem.create({
    data: { transactionId: tx.id, name: "Position 1", quantity: 1, unitPriceCents: 500, totalCents: 500, position: 0 }
  });
  await prisma.receiptLineItem.create({
    data: { transactionId: tx.id, name: "Position 2", quantity: 1, unitPriceCents: 500, totalCents: 500, position: 1 }
  });
});

afterAll(async () => {
  if (prisma) {
    await prisma.receiptLineItem.deleteMany({ where: { transaction: { accountId: testAccountId } } });
    await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
    await prisma.account.deleteMany({ where: { id: testAccountId } });
    await prisma.loginEvent.deleteMany({ where: { userId: OWNER_USER_ID } });
    await cleanupTestHousehold(prisma, OWNER_USER_ID);
    await prisma.user.deleteMany({ where: { id: OWNER_USER_ID } });
    await prisma.$disconnect();
  }
});

describe("GET /api/admin/usage", () => {
  it("rejects requests without a valid service token", async () => {
    const { GET } = await import("../app/api/admin/usage/route");

    const noAuth = await GET(new Request("http://localhost/api/admin/usage"));
    expect(noAuth.status).toBe(401);

    const wrongAuth = await GET(
      new Request("http://localhost/api/admin/usage", { headers: { Authorization: "Bearer wrong-token" } })
    );
    expect(wrongAuth.status).toBe(401);
  });

  it("rejects an out-of-range days parameter", async () => {
    const { GET } = await import("../app/api/admin/usage/route");
    const res = await GET(authedRequest("http://localhost/api/admin/usage?days=0"));
    expect(res.status).toBe(400);
  });

  it("defaults to 30 days when no query param is given", async () => {
    const { GET } = await import("../app/api/admin/usage/route");
    const res = await GET(authedRequest("http://localhost/api/admin/usage"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.days).toBe(30);
    expect(body.series).toHaveLength(30);
  });

  it("buckets today's logins/transactions/receipt-scans into the last day", async () => {
    const { GET } = await import("../app/api/admin/usage/route");
    const res = await GET(authedRequest("http://localhost/api/admin/usage?days=3"));
    expect(res.status).toBe(200);

    const body: { series: Array<{ date: string; logins: number; transactions: number; receiptScans: number }> } =
      await res.json();
    expect(body.series).toHaveLength(3);

    const todayKey = new Date().toISOString().slice(0, 10);
    const today = body.series.find((d) => d.date === todayKey);
    expect(today).toBeDefined();
    expect(today!.logins).toBeGreaterThanOrEqual(1);
    expect(today!.transactions).toBeGreaterThanOrEqual(1);
    expect(today!.receiptScans).toBeGreaterThanOrEqual(1);
  });
});
