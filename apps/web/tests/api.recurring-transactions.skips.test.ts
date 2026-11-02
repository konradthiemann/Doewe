import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Skipping a month of a recurring transaction ("Überspringen"). Regression for
// production schema drift: the skip table had an integer serial id there, so
// every POST failed with Postgres 22P03 — see migration
// 20261102210000_fix_recurring_skip_id_type.

const TEST_USER_ID = "test-user-recurring-skips";
const ACCOUNT_ID = "acc_recurring_skips_test";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

let prisma: import("@prisma/client").PrismaClient;
let recurringId: string;

function skipRequest(method: "POST" | "DELETE", body: unknown): Request {
  return new Request("http://localhost/api/recurring-transactions/skips", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "recurring-skips-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "recurring-skips-test@example.com", password: "hashed" }
  });
  const householdId = await ensureTestHousehold(prisma, user.id);
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: user.id, householdId },
    create: { id: ACCOUNT_ID, name: "Recurring Skips Test", userId: user.id, householdId }
  });
  await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: ACCOUNT_ID } } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: ACCOUNT_ID } });

  recurringId = (
    await prisma.recurringTransaction.create({
      data: {
        accountId: ACCOUNT_ID,
        amountCents: -400,
        description: "Club subscription",
        frequency: "MONTHLY",
        intervalMonths: 1,
        dayOfMonth: 23,
        nextOccurrence: new Date(2026, 9, 23)
      }
    })
  ).id;
});

afterAll(async () => {
  if (prisma) {
    await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: ACCOUNT_ID } } });
    await prisma.recurringTransaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
    await prisma.account.deleteMany({ where: { id: ACCOUNT_ID } });
    await cleanupTestHousehold(prisma, TEST_USER_ID);
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.$disconnect();
  }
});

describe("/api/recurring-transactions/skips", () => {
  it("skips a month and lists it for that month", async () => {
    const { POST, GET } = await import("../app/api/recurring-transactions/skips/route");
    const res = await POST(skipRequest("POST", { recurringId, year: 2026, month: 10 }));
    expect(res.status).toBe(201);

    const list = await GET(new Request("http://localhost/api/recurring-transactions/skips?year=2026&month=10"));
    const items = (await list.json()) as Array<{ recurringId: string }>;
    expect(items.map((s) => s.recurringId)).toContain(recurringId);
  }, 30000);

  it("is idempotent when the same month is skipped twice", async () => {
    const { POST } = await import("../app/api/recurring-transactions/skips/route");
    const res = await POST(skipRequest("POST", { recurringId, year: 2026, month: 10 }));
    expect(res.status).toBe(201);
    expect(await prisma.recurringTransactionSkip.count({ where: { recurringId, year: 2026, month: 10 } })).toBe(1);
  }, 30000);

  it("un-skips a month again", async () => {
    const { DELETE } = await import("../app/api/recurring-transactions/skips/route");
    const res = await DELETE(skipRequest("DELETE", { recurringId, year: 2026, month: 10 }));
    expect(res.status).toBe(204);
    expect(await prisma.recurringTransactionSkip.count({ where: { recurringId, year: 2026, month: 10 } })).toBe(0);
  }, 30000);
});
