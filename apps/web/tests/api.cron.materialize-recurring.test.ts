import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { DEMO_ACCOUNT_ID } from "../lib/demoConstants";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

const TEST_USER_ID = "test-user-materialize";
const CRON_SECRET = "test-cron-secret-materialize";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;
process.env.CRON_SECRET = CRON_SECRET;

// Fixed instants and a pinned clock: the run must give the same result whether
// the process runs in UTC (production, CI) or in Europe/Berlin (dev machines).
//
// The clock is pinned to 2024 on purpose: the cron books globally, across all
// households of the shared test database. With "now" before every other test
// file's fixtures (anchored in 2026 or later), nothing of theirs is due here,
// so this file cannot book into the tests that run in parallel.
/** 19 Nov 2024, 11:00 in Berlin. */
const NOW = new Date("2024-11-19T10:00:00.000Z");
/** 1 Aug 2024 the way production stored anchors so far: UTC midnight. Three months back. */
const ANCHOR = new Date("2024-08-01T00:00:00.000Z");

function authedRequest(): Request {
  return new Request("http://localhost/api/cron/materialize-recurring", {
    method: "POST",
    headers: { authorization: `Bearer ${CRON_SECRET}` }
  });
}

let prisma: import("@prisma/client").PrismaClient;
let testUserId: string;
let testHouseholdId: string;
let testAccountId: string;
let recurringIncomeId: string;
let recurringExpenseId: string;
let recurringSkippedId: string;
let recurringAlreadyManuallyBookedId: string;
let manualRentId: string;
let recurringDemoId: string;

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "materialize-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "materialize-test@example.com", password: "hashed" }
  });
  testUserId = user.id;
  testHouseholdId = await ensureTestHousehold(prisma, user.id);

  const account = await prisma.account.upsert({
    where: { id: "acc_materialize_test" },
    update: { userId: user.id, householdId: testHouseholdId },
    create: { id: "acc_materialize_test", name: "Materialize Test Account", userId: user.id, householdId: testHouseholdId }
  });
  testAccountId = account.id;

  await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: testAccountId } } });
  await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: testAccountId } });

  // Anchor 3 months back, dayOfMonth=1: on 19 Nov the occurrences of Aug, Sep,
  // Oct and Nov are all due.
  const income = await prisma.recurringTransaction.create({
    data: {
      accountId: testAccountId,
      amountCents: 150000, // +1500€ monthly income
      description: "Recurring salary",
      frequency: "MONTHLY",
      intervalMonths: 1,
      dayOfMonth: 1,
      nextOccurrence: ANCHOR
    }
  });
  recurringIncomeId = income.id;

  const expense = await prisma.recurringTransaction.create({
    data: {
      accountId: testAccountId,
      amountCents: -8000, // -80€ monthly expense
      description: "Recurring subscription",
      frequency: "MONTHLY",
      intervalMonths: 1,
      dayOfMonth: 1,
      nextOccurrence: ANCHOR
    }
  });
  recurringExpenseId = expense.id;

  const skipped = await prisma.recurringTransaction.create({
    data: {
      accountId: testAccountId,
      amountCents: -3000, // -30€ monthly, but skipped this month
      description: "Recurring, skipped this month",
      frequency: "MONTHLY",
      intervalMonths: 1,
      dayOfMonth: 1,
      nextOccurrence: ANCHOR
    }
  });
  recurringSkippedId = skipped.id;
  await prisma.recurringTransactionSkip.create({ data: { recurringId: skipped.id, year: 2024, month: 11 } });

  // A payment entered by hand has no recurringTransactionId. The run recognises
  // it as November's occurrence (same account and amount, no category and the
  // same description ignoring case and whitespace, within 7 days of the due
  // day) and adopts it instead of booking November a second time.
  const rentRecurring = await prisma.recurringTransaction.create({
    data: {
      accountId: testAccountId,
      amountCents: -12000, // -120€
      description: "Rent",
      frequency: "MONTHLY",
      intervalMonths: 1,
      dayOfMonth: 1,
      nextOccurrence: ANCHOR
    }
  });
  recurringAlreadyManuallyBookedId = rentRecurring.id;
  manualRentId = (
    await prisma.transaction.create({
      data: {
        accountId: testAccountId,
        amountCents: -12000,
        description: " rent ",
        // 2 Nov 2024, 09:15 in Berlin — the day after the due day
        occurredAt: new Date("2024-11-02T08:15:00.000Z")
        // no recurringTransactionId — entered by hand
      }
    })
  ).id;

  // The public demo account (re-seeded by /api/demo/seed) must never get real
  // bookings from this cron — same exclusion convention as admin/usage/route.ts.
  await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: DEMO_ACCOUNT_ID } } });
  await prisma.transaction.deleteMany({ where: { accountId: DEMO_ACCOUNT_ID, recurringTransactionId: { not: null } } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: DEMO_ACCOUNT_ID, description: "TEST_DEMO_RECURRING" } });
  const demoRecurring = await prisma.recurringTransaction.create({
    data: {
      accountId: DEMO_ACCOUNT_ID,
      amountCents: -999,
      description: "TEST_DEMO_RECURRING",
      frequency: "MONTHLY",
      intervalMonths: 1,
      dayOfMonth: 1,
      nextOccurrence: ANCHOR
    }
  });
  recurringDemoId = demoRecurring.id;

  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterAll(async () => {
  vi.useRealTimers();
  if (prisma) {
    await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
    await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: testAccountId } } });
    await prisma.recurringTransaction.deleteMany({ where: { accountId: testAccountId } });
    await prisma.transaction.deleteMany({ where: { recurringTransactionId: recurringDemoId } });
    await prisma.recurringTransaction.deleteMany({ where: { id: recurringDemoId } });
    await prisma.account.deleteMany({ where: { id: testAccountId } });
    await cleanupTestHousehold(prisma, testUserId);
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
  }
});

describe("POST /api/cron/materialize-recurring", () => {
  it("rejects requests without a valid cron secret", async () => {
    const routes = await import("../app/api/cron/materialize-recurring/route");
    const res = await routes.POST(new Request("http://localhost/api/cron/materialize-recurring", { method: "POST" }));
    expect(res.status).toBe(401);
  }, 30000);

  it("dry-run lists what would be booked without creating any transactions", async () => {
    const routes = await import("../app/api/cron/materialize-recurring/route");
    const res = await routes.POST(
      new Request("http://localhost/api/cron/materialize-recurring?dryRun=true", {
        method: "POST",
        headers: { authorization: `Bearer ${CRON_SECRET}` }
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dryRun).toBe(true);
    expect(data.occurrences.every((o: { transactionId: string | null }) => o.transactionId === null)).toBe(true);

    // The cron runs globally across all accounts, so filter down to this
    // test's own recurring IDs — other test files' fixtures share the DB.
    const ownIds = new Set([recurringIncomeId, recurringExpenseId, recurringSkippedId, recurringAlreadyManuallyBookedId]);
    const ownOccurrences = data.occurrences.filter((o: { recurringId: string }) => ownIds.has(o.recurringId));
    // 4 each for income + expense + rent, 3 for the skipped one.
    expect(ownOccurrences).toHaveLength(15);

    const income = await prisma.transaction.findMany({ where: { recurringTransactionId: recurringIncomeId } });
    expect(income).toHaveLength(0); // nothing actually written yet
  }, 30000);

  it("dry-run reports a payment entered by hand as adopted instead of as a new booking, and links nothing", async () => {
    const routes = await import("../app/api/cron/materialize-recurring/route");
    const res = await routes.POST(
      new Request("http://localhost/api/cron/materialize-recurring?dryRun=true", {
        method: "POST",
        headers: { authorization: `Bearer ${CRON_SECRET}` }
      })
    );
    const data = await res.json();
    const rentOccurrences = data.occurrences.filter(
      (o: { recurringId: string }) => o.recurringId === recurringAlreadyManuallyBookedId
    );
    // Aug, Sep and Oct would be booked; November's payment is already there.
    expect(rentOccurrences.map((o: { month: number; adopted: boolean }) => [o.month, o.adopted])).toEqual([
      [8, false],
      [9, false],
      [10, false],
      [11, true]
    ]);
    expect(data.adopted).toBeGreaterThanOrEqual(1);

    const manual = await prisma.transaction.findUniqueOrThrow({ where: { id: manualRentId } });
    expect(manual.recurringTransactionId).toBeNull();
    expect(manual.recurringPeriod).toBeNull();
  }, 30000);

  it("backfills every missed month (anchor to now) as real transactions in one run", async () => {
    const routes = await import("../app/api/cron/materialize-recurring/route");
    const res = await routes.POST(authedRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // 3 months back + the current month = 4 occurrences per recurring transaction,
    // minus the 1 skipped occurrence for the skipped recurring.
    const byPeriod = { orderBy: { recurringPeriod: "asc" } } as const;
    const income = await prisma.transaction.findMany({ where: { recurringTransactionId: recurringIncomeId }, ...byPeriod });
    const expense = await prisma.transaction.findMany({ where: { recurringTransactionId: recurringExpenseId }, ...byPeriod });
    const skippedTxs = await prisma.transaction.findMany({ where: { recurringTransactionId: recurringSkippedId }, ...byPeriod });

    expect(income).toHaveLength(4);
    expect(expense).toHaveLength(4);
    expect(skippedTxs).toHaveLength(3); // one fewer — this month is skipped

    expect(income.every((t) => t.amountCents === 150000)).toBe(true);
    expect(expense.every((t) => t.amountCents === -8000)).toBe(true);

    // Each booking records the month it was booked for and is dated at noon in
    // Berlin on the due day (10:00 UTC in summer time, 11:00 UTC in winter time).
    expect(income.map((t) => t.recurringPeriod)).toEqual(["2024-08", "2024-09", "2024-10", "2024-11"]);
    expect(income.map((t) => t.occurredAt.toISOString())).toEqual([
      "2024-08-01T10:00:00.000Z",
      "2024-09-01T10:00:00.000Z",
      "2024-10-01T10:00:00.000Z",
      "2024-11-01T11:00:00.000Z"
    ]);
    expect(skippedTxs.map((t) => t.recurringPeriod)).toEqual(["2024-08", "2024-09", "2024-10"]);

    // The rent entered by hand on 2 November stands for November's occurrence:
    // it is linked, not booked a second time, and the response says so.
    const rent = await prisma.transaction.findMany({
      where: { recurringTransactionId: recurringAlreadyManuallyBookedId },
      ...byPeriod
    });
    expect(rent.map((t) => t.recurringPeriod)).toEqual(["2024-08", "2024-09", "2024-10", "2024-11"]);
    expect(rent[3].id).toBe(manualRentId);
    expect(rent[3].description).toBe(" rent ");
    expect(rent[3].occurredAt.toISOString()).toBe("2024-11-02T08:15:00.000Z");
    expect(await prisma.transaction.count({ where: { accountId: testAccountId, amountCents: -12000 } })).toBe(4);

    const rentOccurrences = data.occurrences.filter(
      (o: { recurringId: string }) => o.recurringId === recurringAlreadyManuallyBookedId
    );
    expect(
      rentOccurrences.map((o: { month: number; adopted: boolean; transactionId: string }) => [
        o.month,
        o.adopted,
        o.transactionId === manualRentId
      ])
    ).toEqual([
      [8, false, false],
      [9, false, false],
      [10, false, false],
      [11, true, true]
    ]);
    expect(data.adopted).toBe(data.occurrences.filter((o: { adopted: boolean }) => o.adopted).length);
    expect(data.booked).toBe(data.occurrences.length);

    // The public demo account is reseeded on every /api/demo/seed call and must
    // never receive real bookings from this cron (same exclusion convention as
    // admin/usage/route.ts). Scoped to our own fixture recurring — the demo
    // account legitimately holds ~1400 unrelated seeded transactions already.
    const demoBooked = await prisma.transaction.findMany({ where: { recurringTransactionId: recurringDemoId } });
    expect(demoBooked).toHaveLength(0);
  }, 30000);

  it("is idempotent — a second run creates no additional transactions", async () => {
    const routes = await import("../app/api/cron/materialize-recurring/route");
    await routes.POST(authedRequest());
    const res = await routes.POST(authedRequest());
    const data = await res.json();
    // The cron runs globally; other test files create due recurring rows in
    // parallel, so only this file's own recurring IDs must stay unbooked.
    const ownIds = new Set([recurringIncomeId, recurringExpenseId, recurringSkippedId, recurringAlreadyManuallyBookedId]);
    const ownBooked = data.occurrences.filter((o: { recurringId: string }) => ownIds.has(o.recurringId));
    expect(ownBooked).toHaveLength(0);

    const income = await prisma.transaction.findMany({ where: { recurringTransactionId: recurringIncomeId } });
    expect(income).toHaveLength(4);
  }, 30000);

  it("no longer double-counts the booked recurring transaction as still-planned in the analytics summary", async () => {
    process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;
    const summaryRoutes = await import("../app/api/analytics/summary/route");
    const res = await summaryRoutes.GET();
    const data = await res.json();

    // Booked amounts now show up as real income/outcome for this month...
    expect(data.incomeTotal).toBeGreaterThanOrEqual(1500);
    expect(data.outcomeTotal).toBeGreaterThanOrEqual(80);

    // ...and are no longer also counted as "still planned" recurring totals,
    // which would double-count them in projectedIncomeTotal/projectedOutcomeTotal.
    const stillPlannedIncome = data.recurringTransactions.some((r: { id: string }) => r.id === recurringIncomeId);
    const stillPlannedExpense = data.recurringTransactions.some((r: { id: string }) => r.id === recurringExpenseId);
    expect(stillPlannedIncome).toBe(false);
    expect(stillPlannedExpense).toBe(false);
  }, 30000);

  it("does not book a deleted occurrence again", async () => {
    const november = await prisma.transaction.findFirstOrThrow({
      where: { recurringTransactionId: recurringExpenseId, recurringPeriod: "2024-11" }
    });
    // Soft delete, as DELETE /api/transactions/[id] does.
    await prisma.transaction.update({ where: { id: november.id }, data: { deletedAt: NOW } });

    const routes = await import("../app/api/cron/materialize-recurring/route");
    const data = await (await routes.POST(authedRequest())).json();
    expect(data.occurrences.filter((o: { recurringId: string }) => o.recurringId === recurringExpenseId)).toEqual([]);
    expect(await prisma.transaction.count({ where: { recurringTransactionId: recurringExpenseId } })).toBe(4);
  }, 30000);

  // Last on purpose: it moves the clock into December, which makes the
  // December occurrences of the fixtures above due as well.
  it("decides what is due by the Berlin calendar day of the run, not the UTC day", async () => {
    const routes = await import("../app/api/cron/materialize-recurring/route");
    const insurance = await prisma.recurringTransaction.create({
      data: {
        accountId: testAccountId,
        amountCents: -4500,
        description: "Insurance from December",
        frequency: "MONTHLY",
        intervalMonths: 1,
        dayOfMonth: 1,
        nextOccurrence: new Date("2024-12-01T11:00:00.000Z")
      }
    });
    const ownOccurrences = async () => {
      const data = await (await routes.POST(authedRequest())).json();
      return data.occurrences
        .filter((o: { recurringId: string }) => o.recurringId === insurance.id)
        .map((o: { year: number; month: number }) => [o.year, o.month]);
    };

    try {
      // 30 Nov 23:30 in Berlin: December has not begun.
      vi.setSystemTime(new Date("2024-11-30T22:30:00.000Z"));
      expect(await ownOccurrences()).toEqual([]);

      // 1 Dec 00:30 in Berlin — still 30 Nov in UTC.
      vi.setSystemTime(new Date("2024-11-30T23:30:00.000Z"));
      expect(await ownOccurrences()).toEqual([[2024, 12]]);
    } finally {
      vi.setSystemTime(NOW);
    }

    const booked = await prisma.transaction.findMany({ where: { recurringTransactionId: insurance.id } });
    expect(booked.map((t) => [t.recurringPeriod, t.occurredAt.toISOString()])).toEqual([
      ["2024-12", "2024-12-01T11:00:00.000Z"]
    ]);
  }, 30000);
});
