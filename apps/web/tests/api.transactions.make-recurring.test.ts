import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Auth via TEST_USER_ID_BYPASS (see lib/auth.ts), same pattern as the other API tests.
const TEST_USER_ID = "test-user-make-recurring";
const OTHER_USER_ID = "test-user-make-recurring-other";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

const ACCOUNT_ID = "acc_make_recurring_test";
const OTHER_ACCOUNT_ID = "acc_make_recurring_other";
const CATEGORY_ID = "cat_make_recurring_test";

let prisma: import("@prisma/client").PrismaClient;

async function post(id: string, body: unknown): Promise<Response> {
  const { POST } = await import("../app/api/transactions/[id]/make-recurring/route");
  return POST(
    new Request(`http://localhost/api/transactions/${id}/make-recurring`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }),
    { params: { id } }
  );
}

async function createTx(data: { occurredAt: Date; amountCents?: number; deletedAt?: Date; accountId?: string }) {
  return prisma.transaction.create({
    data: {
      accountId: data.accountId ?? ACCOUNT_ID,
      categoryId: data.accountId ? undefined : CATEGORY_ID,
      amountCents: data.amountCents ?? -4999,
      description: "Make recurring source",
      occurredAt: data.occurredAt,
      deletedAt: data.deletedAt
    }
  });
}

async function cleanData() {
  await prisma.transaction.deleteMany({ where: { accountId: { in: [ACCOUNT_ID, OTHER_ACCOUNT_ID] } } });
  await prisma.recurringTransactionSkip.deleteMany({
    where: { recurring: { accountId: { in: [ACCOUNT_ID, OTHER_ACCOUNT_ID] } } }
  });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: { in: [ACCOUNT_ID, OTHER_ACCOUNT_ID] } } });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  for (const [id, email] of [
    [TEST_USER_ID, "make-recurring@example.com"],
    [OTHER_USER_ID, "make-recurring-other@example.com"]
  ]) {
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: { id, email, password: "hashed" }
    });
  }
  const householdId = await ensureTestHousehold(prisma, TEST_USER_ID);
  const otherHouseholdId = await ensureTestHousehold(prisma, OTHER_USER_ID);

  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: TEST_USER_ID, householdId },
    create: { id: ACCOUNT_ID, name: "Make Recurring Account", userId: TEST_USER_ID, householdId }
  });
  await prisma.account.upsert({
    where: { id: OTHER_ACCOUNT_ID },
    update: { userId: OTHER_USER_ID, householdId: otherHouseholdId },
    create: { id: OTHER_ACCOUNT_ID, name: "Other Account", userId: OTHER_USER_ID, householdId: otherHouseholdId }
  });
  await prisma.category.upsert({
    where: { id: CATEGORY_ID },
    update: { userId: TEST_USER_ID, householdId },
    create: { id: CATEGORY_ID, name: "Make Recurring Category", userId: TEST_USER_ID, householdId }
  });
  await cleanData();
});

afterAll(async () => {
  if (!prisma) return;
  await cleanData();
  await prisma.category.deleteMany({ where: { id: CATEGORY_ID } });
  await prisma.account.deleteMany({ where: { id: { in: [ACCOUNT_ID, OTHER_ACCOUNT_ID] } } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await cleanupTestHousehold(prisma, OTHER_USER_ID);
  await prisma.user.deleteMany({ where: { id: { in: [TEST_USER_ID, OTHER_USER_ID] } } });
  await prisma.$disconnect();
});

describe("POST /api/transactions/[id]/make-recurring", () => {
  it("creates a recurring from the booking, links it and returns 201", async () => {
    // 2035-08-31T22:30Z = 1 Sept 00:30 Europe/Berlin -> booking day 1, month September.
    const tx = await createTx({ occurredAt: new Date("2035-08-31T22:30:00Z") });

    const res = await post(tx.id, { intervalMonths: 1 });
    expect(res.status).toBe(201);
    const created: {
      id: string;
      amountCents: number;
      description: string;
      intervalMonths: number;
      dayOfMonth: number;
      nextOccurrence: string;
      categoryId: string;
      accountId: string;
    } = await res.json();

    expect(created.accountId).toBe(ACCOUNT_ID);
    expect(created.categoryId).toBe(CATEGORY_ID);
    expect(created.amountCents).toBe(-4999);
    expect(created.description).toBe("Make recurring source");
    expect(created.intervalMonths).toBe(1);
    expect(created.dayOfMonth).toBe(1);
    // Booking day 1 in September (Berlin) + 1 month -> 1 Oct 2035, local midnight.
    expect(new Date(created.nextOccurrence).getTime()).toBe(new Date(2035, 9, 1).getTime());

    const row = await prisma.recurringTransaction.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.frequency).toBe("MONTHLY");
    const linked = await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(linked.recurringTransactionId).toBe(created.id);
  }, 20000);

  it("uses an explicit dayOfMonth, clamped via addMonthsClamped, and keeps the sign", async () => {
    const tx = await createTx({ occurredAt: new Date(Date.UTC(2035, 0, 15, 12)), amountCents: 250000 });

    const res = await post(tx.id, { intervalMonths: 1, dayOfMonth: 31 });
    expect(res.status).toBe(201);
    const created: { amountCents: number; dayOfMonth: number; nextOccurrence: string } = await res.json();
    expect(created.amountCents).toBe(250000);
    expect(created.dayOfMonth).toBe(31);
    // 15 Jan + 1 month with dayOfMonth 31 -> clamped to 28 Feb 2035.
    expect(new Date(created.nextOccurrence).getTime()).toBe(new Date(2035, 1, 28).getTime());
  }, 20000);

  it.each([
    ["intervalMonths 0", { intervalMonths: 0 }],
    ["intervalMonths 25", { intervalMonths: 25 }],
    ["intervalMonths 1.5", { intervalMonths: 1.5 }],
    ["missing intervalMonths", {}],
    ["dayOfMonth 0", { intervalMonths: 1, dayOfMonth: 0 }],
    ["dayOfMonth 32", { intervalMonths: 1, dayOfMonth: 32 }]
  ])("returns 400 for %s", async (_label, body) => {
    const tx = await createTx({ occurredAt: new Date(Date.UTC(2035, 5, 10, 12)) });
    const before = await prisma.recurringTransaction.count({ where: { accountId: ACCOUNT_ID } });

    const res = await post(tx.id, body);
    expect(res.status).toBe(400);
    expect(await prisma.recurringTransaction.count({ where: { accountId: ACCOUNT_ID } })).toBe(before);
  }, 20000);

  it("returns 401 for unauthenticated requests", async () => {
    process.env.TEST_USER_ID_BYPASS = "test-user-make-recurring-no-household";
    vi.resetModules();
    const res = await post("whatever", { intervalMonths: 1 });
    expect(res.status).toBe(401);
    process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;
    vi.resetModules();
  }, 20000);

  it("returns 404 for a booking of another household", async () => {
    const foreign = await createTx({ occurredAt: new Date(Date.UTC(2035, 5, 10, 12)), accountId: OTHER_ACCOUNT_ID });
    const res = await post(foreign.id, { intervalMonths: 1 });
    expect(res.status).toBe(404);
    expect(await prisma.recurringTransaction.count({ where: { accountId: OTHER_ACCOUNT_ID } })).toBe(0);
  }, 20000);

  it("returns 404 for a soft-deleted booking", async () => {
    const deleted = await createTx({ occurredAt: new Date(Date.UTC(2035, 5, 10, 12)), deletedAt: new Date() });
    const res = await post(deleted.id, { intervalMonths: 1 });
    expect(res.status).toBe(404);
  }, 20000);

  it("returns 409 and creates nothing when the booking is already linked", async () => {
    const existing = await prisma.recurringTransaction.create({
      data: {
        accountId: ACCOUNT_ID,
        amountCents: -100,
        description: "Pre-existing",
        frequency: "MONTHLY",
        intervalMonths: 1,
        dayOfMonth: 5,
        nextOccurrence: new Date(2099, 0, 5)
      }
    });
    const tx = await createTx({ occurredAt: new Date(Date.UTC(2035, 5, 10, 12)) });
    await prisma.transaction.update({ where: { id: tx.id }, data: { recurringTransactionId: existing.id } });
    const before = await prisma.recurringTransaction.count({ where: { accountId: ACCOUNT_ID } });

    const res = await post(tx.id, { intervalMonths: 1 });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Transaction is already linked to a recurring transaction" });
    expect(await prisma.recurringTransaction.count({ where: { accountId: ACCOUNT_ID } })).toBe(before);
  }, 20000);

  it("returns 409 on a second call for the same booking without creating a second recurring", async () => {
    const tx = await createTx({ occurredAt: new Date(Date.UTC(2035, 5, 10, 12)) });
    const first = await post(tx.id, { intervalMonths: 3 });
    expect(first.status).toBe(201);
    const afterFirst = await prisma.recurringTransaction.count({ where: { accountId: ACCOUNT_ID } });

    const second = await post(tx.id, { intervalMonths: 3 });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "Transaction is already linked to a recurring transaction" });
    expect(await prisma.recurringTransaction.count({ where: { accountId: ACCOUNT_ID } })).toBe(afterFirst);
  }, 20000);

  describe("integration with the auto-booking run", () => {
    it("does not book the origin month again, but proposes exactly one booking in the next occurrence month", async () => {
      const tx = await createTx({ occurredAt: new Date(2035, 8, 10, 12) }); // 10 Sept 2035
      const res = await post(tx.id, { intervalMonths: 1, dayOfMonth: 10 });
      expect(res.status).toBe(201);
      const { id: recurringId }: { id: string } = await res.json();

      const { materializeDueRecurringTransactions } = await import("../lib/recurringBooking");

      const inOriginMonth = await materializeDueRecurringTransactions(new Date(2035, 8, 15), { dryRun: true });
      expect(inOriginMonth.filter((b) => b.recurringId === recurringId)).toHaveLength(0);

      const inNextMonth = await materializeDueRecurringTransactions(new Date(2035, 9, 15), { dryRun: true });
      const proposed = inNextMonth.filter((b) => b.recurringId === recurringId);
      expect(proposed).toHaveLength(1);
      expect(proposed[0]).toMatchObject({ year: 2035, month: 10 });
    }, 20000);
  });
});
