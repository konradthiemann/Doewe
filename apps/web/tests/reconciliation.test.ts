import {
  filterTransactions,
  listTotals,
  monthDayRange,
  savingsCategoryIds,
  type ListRow
} from "@doewe/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Acceptance test for docs/calculations/00-grundregeln.md §6: every screen
// derives its figures from the same bookings by the same rules, so they have
// to agree with each other and with the transaction list filtered to the same
// month. All fixtures are fixed UTC instants and "now" is pinned, so the suite
// gives the same answer in any process time zone (run it with TZ=UTC as well).

const TEST_USER_ID = "test-user-reconciliation";
const ACCOUNT_ID = "acc_reconciliation_main";
const SECOND_ACCOUNT_ID = "acc_reconciliation_second";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

/** 19 Nov 2026, 11:00 in Berlin. */
const NOW = new Date("2026-11-19T10:00:00.000Z");

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let savingsIds: Set<string>;
const cat: Record<"food" | "rent" | "salary" | "savings" | "sparen", string> = {
  food: "",
  rent: "",
  salary: "",
  savings: "",
  sparen: ""
};

type Review = {
  prevMonth: { month: number; year: number; incomeCents: number; outcomeCents: number; savingsCents: number } | null;
  month: number;
  year: number;
  incomeCents: number;
  outcomeCents: number;
  savingsCents: number;
  balanceAtStartCents: number;
  balanceAtEndCents: number;
  categories: Array<{ id: string; spentCents: number; transactionCount: number; transactions: Array<{ amountCents: number }> }>;
  incomeCategories: Array<{ id: string; amountCents: number }>;
};
type Quarterly = {
  quarters: Array<{
    month: number;
    year: number;
    incomeCents: number;
    outcomeCents: number;
    savingsCents: number;
    balanceCents: number;
  }>;
};
type Summary = {
  totalBalance: number;
  carryoverFromLastMonth: number;
  incomeTotal: number;
  outcomeTotal: number;
  monthlySavingsActual: number;
};
type YearGroup = { rows: Array<{ id: string; monthlyCents: number[] }>; monthlyTotalsCents: number[] };
type YearMatrix = { income: YearGroup; expenses: YearGroup; savings: YearGroup; balanceMonthlyCents: number[] };

const cents = (euros: number) => Math.round(euros * 100);

async function review(month?: number, year?: number): Promise<Review> {
  const { GET } = await import("../app/api/analytics/monthly-review/route");
  const query = month ? `?month=${month}&year=${year}` : "";
  const res = await GET(new Request(`http://localhost/api/analytics/monthly-review${query}`));
  expect(res.status).toBe(200);
  return (await res.json()) as Review;
}

async function quarterly(): Promise<Quarterly> {
  const { GET } = await import("../app/api/analytics/quarterly/route");
  const res = await GET();
  expect(res.status).toBe(200);
  return (await res.json()) as Quarterly;
}

async function summary(): Promise<Summary> {
  const { GET } = await import("../app/api/analytics/summary/route");
  const res = await GET();
  expect(res.status).toBe(200);
  return (await res.json()) as Summary;
}

async function categoryYear(year: number): Promise<YearMatrix> {
  const { GET } = await import("../app/api/analytics/category-year/route");
  const res = await GET(new Request(`http://localhost/api/analytics/category-year?year=${year}`));
  expect(res.status).toBe(200);
  return (await res.json()) as YearMatrix;
}

/**
 * What the transaction list shows for a month: apps/web/app/transactions/page.tsx
 * filters with filterTransactions and totals with listTotals (its component
 * test, app/transactions/transactions.test.tsx, covers the wiring).
 */
async function listFor(month: number, year: number) {
  const { GET } = await import("../app/api/transactions/route");
  const res = await GET();
  expect(res.status).toBe(200);
  const rows = (await res.json()) as Array<ListRow & { id: string }>;
  return listTotals(filterTransactions(rows, monthDayRange({ year, month }), savingsIds), savingsIds);
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "reconciliation-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "reconciliation-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id);

  // Two accounts in one household: analytics cover the household, like the list.
  for (const [id, createdAt] of [
    [ACCOUNT_ID, new Date("2025-01-01T00:00:00.000Z")],
    [SECOND_ACCOUNT_ID, new Date("2025-06-01T00:00:00.000Z")]
  ] as const) {
    await prisma.account.upsert({
      where: { id },
      update: { userId: user.id, householdId, deletedAt: null },
      create: { id, name: id, userId: user.id, householdId, createdAt }
    });
  }

  for (const accountId of [ACCOUNT_ID, SECOND_ACCOUNT_ID]) {
    await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId } } });
    await prisma.transaction.deleteMany({ where: { accountId } });
    await prisma.recurringTransaction.deleteMany({ where: { accountId } });
    await prisma.budget.deleteMany({ where: { accountId } });
  }
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
  await prisma.category.deleteMany({ where: { householdId } });

  const mk = async (name: string, isIncome = false) =>
    (await prisma.category.create({ data: { name, isIncome, userId: user.id, householdId } })).id;
  cat.food = await mk("RC Food");
  cat.rent = await mk("RC Rent");
  cat.salary = await mk("RC Salary", true);
  cat.savings = await mk("Savings");
  // A second savings category, with stray whitespace: both count as savings.
  cat.sparen = await mk(" Sparen ");
  savingsIds = savingsCategoryIds(
    await prisma.category.findMany({ where: { householdId }, select: { id: true, name: true } })
  );

  const t = (
    amountCents: number,
    description: string,
    occurredAt: string,
    categoryId: string | null,
    extra: { accountId?: string; deletedAt?: Date } = {}
  ) => ({ accountId: ACCOUNT_ID, amountCents, description, occurredAt: new Date(occurredAt), categoryId, ...extra });

  await prisma.transaction.createMany({
    data: [
      // ── September 2026 ────────────────────────────────────────────────
      t(250_000, "sep salary", "2026-09-01T10:00:00.000Z", cat.salary),
      t(-90_000, "sep rent", "2026-09-01T10:00:00.000Z", cat.rent),
      // 30 Sep 23:59 in Berlin
      t(-1_000, "sep last minute", "2026-09-30T21:59:00.000Z", cat.food),

      // ── October 2026 ──────────────────────────────────────────────────
      // 1 Oct 00:00:30 in Berlin — still 30 Sep in UTC
      t(-900, "oct first minute", "2026-09-30T22:00:30.000Z", cat.food),
      t(300_000, "oct salary", "2026-10-01T10:00:00.000Z", cat.salary),
      // stored at UTC midnight, as older auto-bookings and imports are
      t(-90_000, "oct rent", "2026-10-01T00:00:00.000Z", cat.rent),
      t(-20_000, "oct deposit", "2026-10-15T10:00:00.000Z", cat.savings),
      t(-5_000, "oct deposit 2nd savings category", "2026-10-16T10:00:00.000Z", cat.sparen),
      t(3_000, "oct withdrawal", "2026-10-20T10:00:00.000Z", cat.savings),
      // refund: income, does not reduce the category's spend
      t(2_000, "oct refund", "2026-10-21T10:00:00.000Z", cat.food),
      // negative amount in an income category: an outcome
      t(-50, "oct salary correction", "2026-10-22T10:00:00.000Z", cat.salary),
      t(-4_999, "oct uncategorized, last day", "2026-10-31T11:00:00.000Z", null),
      // 31 Oct 23:45 in Berlin
      t(-1_250, "oct last evening", "2026-10-31T22:45:00.000Z", cat.food),
      t(-7_000, "oct second account", "2026-10-10T10:00:00.000Z", cat.food, { accountId: SECOND_ACCOUNT_ID }),
      t(-9_999, "oct deleted", "2026-10-12T10:00:00.000Z", cat.food, { deletedAt: new Date("2026-10-13T10:00:00.000Z") }),

      // ── November 2026 (current month) ─────────────────────────────────
      // 1 Nov 00:00:30 in Berlin — still 31 Oct in UTC
      t(-1_200, "nov first minute", "2026-10-31T23:00:30.000Z", cat.food),
      t(300_000, "nov salary", "2026-11-02T10:00:00.000Z", cat.salary),
      t(-10_000, "nov deposit", "2026-11-05T10:00:00.000Z", cat.savings),

      // ── December 2026 (future) ────────────────────────────────────────
      // 1 Dec 00:10 in Berlin — still 30 Nov in UTC
      t(-800, "dec first minutes", "2026-11-30T23:10:00.000Z", cat.food),
      t(-90_000, "dec rent, pre-entered", "2026-12-03T10:00:00.000Z", cat.rent)
    ]
  });

  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterEach(() => {
  vi.setSystemTime(NOW);
});

afterAll(async () => {
  vi.useRealTimers();
  for (const accountId of [ACCOUNT_ID, SECOND_ACCOUNT_ID]) {
    await prisma.transaction.deleteMany({ where: { accountId } });
    await prisma.budget.deleteMany({ where: { accountId } });
  }
  await prisma.category.deleteMany({ where: { householdId } });
  await prisma.account.deleteMany({ where: { id: { in: [ACCOUNT_ID, SECOND_ACCOUNT_ID] } } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.$disconnect();
});

describe("review of a month = transaction list filtered to that month", () => {
  it("October 2026 matches the hand-calculated figures", async () => {
    const r = await review(10, 2026);
    expect(r.incomeCents).toBe(302_000); // salary + refund
    expect(r.outcomeCents).toBe(104_199); // 900 + 90,000 + 50 + 4,999 + 1,250 + 7,000 (2nd account)
    expect(r.savingsCents).toBe(22_000); // 20,000 + 5,000 − 3,000
  });

  it.each([
    [9, 2026],
    [10, 2026]
  ])("month %i/%i: income, outcome and savings equal the filtered list", async (month, year) => {
    const [r, list] = await Promise.all([review(month, year), listFor(month, year)]);
    expect(r.incomeCents).toBe(list.incomeCents);
    expect(r.outcomeCents).toBe(list.outcomeCents);
    expect(r.savingsCents).toBe(list.savingsCents);
    expect(r.incomeCents - r.outcomeCents - r.savingsCents).toBe(list.netCents);
  });

  it("the review's category rows and expanded bookings add up to its outcome", async () => {
    const r = await review(10, 2026);
    const byCategory = r.categories.reduce((sum, c) => sum + c.spentCents, 0);
    const byBooking = r.categories.reduce(
      (sum, c) => sum + c.transactions.reduce((s, tx) => s + tx.amountCents, 0),
      0
    );
    expect(byCategory).toBe(r.outcomeCents);
    expect(byBooking).toBe(r.outcomeCents);
    expect(r.incomeCategories.reduce((sum, c) => sum + c.amountCents, 0)).toBe(r.incomeCents);
  });

  it("does not count savings rows of any savings category as outcome", async () => {
    const r = await review(10, 2026);
    expect(r.categories.some((c) => c.id === cat.savings || c.id === cat.sparen)).toBe(false);
  });
});

describe("balances chain from month to month", () => {
  it("end of a month = start of the next = dashboard carryover", async () => {
    const [sep, oct, dash] = await Promise.all([review(9, 2026), review(10, 2026), summary()]);
    expect(sep.balanceAtStartCents).toBe(0);
    expect(sep.balanceAtEndCents).toBe(159_000);
    expect(oct.balanceAtStartCents).toBe(sep.balanceAtEndCents);
    expect(oct.balanceAtEndCents).toBe(334_801);
    expect(cents(dash.carryoverFromLastMonth)).toBe(oct.balanceAtEndCents);
  });

  it("the account balance covers bookings up to the end of the current month, not pre-entered later ones", async () => {
    const dash = await summary();
    // 334,801 + 300,000 − 1,200 − 10,000; the two December rows are excluded
    expect(cents(dash.totalBalance)).toBe(623_601);
  });
});

describe("quarterly overview = the three reviews / the list", () => {
  it("shows September and October exactly as their reviews do", async () => {
    const [q, sep, oct] = await Promise.all([quarterly(), review(9, 2026), review(10, 2026)]);
    expect(q.quarters.map((x) => `${x.year}-${x.month}`)).toEqual(["2026-9", "2026-10", "2026-11"]);
    for (const [column, r] of [
      [q.quarters[0], sep],
      [q.quarters[1], oct]
    ] as const) {
      expect(column.incomeCents).toBe(r.incomeCents);
      expect(column.outcomeCents).toBe(r.outcomeCents);
      expect(column.savingsCents).toBe(r.savingsCents);
      expect(column.balanceCents).toBe(r.balanceAtEndCents);
    }
  });

  it("shows the current month as the list does", async () => {
    const [q, list, dash] = await Promise.all([quarterly(), listFor(11, 2026), summary()]);
    const nov = q.quarters[2];
    expect(nov.incomeCents).toBe(300_000);
    expect(nov.outcomeCents).toBe(1_200);
    expect(nov.savingsCents).toBe(10_000);
    expect(nov).toMatchObject({
      incomeCents: list.incomeCents,
      outcomeCents: list.outcomeCents,
      savingsCents: list.savingsCents
    });
    expect(nov.balanceCents).toBe(cents(dash.totalBalance));
  });
});

describe("dashboard (current month, nothing planned) = the list", () => {
  it("booked income, outcome and savings equal the filtered list", async () => {
    const [dash, list] = await Promise.all([summary(), listFor(11, 2026)]);
    expect(cents(dash.incomeTotal)).toBe(list.incomeCents);
    expect(cents(dash.outcomeTotal)).toBe(list.outcomeCents);
    expect(cents(dash.monthlySavingsActual)).toBe(list.savingsCents);
  });
});

describe("yearly category table = the monthly reviews", () => {
  it("group totals of a month equal that month's review", async () => {
    const [matrix, sep, oct] = await Promise.all([categoryYear(2026), review(9, 2026), review(10, 2026)]);
    for (const [index, r] of [
      [8, sep],
      [9, oct]
    ] as const) {
      expect(matrix.income.monthlyTotalsCents[index]).toBe(r.incomeCents);
      expect(matrix.expenses.monthlyTotalsCents[index]).toBe(r.outcomeCents);
      expect(matrix.savings.monthlyTotalsCents[index]).toBe(r.savingsCents);
      expect(matrix.balanceMonthlyCents[index]).toBe(r.incomeCents - r.outcomeCents - r.savingsCents);
    }
  });

  it("classifies by sign: a refund is income, a negative row in an income category an expense", async () => {
    const matrix = await categoryYear(2026);
    const foodAsIncome = matrix.income.rows.find((row) => row.id === cat.food);
    const foodAsExpense = matrix.expenses.rows.find((row) => row.id === cat.food);
    const salaryAsExpense = matrix.expenses.rows.find((row) => row.id === cat.salary);
    expect(foodAsIncome?.monthlyCents[9]).toBe(2_000);
    expect(foodAsExpense?.monthlyCents[9]).toBe(9_150); // 900 + 1,250 + 7,000, gross
    expect(salaryAsExpense?.monthlyCents[9]).toBe(50);
  });
});

describe("the month changes at midnight in Berlin", () => {
  it("at 00:30 on 1 December (23:30 UTC on 30 November) the dashboard shows December", async () => {
    vi.setSystemTime(new Date("2026-11-30T23:30:00.000Z"));
    const dash = await summary();
    expect(cents(dash.carryoverFromLastMonth)).toBe(623_601);
    expect(cents(dash.outcomeTotal)).toBe(90_800); // both December rows
    expect(cents(dash.incomeTotal)).toBe(0);
  });

  it("at that moment the review's default month is November and can be opened", async () => {
    vi.setSystemTime(new Date("2026-11-30T23:30:00.000Z"));
    const r = await review();
    expect([r.month, r.year]).toEqual([11, 2026]);
    expect(r.outcomeCents).toBe(1_200);
    expect(r.balanceAtEndCents).toBe(623_601);
  });

  it("at that moment the quarterly overview ends with December", async () => {
    vi.setSystemTime(new Date("2026-11-30T23:30:00.000Z"));
    const q = await quarterly();
    expect(q.quarters.map((x) => `${x.year}-${x.month}`)).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(q.quarters[2].outcomeCents).toBe(90_800);
  });

  it("the review's comparison with the previous month uses that month's Berlin boundaries", async () => {
    vi.setSystemTime(new Date("2026-11-30T23:30:00.000Z"));
    const [nov, oct] = await Promise.all([review(11, 2026), review(10, 2026)]);
    // includes the row at 00:00:30 on 1 October, which is still September in UTC
    expect(nov.prevMonth).toMatchObject({
      month: 10,
      year: 2026,
      incomeCents: oct.incomeCents,
      outcomeCents: 104_199,
      savingsCents: oct.savingsCents
    });
  });

  it("one hour earlier (23:30 in Berlin on 30 November) it is still November", async () => {
    vi.setSystemTime(new Date("2026-11-30T22:30:00.000Z"));
    const [dash, r] = await Promise.all([summary(), review()]);
    expect(cents(dash.carryoverFromLastMonth)).toBe(334_801);
    expect([r.month, r.year]).toEqual([10, 2026]);
  });
});
