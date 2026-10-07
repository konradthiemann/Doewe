import type { CategoryYearMatrix, CategoryYearRow } from "@doewe/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// GET /api/analytics/category-year?year=2036 - category x month actuals with budget overruns.
// Fixture year 2036; recurring fixtures (YEARLY plan distribution) are created per test and removed
// afterwards, with future anchors so the cron test (books due recurring items globally) is unaffected.
const TEST_USER_ID = "test-user-analytics-category-year";
const OTHER_USER_ID = "test-user-analytics-category-year-other";
const ACCOUNT_ID = "acc_analytics_category_year";
const OTHER_ACCOUNT_ID = "acc_analytics_category_year_other";
const YEAR = 2036;
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let otherHouseholdId: string;
let foodId: string;
let salaryId: string;
let savingsId: string;
let idleId: string;
let otherCatId: string;

const req = (query = `year=${YEAR}`) => new Request(`http://localhost/api/analytics/category-year?${query}`);

async function getMatrix(query?: string): Promise<CategoryYearMatrix> {
  const { GET } = await import("../app/api/analytics/category-year/route");
  const res = await GET(req(query));
  expect(res.status).toBe(200);
  return (await res.json()) as CategoryYearMatrix;
}

const rowOf = (rows: CategoryYearRow[], id: string): CategoryYearRow | undefined => rows.find((r) => r.id === id);
const sum = (values: ReadonlyArray<number | null>) => values.reduce<number>((a, b) => a + (b ?? 0), 0);
const atMonth = (year: number, month: number, day = 10) => new Date(year, month - 1, day, 12);

async function book(categoryId: string | null, amountCents: number, month: number, opts: { year?: number; deletedAt?: Date } = {}) {
  await prisma.transaction.create({
    data: {
      accountId: ACCOUNT_ID,
      categoryId,
      amountCents,
      description: "CY test booking",
      occurredAt: atMonth(opts.year ?? YEAR, month),
      deletedAt: opts.deletedAt ?? null
    }
  });
}

async function clean() {
  await prisma.transaction.deleteMany({ where: { accountId: { in: [ACCOUNT_ID, OTHER_ACCOUNT_ID] } } });
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
  await prisma.budget.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: ACCOUNT_ID } } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  const user = await prisma.user.upsert({
    where: { email: "analytics-category-year-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "analytics-category-year-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id, "Analytics Category Year Household");
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: user.id, householdId },
    create: { id: ACCOUNT_ID, name: "CY Account", userId: user.id, householdId }
  });
  const mk = async (name: string, isIncome = false) =>
    (
      await prisma.category.upsert({
        where: { householdId_name: { householdId, name } },
        update: { isIncome },
        create: { name, userId: user.id, householdId, isIncome }
      })
    ).id;
  foodId = await mk("CY Food");
  salaryId = await mk("CY Salary", true);
  savingsId = await mk("Savings");
  idleId = await mk("CY Idle");

  const other = await prisma.user.upsert({
    where: { email: "analytics-category-year-test-other@example.com" },
    update: {},
    create: { id: OTHER_USER_ID, email: "analytics-category-year-test-other@example.com", password: "hashed" }
  });
  otherHouseholdId = await ensureTestHousehold(prisma, other.id, "Analytics Category Year Other Household");
  await prisma.account.upsert({
    where: { id: OTHER_ACCOUNT_ID },
    update: { userId: other.id, householdId: otherHouseholdId },
    create: { id: OTHER_ACCOUNT_ID, name: "CY Other Account", userId: other.id, householdId: otherHouseholdId }
  });
  otherCatId = (
    await prisma.category.upsert({
      where: { householdId_name: { householdId: otherHouseholdId, name: "CY Foreign" } },
      update: {},
      create: { name: "CY Foreign", userId: other.id, householdId: otherHouseholdId }
    })
  ).id;
});

beforeEach(clean);

afterEach(() => {
  process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;
});

afterAll(async () => {
  if (!prisma) return;
  await clean();
  await prisma.category.deleteMany({ where: { householdId: { in: [householdId, otherHouseholdId] } } });
  await prisma.account.deleteMany({ where: { id: { in: [ACCOUNT_ID, OTHER_ACCOUNT_ID] } } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await cleanupTestHousehold(prisma, OTHER_USER_ID);
  await prisma.user.deleteMany({ where: { id: { in: [TEST_USER_ID, OTHER_USER_ID] } } });
  await prisma.$disconnect();
});

describe("GET /api/analytics/category-year", () => {
  it("rejects unauthenticated requests with 401", async () => {
    process.env.TEST_USER_ID_BYPASS = "test-user-analytics-category-year-no-household";
    vi.resetModules();
    const { GET } = await import("../app/api/analytics/category-year/route");
    const res = await GET(req());
    expect(res.status).toBe(401);
    process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;
    vi.resetModules();
  }, 20000);

  it("rejects an invalid year with 400 and Invalid query", async () => {
    const { GET } = await import("../app/api/analytics/category-year/route");
    for (const q of ["year=abc", "year=1999", "year=2101", "year=2036.5"]) {
      const res = await GET(req(q));
      expect(res.status, q).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid query" });
    }
  });

  it("defaults to the current year without a year parameter", async () => {
    const m = await getMatrix("");
    expect(m.year).toBe(new Date().getFullYear());
  });

  it("returns an empty matrix for a year without data", async () => {
    const m = await getMatrix();
    expect(m.year).toBe(YEAR);
    expect(m.expenses.rows).toEqual([]);
    expect(m.income.rows).toEqual([]);
    expect(m.savings.rows).toEqual([]);
    expect(m.balanceMonthlyCents).toHaveLength(12);
    expect(m.balanceTotalCents).toBe(0);
  });

  it("sums expenses per category and local month as positive amounts", async () => {
    await book(foodId, -5000, 3);
    await book(foodId, -2500, 3);
    await book(foodId, -1000, 7);
    const row = rowOf((await getMatrix()).expenses.rows, foodId);
    expect(row).toMatchObject({ id: foodId, name: "CY Food", kind: "expense", totalCents: 8500 });
    expect(row!.monthlyCents[2]).toBe(7500);
    expect(row!.monthlyCents[6]).toBe(1000);
    expect(sum(row!.monthlyCents)).toBe(8500);
  });

  it("assigns bookings to the local month of occurredAt (first and last day)", async () => {
    await prisma.transaction.createMany({
      data: [
        { accountId: ACCOUNT_ID, categoryId: foodId, amountCents: -100, description: "CY first", occurredAt: new Date(YEAR, 0, 1, 0, 0, 0) },
        { accountId: ACCOUNT_ID, categoryId: foodId, amountCents: -200, description: "CY last", occurredAt: new Date(YEAR, 11, 31, 23, 59, 59) }
      ]
    });
    const row = rowOf((await getMatrix()).expenses.rows, foodId)!;
    expect(row.monthlyCents[0]).toBe(100);
    expect(row.monthlyCents[11]).toBe(200);
  });

  it("excludes soft-deleted bookings and bookings of other years", async () => {
    await book(foodId, -5000, 3);
    await book(foodId, -9999, 3, { deletedAt: new Date() });
    await book(foodId, -8888, 3, { year: YEAR - 1 });
    await book(foodId, -7777, 3, { year: YEAR + 1 });
    const row = rowOf((await getMatrix()).expenses.rows, foodId)!;
    expect(row.totalCents).toBe(5000);
  });

  it("puts the Savings category into the savings group (deposit positive, withdrawal reduces)", async () => {
    await book(savingsId, -20000, 1);
    await book(savingsId, 5000, 1);
    const m = await getMatrix();
    const row = rowOf(m.savings.rows, savingsId)!;
    expect(row).toMatchObject({ kind: "savings", totalCents: 15000 });
    expect(row.monthlyCents[0]).toBe(15000);
    expect(rowOf(m.expenses.rows, savingsId)).toBeUndefined();
    expect(rowOf(m.income.rows, savingsId)).toBeUndefined();
  });

  it("puts an isIncome category into the income group", async () => {
    await book(salaryId, 300000, 1);
    const m = await getMatrix();
    const row = rowOf(m.income.rows, salaryId)!;
    expect(row).toMatchObject({ kind: "income", totalCents: 300000 });
    expect(rowOf(m.expenses.rows, salaryId)).toBeUndefined();
  });

  it("computes the balance as income - expenses - savings", async () => {
    await book(salaryId, 300000, 1);
    await book(foodId, -50000, 1);
    await book(savingsId, -20000, 1);
    const m = await getMatrix();
    expect(m.balanceMonthlyCents[0]).toBe(230000);
    expect(m.balanceTotalCents).toBe(230000);
  });

  it("reports uncategorized expenses with id 'uncategorized'", async () => {
    await book(null, -1234, 5);
    const row = rowOf((await getMatrix()).expenses.rows, "uncategorized")!;
    expect(row).toMatchObject({ kind: "expense", totalCents: 1234 });
    expect(row.monthlyCents[4]).toBe(1234);
  });

  it("flags months over a MONTHLY plan via overMonths", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 10000 } });
    await book(foodId, -12000, 3); // over
    await book(foodId, -10000, 4); // exactly at budget
    await book(foodId, -3000, 5); // under
    const row = rowOf((await getMatrix()).expenses.rows, foodId)!;
    expect(row.overMonths).toEqual([3]);
    expect(row.budgetMonthlyCents).toEqual(Array.from({ length: 12 }, () => 10000));
    expect(row.budgetTotalCents).toBe(120000);
    expect(row.overYear).toBe(false);
  });

  it("flags overYear when the year spend exceeds the year budget", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 1000 } });
    for (let month = 1; month <= 12; month++) await book(foodId, -1100, month);
    const row = rowOf((await getMatrix()).expenses.rows, foodId)!;
    expect(row.overMonths).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(row.overYear).toBe(true);
  });

  it("distributes a YEARLY plan over months using the recurring fixtures of the year", async () => {
    await prisma.recurringTransaction.createMany({
      data: [
        { amountCents: 300000, description: "CY Gehalt", intervalMonths: 1 },
        { amountCents: -100000, description: "CY Miete", intervalMonths: 1 },
        { amountCents: -200000, description: "CY Versicherung", intervalMonths: 12 }
      ].map((i) => ({
        accountId: ACCOUNT_ID,
        amountCents: i.amountCents,
        description: i.description,
        frequency: "MONTHLY",
        intervalMonths: i.intervalMonths,
        dayOfMonth: 1,
        nextOccurrence: new Date(Date.UTC(YEAR, 0, 1, 12))
      }))
    });
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: foodId, period: "YEARLY", amountCents: 1200000 } });
    const row = rowOf((await getMatrix()).expenses.rows, foodId)!;
    expect(row.budgetMonthlyCents).toHaveLength(12);
    expect(sum(row.budgetMonthlyCents!)).toBe(1200000);
    expect(row.budgetTotalCents).toBe(1200000);
    // January has zero availability (insurance due), so it gets no budget share.
    expect(row.budgetMonthlyCents![0]).toBe(0);
    expect(row.budgetMonthlyCents![1]).toBeGreaterThan(0);
  });

  it("shows a category with a plan but no bookings as a budget-only row", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: idleId, period: "MONTHLY", amountCents: 5000 } });
    const row = rowOf((await getMatrix()).expenses.rows, idleId)!;
    expect(row).toMatchObject({ name: "CY Idle", totalCents: 0, budgetTotalCents: 60000, overMonths: [], overYear: false });
    expect(row.monthlyCents).toEqual(Array.from({ length: 12 }, () => 0));
  });

  it("does not leak bookings, categories or plans of another household", async () => {
    await prisma.transaction.create({
      data: {
        accountId: OTHER_ACCOUNT_ID,
        categoryId: otherCatId,
        amountCents: -4242,
        description: "CY foreign booking",
        occurredAt: atMonth(YEAR, 2)
      }
    });
    await prisma.categoryBudgetPlan.create({ data: { householdId: otherHouseholdId, categoryId: otherCatId, period: "MONTHLY", amountCents: 100 } });
    try {
      const m = await getMatrix();
      const all = [...m.expenses.rows, ...m.income.rows, ...m.savings.rows];
      expect(all.find((r) => r.id === otherCatId)).toBeUndefined();
      expect(all.find((r) => r.name === "CY Foreign")).toBeUndefined();
      expect(m.expenses.totalCents).toBe(0);
    } finally {
      await prisma.categoryBudgetPlan.deleteMany({ where: { householdId: otherHouseholdId } });
    }
  });
});
