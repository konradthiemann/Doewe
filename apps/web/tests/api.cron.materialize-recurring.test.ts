import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEMO_ACCOUNT_ID } from "../lib/demoConstants";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

const TEST_USER_ID = "test-user-materialize";
const CRON_SECRET = "test-cron-secret-materialize";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;
process.env.CRON_SECRET = CRON_SECRET;

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

  const now = new Date();
  // Anchor 3 months back, dayOfMonth=1 so "today" always qualifies as due,
  // regardless of which day of the month the test suite runs on.
  const anchor = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  const income = await prisma.recurringTransaction.create({
    data: {
      accountId: testAccountId,
      amountCents: 150000, // +1500€ monthly income
      description: "Recurring salary",
      frequency: "MONTHLY",
      intervalMonths: 1,
      dayOfMonth: 1,
      nextOccurrence: anchor
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
      nextOccurrence: anchor
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
      nextOccurrence: anchor
    }
  });
  recurringSkippedId = skipped.id;
  await prisma.recurringTransactionSkip.create({
    data: { recurringId: skipped.id, year: now.getFullYear(), month: now.getMonth() + 1 }
  });

  // Documents a known limitation: a transaction booked by hand BEFORE this
  // feature existed has no recurringTransactionId, so it is invisible to the
  // "already booked?" check. Rolling this out on real data therefore needs a
  // dry-run reviewed by a human first — see the dry-run test above.
  const rentRecurring = await prisma.recurringTransaction.create({
    data: {
      accountId: testAccountId,
      amountCents: -12000, // -120€
      description: "Rent",
      frequency: "MONTHLY",
      intervalMonths: 1,
      dayOfMonth: 1,
      nextOccurrence: anchor
    }
  });
  recurringAlreadyManuallyBookedId = rentRecurring.id;
  await prisma.transaction.create({
    data: {
      accountId: testAccountId,
      amountCents: -12000,
      description: "Rent (booked by hand)",
      occurredAt: new Date(now.getFullYear(), now.getMonth(), 1)
      // no recurringTransactionId — this is the pre-existing-data case
    }
  });

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
      nextOccurrence: anchor
    }
  });
  recurringDemoId = demoRecurring.id;
});

afterAll(async () => {
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

  it("KNOWN LIMITATION: a pre-existing manual booking with no recurringTransactionId link is not recognized as already booked", async () => {
    // This is exactly why the dry-run above must be reviewed by a human before
    // the real run on production data: "Rent" was already booked by hand this
    // month (no recurringTransactionId), yet the recurring "Rent" template
    // still shows up as due — running for real here would double-book it.
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
    expect(rentOccurrences).toHaveLength(4); // still lists all 4 — including the already-manually-booked month
  }, 30000);

  it("backfills every missed month (anchor to now) as real transactions in one run", async () => {
    const routes = await import("../app/api/cron/materialize-recurring/route");
    const res = await routes.POST(authedRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // 3 months back + the current month = 4 occurrences per recurring transaction,
    // minus the 1 skipped occurrence for the skipped recurring.
    const income = await prisma.transaction.findMany({ where: { recurringTransactionId: recurringIncomeId } });
    const expense = await prisma.transaction.findMany({ where: { recurringTransactionId: recurringExpenseId } });
    const skippedTxs = await prisma.transaction.findMany({ where: { recurringTransactionId: recurringSkippedId } });

    expect(income).toHaveLength(4);
    expect(expense).toHaveLength(4);
    expect(skippedTxs).toHaveLength(3); // one fewer — this month is skipped

    expect(income.every((t) => t.amountCents === 150000)).toBe(true);
    expect(expense.every((t) => t.amountCents === -8000)).toBe(true);

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
    expect(data.booked).toBe(0);

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
});
