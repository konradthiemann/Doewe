import { smoothedAvailablePerMonth, planMonthlyCents } from "@doewe/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { loadEffectiveCategoryBudgets, loadEffectiveCategoryBudgetsForYear } from "../lib/categoryBudgets";
import { loadRecurringYearMatrix } from "../lib/recurringYear";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// DB test for loadEffectiveCategoryBudgetsForYear. Recurring fixtures live in 2036 with
// anchors in the future so the cron test (books all due items globally) is unaffected.
// Legacy Budget rows are read for every account of the household (SECOND_ACCOUNT_ID).
// The clock is pinned. For the first block it stands in 2035, so every month of 2036 is still
// to come and is computed live; the second block moves it into 2036 and beyond, where the
// months that are over come from their snapshots (BudgetMonthSnapshot).
const USER_ID = "test-user-category-budgets-year";
const ACCOUNT_ID = "acc_category_budgets_year";
const SECOND_ACCOUNT_ID = "acc_category_budgets_year_second";
const ACCOUNT_IDS = [ACCOUNT_ID, SECOND_ACCOUNT_ID];
const YEAR = 2036;
/** 15 Jun 2035, 12:00 in Berlin: all of 2036 is in the future. */
const BEFORE_THE_YEAR = new Date("2035-06-15T10:00:00.000Z");
/** 15 Jun 2036, 12:00 in Berlin: January to May are over, June is the current month. */
const MID_YEAR = new Date("2036-06-15T10:00:00.000Z");

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let foodId: string;
let hobbyId: string;
let travelId: string;
let quietId: string;

const load = () => loadEffectiveCategoryBudgetsForYear({ householdId, year: YEAR });
const sum = (values: ReadonlyArray<number | null>) => values.reduce<number>((a, b) => a + (b ?? 0), 0);

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  const user = await prisma.user.upsert({
    where: { email: "category-budgets-year-test@example.com" },
    update: {},
    create: { id: USER_ID, email: "category-budgets-year-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id, "Category Budgets Year Household");
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: user.id, householdId },
    create: { id: ACCOUNT_ID, name: "Category Budgets Year Account", userId: user.id, householdId }
  });
  await prisma.account.upsert({
    where: { id: SECOND_ACCOUNT_ID },
    update: { userId: user.id, householdId },
    create: { id: SECOND_ACCOUNT_ID, name: "Category Budgets Year Second Account", userId: user.id, householdId }
  });
  const mk = async (name: string) =>
    (
      await prisma.category.upsert({
        where: { householdId_name: { householdId, name } },
        update: { deletedAt: null },
        create: { name, userId: user.id, householdId }
      })
    ).id;
  foodId = await mk("CBY Food");
  hobbyId = await mk("CBY Hobby");
  travelId = await mk("CBY Travel");
  quietId = await mk("CBY Quiet");

  await prisma.recurringTransaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  const anchor = new Date(Date.UTC(YEAR, 0, 1, 12));
  await prisma.recurringTransaction.createMany({
    data: [
      { amountCents: 300000, description: "CBY Gehalt", intervalMonths: 1 },
      { amountCents: -100000, description: "CBY Miete", intervalMonths: 1 },
      { amountCents: -200000, description: "CBY Versicherung", intervalMonths: 12 }
    ].map((i) => ({
      accountId: ACCOUNT_ID,
      amountCents: i.amountCents,
      description: i.description,
      frequency: "MONTHLY",
      intervalMonths: i.intervalMonths,
      dayOfMonth: 1,
      nextOccurrence: anchor
    }))
  });
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: BEFORE_THE_YEAR });
  await prisma.budgetMonthSnapshot.deleteMany({ where: { householdId } });
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
  await prisma.budget.deleteMany({ where: { accountId: { in: ACCOUNT_IDS } } });
  await prisma.category.updateMany({ where: { householdId }, data: { deletedAt: null } });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  vi.useRealTimers();
  if (!prisma) return;
  await prisma.budgetMonthSnapshot.deleteMany({ where: { householdId } });
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
  await prisma.budget.deleteMany({ where: { accountId: { in: ACCOUNT_IDS } } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.category.deleteMany({ where: { householdId } });
  await prisma.account.deleteMany({ where: { id: { in: ACCOUNT_IDS } } });
  await cleanupTestHousehold(prisma, USER_ID);
  await prisma.user.deleteMany({ where: { id: USER_ID } });
  await prisma.$disconnect();
});

describe("loadEffectiveCategoryBudgetsForYear", () => {
  it("returns an empty record without plans or budgets", async () => {
    expect(await load()).toEqual({});
  });

  it("returns 12x the amount for a MONTHLY plan", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 25000 } });
    expect(await load()).toEqual({ [foodId]: Array.from({ length: 12 }, () => 25000) });
  });

  it("distributes a YEARLY plan by the smoothed availability of the recurring matrix", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: hobbyId, period: "YEARLY", amountCents: 1200000 } });
    const available = smoothedAvailablePerMonth(await loadRecurringYearMatrix(householdId, YEAR));
    const expected = planMonthlyCents({ period: "YEARLY", amountCents: 1200000 }, available);
    const result = await load();
    expect(result[hobbyId]).toEqual(expected);
    expect(result[hobbyId]).toHaveLength(12);
    expect(sum(result[hobbyId]!)).toBe(1200000);
    // Fixture: January has no availability (insurance due), so it gets 0.
    expect(result[hobbyId]![0]).toBe(0);
  });

  it("uses a legacy Budget only in months with a row and null elsewhere", async () => {
    await prisma.budget.createMany({
      data: [
        { accountId: ACCOUNT_ID, categoryId: travelId, month: 4, year: YEAR, amountCents: 7000 },
        { accountId: ACCOUNT_ID, categoryId: travelId, month: 9, year: YEAR, amountCents: 8000 },
        { accountId: ACCOUNT_ID, categoryId: travelId, month: 4, year: YEAR - 1, amountCents: 1 }
      ]
    });
    const expected: (number | null)[] = Array.from({ length: 12 }, () => null);
    expected[3] = 7000;
    expected[8] = 8000;
    expect(await load()).toEqual({ [travelId]: expected });
  });

  it("reads legacy Budgets of every account of the household and adds up a shared month", async () => {
    await prisma.budget.createMany({
      data: [
        { accountId: ACCOUNT_ID, categoryId: travelId, month: 4, year: YEAR, amountCents: 7000 },
        { accountId: SECOND_ACCOUNT_ID, categoryId: travelId, month: 4, year: YEAR, amountCents: 3000 },
        { accountId: SECOND_ACCOUNT_ID, categoryId: travelId, month: 9, year: YEAR, amountCents: 8000 }
      ]
    });
    const expected: (number | null)[] = Array.from({ length: 12 }, () => null);
    expected[3] = 10000;
    expected[8] = 8000;
    expect(await load()).toEqual({ [travelId]: expected });
  });

  it("lets a plan win over a legacy Budget of the same category", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 25000 } });
    await prisma.budget.create({ data: { accountId: ACCOUNT_ID, categoryId: foodId, month: 4, year: YEAR, amountCents: 9900 } });
    expect(await load()).toEqual({ [foodId]: Array.from({ length: 12 }, () => 25000) });
  });

  it("ignores a soft-deleted plan", async () => {
    await prisma.categoryBudgetPlan.create({
      data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 25000, deletedAt: new Date() }
    });
    expect(await load()).toEqual({});
  });

  it("ignores the plan of a soft-deleted category", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 25000 } });
    await prisma.category.update({ where: { id: foodId }, data: { deletedAt: new Date() } });
    expect(await load()).toEqual({});
  });

  it("ignores saving-goal budgets (no category)", async () => {
    await prisma.budget.create({
      data: { accountId: ACCOUNT_ID, categoryId: null, title: "CBY Goal", month: 4, year: YEAR, amountCents: 50000 }
    });
    expect(await load()).toEqual({});
  });

  it("omits categories without plan or budget", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 25000 } });
    const result = await load();
    expect(Object.keys(result)).toEqual([foodId]);
    expect(result[quietId]).toBeUndefined();
  });
});

describe("loadEffectiveCategoryBudgetsForYear - completed months are frozen", () => {
  const monthlyPlan = (categoryId: string, amountCents: number) =>
    prisma.categoryBudgetPlan.create({ data: { householdId, categoryId, period: "MONTHLY", amountCents } });
  const setPlan = (categoryId: string, amountCents: number) =>
    prisma.categoryBudgetPlan.update({ where: { categoryId }, data: { amountCents } });
  const snapshotMonths = async () =>
    (await prisma.budgetMonthSnapshot.findMany({ where: { householdId, year: YEAR }, orderBy: { month: "asc" } })).map(
      (row) => row.month
    );
  /** `past` for January to May, `open` for June to December. */
  const split = <T,>(past: T, open: T): T[] => Array.from({ length: 12 }, (_, index) => (index < 5 ? past : open));

  beforeEach(() => {
    vi.setSystemTime(MID_YEAR);
  });

  it("freezes the months before the current one on first read and keeps the others live", async () => {
    await monthlyPlan(foodId, 25000);
    expect(await load()).toEqual({ [foodId]: split(25000, 25000) });
    expect(await snapshotMonths()).toEqual([1, 2, 3, 4, 5]);

    await setPlan(foodId, 40000);
    expect(await load()).toEqual({ [foodId]: split(25000, 40000) });
    expect(await snapshotMonths()).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps the YEARLY shares of the months that are over when a standing order is added later", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: hobbyId, period: "YEARLY", amountCents: 1200000 } });
    const before = (await load())[hobbyId]!;
    expect(sum(before)).toBe(1200000);

    const added = await prisma.recurringTransaction.create({
      data: {
        accountId: ACCOUNT_ID,
        amountCents: -150000,
        description: "CBY Kredit",
        frequency: "MONTHLY",
        intervalMonths: 6,
        dayOfMonth: 1,
        nextOccurrence: new Date(Date.UTC(YEAR, 2, 1, 12))
      }
    });
    try {
      const live = planMonthlyCents(
        { period: "YEARLY", amountCents: 1200000 },
        smoothedAvailablePerMonth(await loadRecurringYearMatrix(householdId, YEAR))
      );
      // The new standing order moves the distribution …
      expect(live).not.toEqual(before);
      const after = (await load())[hobbyId]!;
      // … but only for June to December.
      expect(after.slice(0, 5)).toEqual(before.slice(0, 5));
      expect(after.slice(5)).toEqual(live.slice(5));
    } finally {
      await prisma.recurringTransaction.delete({ where: { id: added.id } });
    }
  });

  it("shows no budget in the months that were over before the plan existed", async () => {
    expect(await load()).toEqual({});
    await monthlyPlan(foodId, 25000);
    expect(await load()).toEqual({ [foodId]: split(null, 25000) });
  });

  it("keeps a budget in the months that are over after its plan was removed", async () => {
    await monthlyPlan(foodId, 25000);
    await load();
    await prisma.categoryBudgetPlan.update({ where: { categoryId: foodId }, data: { deletedAt: new Date() } });
    expect(await load()).toEqual({ [foodId]: split(25000, null) });
  });

  it("keeps a per-month Budget row of a month that is over and follows one of a month to come", async () => {
    const march = await prisma.budget.create({
      data: { accountId: ACCOUNT_ID, categoryId: travelId, month: 3, year: YEAR, amountCents: 7000 }
    });
    const september = await prisma.budget.create({
      data: { accountId: ACCOUNT_ID, categoryId: travelId, month: 9, year: YEAR, amountCents: 8000 }
    });
    const expected: (number | null)[] = Array.from({ length: 12 }, () => null);
    expected[2] = 7000;
    expected[8] = 8000;
    expect(await load()).toEqual({ [travelId]: expected });

    await prisma.budget.update({ where: { id: march.id }, data: { amountCents: 1 } });
    await prisma.budget.update({ where: { id: september.id }, data: { amountCents: 9000 } });
    expected[8] = 9000;
    expect(await load()).toEqual({ [travelId]: expected });
  });

  it("shares its snapshots with the loader of a single month", async () => {
    await monthlyPlan(foodId, 25000);
    // March is frozen by the month loader …
    expect(await loadEffectiveCategoryBudgets({ householdId, year: YEAR, month: 3 })).toEqual({ [foodId]: 25000 });
    await setPlan(foodId, 40000);
    // … the year loader keeps it and freezes the other four months as they are now.
    const expected = split(40000, 40000);
    expected[2] = 25000;
    expect(await load()).toEqual({ [foodId]: expected });

    await setPlan(foodId, 50000);
    expect(await loadEffectiveCategoryBudgets({ householdId, year: YEAR, month: 2 })).toEqual({ [foodId]: 40000 });
    expect(await loadEffectiveCategoryBudgets({ householdId, year: YEAR, month: 3 })).toEqual({ [foodId]: 25000 });
    expect(await loadEffectiveCategoryBudgets({ householdId, year: YEAR, month: 6 })).toEqual({ [foodId]: 50000 });
  });

  it("reads a year that is over entirely from its snapshots", async () => {
    vi.setSystemTime(new Date("2037-02-10T10:00:00.000Z"));
    await monthlyPlan(foodId, 25000);
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: hobbyId, period: "YEARLY", amountCents: 1200000 } });
    const first = await load();
    expect(first[foodId]).toEqual(Array.from({ length: 12 }, () => 25000));
    expect(sum(first[hobbyId]!)).toBe(1200000);
    expect(await snapshotMonths()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    await setPlan(foodId, 40000);
    await prisma.categoryBudgetPlan.update({ where: { categoryId: hobbyId }, data: { deletedAt: new Date() } });
    await monthlyPlan(travelId, 7000);
    expect(await load()).toEqual(first);
  });

  it("gives every reader the same result when several read the year for the first time at once", async () => {
    await monthlyPlan(foodId, 25000);
    const results = await Promise.all(Array.from({ length: 6 }, () => load()));
    for (const result of results) expect(result).toEqual({ [foodId]: split(25000, 25000) });
    expect(await snapshotMonths()).toEqual([1, 2, 3, 4, 5]);
  });

  it("leaves out a category that was deleted since", async () => {
    await monthlyPlan(foodId, 25000);
    await monthlyPlan(travelId, 7000);
    await load();
    await prisma.category.update({ where: { id: foodId }, data: { deletedAt: new Date() } });
    expect(await load()).toEqual({ [travelId]: split(7000, 7000) });
  });
});
