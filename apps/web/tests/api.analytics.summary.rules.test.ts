import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// GET /api/analytics/summary against docs/calculations/00-grundregeln.md: the
// Berlin calendar, "planned" vs. "booked" recurring occurrences, household
// scope and the fixed-cost base. Fixed UTC instants and a pinned "now", so the
// result is the same in any process time zone (run with TZ=UTC as well).

const TEST_USER_ID = "test-user-analytics-summary-rules";
const ACCOUNT_ID = "acc_analytics_summary_rules";
const SECOND_ACCOUNT_ID = "acc_analytics_summary_rules_second";
const ACCOUNT_IDS = [ACCOUNT_ID, SECOND_ACCOUNT_ID];
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

/** 19 Nov 2031, 11:00 in Berlin. */
const NOW = new Date("2031-11-19T10:00:00.000Z");
/** Noon in Berlin on a day of November 2031 (CET = UTC+1). */
const nov = (day: number) => new Date(Date.UTC(2031, 10, day, 11));

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let foodId: string;
let savingsId: string;
let sparenId: string;

type Summary = {
  totalBalance: number;
  carryoverFromLastMonth: number;
  incomeTotal: number;
  outcomeTotal: number;
  monthlySavingsActual: number;
  plannedSavings: number;
  completedGoals: Array<{ title: string }>;
  completedGoalsSpent: number;
  projectedIncomeTotal: number;
  projectedOutcomeTotal: number;
  projectedSavingsTotal: number;
  outgoingByCategory: Array<{ id: string; name: string; amount: number }>;
  categoryBudgets: Array<{ categoryId: string; budget: number; spent: number; diff: number }>;
  recurringTransactions: Array<{ id: string }>;
  recurringIncomeTotal: number;
  recurringOutcomeTotal: number;
  recurringPlannedSavings: number;
  recurringDueIncomeTotal: number;
  recurringDueOutcomeTotal: number;
  recurringDueCount: number;
  daily: { labels: string[]; income: number[]; outcome: number[]; savings: number[] };
};

async function summary(): Promise<Summary> {
  const { GET } = await import("../app/api/analytics/summary/route");
  const res = await GET();
  expect(res.status).toBe(200);
  return (await res.json()) as Summary;
}

async function template(
  description: string,
  amountCents: number,
  extra: { categoryId?: string; anchor?: Date; dayOfMonth?: number; intervalMonths?: number; accountId?: string } = {}
): Promise<string> {
  const row = await prisma.recurringTransaction.create({
    data: {
      accountId: extra.accountId ?? ACCOUNT_ID,
      amountCents,
      description,
      frequency: "MONTHLY",
      intervalMonths: extra.intervalMonths ?? 1,
      dayOfMonth: extra.dayOfMonth ?? 25,
      nextOccurrence: extra.anchor ?? nov(extra.dayOfMonth ?? 25),
      categoryId: extra.categoryId ?? null
    }
  });
  return row.id;
}

async function booking(
  amountCents: number,
  occurredAt: Date,
  extra: {
    categoryId?: string;
    accountId?: string;
    recurringTransactionId?: string;
    recurringPeriod?: string;
    deletedAt?: Date;
  } = {}
): Promise<void> {
  await prisma.transaction.create({
    data: { accountId: ACCOUNT_ID, amountCents, description: "SR booking", occurredAt, ...extra }
  });
}

async function clean() {
  await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: { in: ACCOUNT_IDS } } } });
  await prisma.transaction.deleteMany({ where: { accountId: { in: ACCOUNT_IDS } } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: { in: ACCOUNT_IDS } } });
  await prisma.budget.deleteMany({ where: { accountId: { in: ACCOUNT_IDS } } });
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "analytics-summary-rules-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "analytics-summary-rules-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id);
  for (const id of ACCOUNT_IDS) {
    await prisma.account.upsert({
      where: { id },
      update: { userId: user.id, householdId, deletedAt: null },
      create: { id, name: id, userId: user.id, householdId }
    });
  }
  const mk = async (name: string) =>
    (
      await prisma.category.upsert({
        where: { householdId_name: { householdId, name } },
        update: { deletedAt: null },
        create: { name, userId: user.id, householdId }
      })
    ).id;
  foodId = await mk("SR Food");
  savingsId = await mk("Savings");
  // A second savings category with stray whitespace: both count as savings.
  sparenId = await mk(" Sparen ");

  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

beforeEach(clean);

afterEach(() => {
  vi.setSystemTime(NOW);
});

afterAll(async () => {
  vi.useRealTimers();
  await clean();
  await prisma.category.deleteMany({ where: { householdId } });
  await prisma.account.deleteMany({ where: { id: { in: ACCOUNT_IDS } } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.$disconnect();
});

describe("planned vs. booked recurring occurrences", () => {
  it("treats a template as booked once a booking for this month's period exists — moved or deleted", async () => {
    const live = await template("live", -10_000);
    const moved = await template("moved", -20_000);
    const deleted = await template("deleted", -30_000);
    const open = await template("open", -40_000);

    await booking(-10_000, nov(25), { recurringTransactionId: live, recurringPeriod: "2031-11" });
    // The user moved November's booking back into October: November stays booked.
    await booking(-20_000, new Date("2031-10-30T11:00:00.000Z"), {
      recurringTransactionId: moved,
      recurringPeriod: "2031-11"
    });
    // The user deleted November's booking: it must not be planned again.
    await booking(-30_000, nov(25), {
      recurringTransactionId: deleted,
      recurringPeriod: "2031-11",
      deletedAt: nov(26)
    });

    const data = await summary();
    expect(data.recurringTransactions.map((r) => r.id)).toEqual([open]);
    expect(data.recurringOutcomeTotal).toBe(400);
    expect(data.outcomeTotal).toBe(100); // only the live November booking
    expect(data.projectedOutcomeTotal).toBe(500);
    expect(data.carryoverFromLastMonth).toBe(-200); // the moved booking now belongs to October
  });

  it("does not take another period's booking that was moved into this month for this month's occurrence", async () => {
    // October's occurrence, paid late: dated 2 November, booked for 2031-10.
    const rent = await template("rent", -50_000, { anchor: new Date("2031-10-01T10:00:00.000Z"), dayOfMonth: 25 });
    await booking(-50_000, nov(2), { recurringTransactionId: rent, recurringPeriod: "2031-10" });

    const data = await summary();
    expect(data.recurringTransactions.map((r) => r.id)).toEqual([rent]);
    expect(data.outcomeTotal).toBe(500);
    expect(data.projectedOutcomeTotal).toBe(1000);
  });

  it("recognises a booking written before recurringPeriod existed by the Berlin month of its date", async () => {
    const phone = await template("phone", -2_000, { anchor: new Date("2031-10-31T23:00:00.000Z"), dayOfMonth: 1 });
    // 1 Nov 00:00 in Berlin — still 31 Oct in UTC
    await booking(-2_000, new Date("2031-10-31T23:00:00.000Z"), { recurringTransactionId: phone });

    const data = await summary();
    expect(data.recurringTransactions).toEqual([]);
    expect(data.outcomeTotal).toBe(20);
    expect(data.projectedOutcomeTotal).toBe(20);
  });

  it("reads the anchor month of a template in Berlin", async () => {
    // Every two months from 1 Dec 00:30 in Berlin (23:30 UTC on 30 Nov): not due in November.
    await template("from december", -1_000, { anchor: new Date("2031-11-30T23:30:00.000Z"), intervalMonths: 2 });
    // Every two months from 1 Nov 00:30 in Berlin (23:30 UTC on 31 Oct): due in November.
    const fromNovember = await template("from november", -2_000, {
      anchor: new Date("2031-10-31T23:30:00.000Z"),
      intervalMonths: 2
    });

    const data = await summary();
    expect(data.recurringTransactions.map((r) => r.id)).toEqual([fromNovember]);
    expect(data.recurringOutcomeTotal).toBe(20);
  });

  it("puts a planned recurring expense without a category into the uncategorized bucket", async () => {
    await template("uncategorized standing order", -12_300);
    await template("food box", -4_000, { categoryId: foodId });
    await booking(-1_000, nov(3));
    await booking(-2_500, nov(4), { categoryId: foodId });

    const data = await summary();
    const byId = Object.fromEntries(data.outgoingByCategory.map((c) => [c.id, c.amount]));
    expect(byId).toEqual({ uncategorized: 133, [foodId]: 65 });
    // The doughnut adds up to the projected outcome shown next to it.
    const doughnutCents = data.outgoingByCategory.reduce((sum, c) => sum + Math.round(c.amount * 100), 0);
    expect(doughnutCents).toBe(Math.round(data.projectedOutcomeTotal * 100));
    expect(data.projectedOutcomeTotal).toBe(198);
  });
});

describe("fixed-cost base: everything due this month, booked or not", () => {
  it("keeps recurringDue* constant while the planned totals shrink as occurrences get booked", async () => {
    const salary = await template("salary", 300_000, { dayOfMonth: 1 });
    const rent = await template("rent", -90_000, { dayOfMonth: 1 });
    await template("gym", -3_000);
    await template("etf", -20_000, { categoryId: sparenId });
    const skipped = await template("skipped", -5_000);
    await prisma.recurringTransactionSkip.create({ data: { recurringId: skipped, year: 2031, month: 11 } });
    // Not due in November at all.
    await template("yearly, due in december", -60_000, {
      anchor: new Date("2031-12-10T11:00:00.000Z"),
      intervalMonths: 12
    });

    const before = await summary();
    expect(before.recurringDueIncomeTotal).toBe(3000);
    expect(before.recurringDueOutcomeTotal).toBe(930); // rent + gym; savings and skipped excluded
    expect(before.recurringDueCount).toBe(4); // salary, rent, gym, etf
    expect(before.recurringIncomeTotal).toBe(3000);
    expect(before.recurringOutcomeTotal).toBe(930);
    expect(before.recurringPlannedSavings).toBe(200);
    expect(before.recurringTransactions).toHaveLength(4);

    await booking(300_000, nov(1), { recurringTransactionId: salary, recurringPeriod: "2031-11" });
    await booking(-90_000, nov(1), { recurringTransactionId: rent, recurringPeriod: "2031-11" });

    const after = await summary();
    expect(after.recurringDueIncomeTotal).toBe(3000);
    expect(after.recurringDueOutcomeTotal).toBe(930);
    expect(after.recurringDueCount).toBe(4);
    expect(after.recurringIncomeTotal).toBe(0);
    expect(after.recurringOutcomeTotal).toBe(30);
    expect(after.recurringTransactions).toHaveLength(2);
    // Booking an occurrence moves it from "planned" to "booked"; the projection does not change.
    expect(after.projectedIncomeTotal).toBe(before.projectedIncomeTotal);
    expect(after.projectedOutcomeTotal).toBe(before.projectedOutcomeTotal);
    expect(after.projectedSavingsTotal).toBe(before.projectedSavingsTotal);
  });
});

describe("household scope and savings categories", () => {
  it("covers every account of the household and every savings category", async () => {
    await booking(100_000, nov(2));
    await booking(-7_000, nov(3), { categoryId: foodId, accountId: SECOND_ACCOUNT_ID });
    await booking(-20_000, nov(4), { categoryId: savingsId });
    await booking(-5_000, nov(5), { categoryId: sparenId, accountId: SECOND_ACCOUNT_ID });
    await booking(3_000, nov(6), { categoryId: sparenId }); // withdrawal: not income
    await booking(-4_000, new Date("2031-10-15T10:00:00.000Z"), { accountId: SECOND_ACCOUNT_ID });
    await template("second account standing order", -1_500, { accountId: SECOND_ACCOUNT_ID, categoryId: foodId });

    const data = await summary();
    expect(data.incomeTotal).toBe(1000);
    expect(data.outcomeTotal).toBe(70);
    expect(data.monthlySavingsActual).toBe(220);
    expect(data.carryoverFromLastMonth).toBe(-40);
    expect(data.totalBalance).toBe(670); // -40 + 1000 - 70 - 200 - 50 + 30
    expect(data.recurringOutcomeTotal).toBe(15);
    expect(data.outgoingByCategory).toEqual([{ id: foodId, name: "SR Food", amount: 85 }]);
  });

  it("reads saving goals and legacy category budgets of every account", async () => {
    await prisma.budget.createMany({
      data: [
        { accountId: ACCOUNT_ID, categoryId: null, title: "Goal A", month: 11, year: 2031, amountCents: 20_000 },
        { accountId: SECOND_ACCOUNT_ID, categoryId: null, title: "Goal B", month: 11, year: 2031, amountCents: 10_000 },
        { accountId: SECOND_ACCOUNT_ID, categoryId: foodId, month: 11, year: 2031, amountCents: 30_000 }
      ]
    });
    await booking(-12_000, nov(3), { categoryId: foodId });
    await booking(-1_000, nov(4), { categoryId: foodId, accountId: SECOND_ACCOUNT_ID });
    await booking(2_000, nov(5), { categoryId: foodId }); // refund: income, does not reduce the spend

    const data = await summary();
    expect(data.plannedSavings).toBe(300);
    expect(data.categoryBudgets).toEqual([
      expect.objectContaining({ categoryId: foodId, budget: 300, spent: 130, diff: -170 })
    ]);
  });
});

describe("Berlin calendar", () => {
  it("counts saving goals completed in the Berlin month", async () => {
    await prisma.budget.createMany({
      data: [
        // 31 Oct 23:30 in Berlin: October
        { accountId: ACCOUNT_ID, categoryId: null, title: "October", completedAt: new Date("2031-10-31T22:30:00.000Z"), spentCents: 1_000 },
        // 1 Nov 00:30 in Berlin — still 31 Oct in UTC
        { accountId: ACCOUNT_ID, categoryId: null, title: "First minutes", completedAt: new Date("2031-10-31T23:30:00.000Z"), spentCents: 2_000 },
        // 30 Nov 23:30 in Berlin
        { accountId: SECOND_ACCOUNT_ID, categoryId: null, title: "Last minutes", completedAt: new Date("2031-11-30T22:30:00.000Z"), spentCents: 4_000 },
        // 1 Dec 00:30 in Berlin — still 30 Nov in UTC
        { accountId: ACCOUNT_ID, categoryId: null, title: "December", completedAt: new Date("2031-11-30T23:30:00.000Z"), spentCents: 8_000 }
      ]
    });

    const data = await summary();
    expect(data.completedGoals.map((g) => g.title)).toEqual(["First minutes", "Last minutes"]);
    expect(data.completedGoalsSpent).toBe(60);
  });

  it("indexes the daily series by the Berlin day of the booking and the template's day of month", async () => {
    // 1 Nov 00:00:30 in Berlin — still 31 Oct in UTC: day 1
    await booking(-1_000, new Date("2031-10-31T23:00:30.000Z"));
    // 2 Nov 00:30 in Berlin — still 1 Nov in UTC: day 2
    await booking(-2_000, new Date("2031-11-01T23:30:00.000Z"));
    // 30 Nov 23:30 in Berlin: day 30
    await booking(50_000, new Date("2031-11-30T22:30:00.000Z"));
    // day 31 does not exist in November: planned on the last day
    await template("end of month", -4_000, { dayOfMonth: 31, anchor: nov(30) });

    const data = await summary();
    expect(data.daily.labels).toHaveLength(30);
    expect(data.daily.outcome[0]).toBe(10);
    expect(data.daily.outcome[1]).toBe(30);
    expect(data.daily.outcome[28]).toBe(30);
    expect(data.daily.outcome[29]).toBe(70);
    expect(data.daily.income[28]).toBe(0);
    expect(data.daily.income[29]).toBe(500);
  });

  it("starts the savings line of the daily series from the savings of all categories and accounts before the month", async () => {
    await booking(-30_000, new Date("2031-10-10T10:00:00.000Z"), { categoryId: savingsId });
    await booking(-5_000, new Date("2031-10-11T10:00:00.000Z"), { categoryId: sparenId, accountId: SECOND_ACCOUNT_ID });
    await booking(-1_000, nov(10), { categoryId: sparenId });

    const data = await summary();
    expect(data.daily.savings[0]).toBe(350);
    expect(data.daily.savings[9]).toBe(360);
  });
});
