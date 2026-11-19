import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { loadEffectiveCategoryBudgets } from "../lib/categoryBudgets";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// DB test for loadEffectiveCategoryBudgets. Recurring fixtures live in 2037 with
// future anchors so the cron test (books all due items globally) is unaffected.
// Smoothed availability 2037: income is spread evenly (3_600_000 / 12 = 3000 EUR per month), only fixed
// costs vary: Jan 3000 - 3000 = 0, Feb-Dec 3000 - 1000 = 2000 EUR (salary +3000, rent -1000, insurance -2000 in Jan).
// Plans beat legacy per-month Budget rows; a Budget only applies to categories without a plan.
// Legacy Budget rows are read for every account of the household (SECOND_ACCOUNT_ID).
// The clock is pinned. For the first two blocks it stands in 2036, so every month of 2037 is
// still to come and is computed live; the last block moves it into 2037, where the months
// that are over are frozen (BudgetMonthSnapshot).
const USER_ID = "test-user-category-budgets";
const ACCOUNT_ID = "acc_category_budgets";
const SECOND_ACCOUNT_ID = "acc_category_budgets_second";
const ACCOUNT_IDS = [ACCOUNT_ID, SECOND_ACCOUNT_ID];
const YEAR = 2037;
/** 15 Jun 2036, 12:00 in Berlin: all of 2037 is in the future. */
const BEFORE_THE_YEAR = new Date("2036-06-15T10:00:00.000Z");
/** 15 Jun 2037, 12:00 in Berlin: January to May are over, June is the current month. */
const MID_YEAR = new Date("2037-06-15T10:00:00.000Z");

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let foodId: string;
let hobbyId: string;
let travelId: string;

const load = (month: number) => loadEffectiveCategoryBudgets({ householdId, year: YEAR, month });

const anchorOf = (month: number) => new Date(Date.UTC(YEAR, month - 1, 1, 12));

type RecurringFixture = { amountCents: number; description: string; intervalMonths: number; month: number };

async function replaceRecurring(items: RecurringFixture[]): Promise<void> {
  await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: ACCOUNT_ID } } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.recurringTransaction.createMany({
    data: items.map((i) => ({
      accountId: ACCOUNT_ID,
      amountCents: i.amountCents,
      description: i.description,
      frequency: "MONTHLY",
      intervalMonths: i.intervalMonths,
      dayOfMonth: 1,
      nextOccurrence: anchorOf(i.month)
    }))
  });
}

const seedBaseRecurring = () =>
  replaceRecurring([
    { amountCents: 300000, description: "CB Gehalt", intervalMonths: 1, month: 1 },
    { amountCents: -100000, description: "CB Miete", intervalMonths: 1, month: 1 },
    { amountCents: -200000, description: "CB Versicherung", intervalMonths: 12, month: 1 }
  ]);

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  const user = await prisma.user.upsert({
    where: { email: "category-budgets-test@example.com" },
    update: {},
    create: { id: USER_ID, email: "category-budgets-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id, "Category Budgets Household");
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: user.id, householdId },
    create: { id: ACCOUNT_ID, name: "Category Budgets Account", userId: user.id, householdId }
  });
  await prisma.account.upsert({
    where: { id: SECOND_ACCOUNT_ID },
    update: { userId: user.id, householdId },
    create: { id: SECOND_ACCOUNT_ID, name: "Category Budgets Second Account", userId: user.id, householdId }
  });
  const mk = async (name: string) =>
    (
      await prisma.category.upsert({
        where: { householdId_name: { householdId, name } },
        update: {},
        create: { name, userId: user.id, householdId }
      })
    ).id;
  foodId = await mk("CB Food");
  hobbyId = await mk("CB Hobby");
  travelId = await mk("CB Travel");

  await seedBaseRecurring();
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: BEFORE_THE_YEAR });
  await prisma.budgetMonthSnapshot.deleteMany({ where: { householdId } });
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
  await prisma.budget.deleteMany({ where: { accountId: { in: ACCOUNT_IDS } } });
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

describe("loadEffectiveCategoryBudgets", () => {
  it("returns an empty record without plans or budgets", async () => {
    expect(await load(5)).toEqual({});
  });

  it("returns the amount of a MONTHLY plan for any month", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 25000 } });
    expect(await load(1)).toEqual({ [foodId]: 25000 });
    expect(await load(9)).toEqual({ [foodId]: 25000 });
  });

  it("distributes a YEARLY plan by smoothed availability (even income, varying fixed costs)", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: hobbyId, period: "YEARLY", amountCents: 1200000 } });
    // Jan has 0 availability; Feb gets the remainder (109090 + 10)
    expect(await load(1)).toEqual({ [hobbyId]: 0 });
    expect(await load(2)).toEqual({ [hobbyId]: 109100 });
    expect(await load(3)).toEqual({ [hobbyId]: 109090 });
  });

  it("lets the plan win over a legacy Budget of the same month and category", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 25000 } });
    await prisma.budget.create({ data: { accountId: ACCOUNT_ID, categoryId: foodId, month: 4, year: YEAR, amountCents: 9900 } });
    expect(await load(4)).toEqual({ [foodId]: 25000 });
  });

  it("uses the legacy Budget only for categories without a plan (plan wins per category)", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 25000 } });
    await prisma.budget.createMany({
      data: [
        { accountId: ACCOUNT_ID, categoryId: foodId, month: 4, year: YEAR, amountCents: 9900 },
        { accountId: ACCOUNT_ID, categoryId: travelId, month: 4, year: YEAR, amountCents: 7000 }
      ]
    });
    expect(await load(4)).toEqual({ [foodId]: 25000, [travelId]: 7000 });
  });

  it("falls back to a legacy Budget for a category without a plan", async () => {
    await prisma.budget.create({ data: { accountId: ACCOUNT_ID, categoryId: travelId, month: 4, year: YEAR, amountCents: 7000 } });
    expect(await load(4)).toEqual({ [travelId]: 7000 });
  });

  it("reads the legacy Budget of any account of the household", async () => {
    await prisma.budget.create({
      data: { accountId: SECOND_ACCOUNT_ID, categoryId: travelId, month: 4, year: YEAR, amountCents: 7000 }
    });
    expect(await load(4)).toEqual({ [travelId]: 7000 });
  });

  it("adds up the legacy Budgets two accounts hold for the same category and month", async () => {
    await prisma.budget.createMany({
      data: [
        { accountId: ACCOUNT_ID, categoryId: travelId, month: 4, year: YEAR, amountCents: 7000 },
        { accountId: SECOND_ACCOUNT_ID, categoryId: travelId, month: 4, year: YEAR, amountCents: 3000 }
      ]
    });
    expect(await load(4)).toEqual({ [travelId]: 10000 });
  });

  it("ignores a Budget of another month or year", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 25000 } });
    await prisma.budget.createMany({
      data: [
        { accountId: ACCOUNT_ID, categoryId: foodId, month: 5, year: YEAR, amountCents: 1 },
        { accountId: ACCOUNT_ID, categoryId: foodId, month: 4, year: YEAR - 1, amountCents: 2 }
      ]
    });
    expect(await load(4)).toEqual({ [foodId]: 25000 });
  });

  it("ignores a soft-deleted plan", async () => {
    await prisma.categoryBudgetPlan.create({
      data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 25000, deletedAt: new Date() }
    });
    expect(await load(4)).toEqual({});
  });

  it("ignores a soft-deleted legacy Budget", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 25000 } });
    await prisma.budget.create({
      data: { accountId: ACCOUNT_ID, categoryId: foodId, month: 4, year: YEAR, amountCents: 9900, deletedAt: new Date() }
    });
    expect(await load(4)).toEqual({ [foodId]: 25000 });
  });

  it("ignores saving-goal budgets (no category)", async () => {
    await prisma.budget.create({
      data: { accountId: ACCOUNT_ID, categoryId: null, title: "Goal", month: 4, year: YEAR, amountCents: 50000 }
    });
    expect(await load(4)).toEqual({});
  });
});

describe("loadEffectiveCategoryBudgets - YEARLY distribution with smoothed income", () => {
  afterEach(async () => {
    await seedBaseRecurring();
  });

  it("distributes evenly when a yearly salary is smoothed against monthly rent (available 0 everywhere)", async () => {
    // Old behaviour (signed net per month): only June positive -> everything in June.
    // New: income 1_200_000 / 12 = 100000, rent -100000 -> available 0 in all months -> equal fallback.
    await replaceRecurring([
      { amountCents: 1200000, description: "CB Jahresgehalt", intervalMonths: 12, month: 6 },
      { amountCents: -100000, description: "CB Miete", intervalMonths: 1, month: 1 }
    ]);
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: hobbyId, period: "YEARLY", amountCents: 1200000 } });
    for (let month = 1; month <= 12; month++) {
      expect(await load(month)).toEqual({ [hobbyId]: 100000 });
    }
  });

  it("puts the rounding remainder on January in the equal fallback", async () => {
    await replaceRecurring([
      { amountCents: 1200000, description: "CB Jahresgehalt", intervalMonths: 12, month: 6 },
      { amountCents: -100000, description: "CB Miete", intervalMonths: 1, month: 1 }
    ]);
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: hobbyId, period: "YEARLY", amountCents: 1200005 } });
    expect(await load(1)).toEqual({ [hobbyId]: 100005 });
    expect(await load(2)).toEqual({ [hobbyId]: 100000 });
    expect(await load(6)).toEqual({ [hobbyId]: 100000 });
  });

  it("gives a month with a large yearly expense 0 and splits the rest evenly", async () => {
    // income 2_400_000 / 12 = 200000; rent -100000 -> 100000 per month; March additionally -600000 -> -600000.
    await replaceRecurring([
      { amountCents: 2400000, description: "CB Jahresgehalt", intervalMonths: 12, month: 6 },
      { amountCents: -100000, description: "CB Miete", intervalMonths: 1, month: 1 },
      { amountCents: -600000, description: "CB Jahresausgabe", intervalMonths: 12, month: 3 }
    ]);
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: hobbyId, period: "YEARLY", amountCents: 1100003 } });
    expect(await load(3)).toEqual({ [hobbyId]: 0 });
    // remainder 3 cents go to the heaviest month with the smallest index (January)
    expect(await load(1)).toEqual({ [hobbyId]: 100003 });
    for (const month of [2, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(await load(month)).toEqual({ [hobbyId]: 100000 });
    }
  });
});

describe("loadEffectiveCategoryBudgets - completed months are frozen", () => {
  const monthlyPlan = (categoryId: string, amountCents: number) =>
    prisma.categoryBudgetPlan.create({ data: { householdId, categoryId, period: "MONTHLY", amountCents } });
  const setPlan = (categoryId: string, amountCents: number) =>
    prisma.categoryBudgetPlan.update({ where: { categoryId }, data: { amountCents } });
  const snapshotMonths = async () =>
    (await prisma.budgetMonthSnapshot.findMany({ where: { householdId, year: YEAR }, orderBy: { month: "asc" } })).map(
      (row) => row.month
    );

  beforeEach(() => {
    vi.setSystemTime(MID_YEAR);
  });

  afterEach(async () => {
    await seedBaseRecurring();
    await prisma.category.updateMany({ where: { householdId }, data: { deletedAt: null } });
  });

  it("keeps the budget of a month that is over when the plan is edited afterwards", async () => {
    await monthlyPlan(foodId, 25000);
    expect(await load(3)).toEqual({ [foodId]: 25000 });

    await setPlan(foodId, 40000);
    expect(await load(3)).toEqual({ [foodId]: 25000 });
    // The current month and the months to come still follow the plan.
    expect(await load(6)).toEqual({ [foodId]: 40000 });
    expect(await load(9)).toEqual({ [foodId]: 40000 });
  });

  it("keeps the budget of a month that is over when the plan is removed or a new one is added", async () => {
    await monthlyPlan(foodId, 25000);
    expect(await load(3)).toEqual({ [foodId]: 25000 });

    await prisma.categoryBudgetPlan.update({ where: { categoryId: foodId }, data: { deletedAt: new Date() } });
    await monthlyPlan(travelId, 7000);
    expect(await load(3)).toEqual({ [foodId]: 25000 });
    expect(await load(6)).toEqual({ [travelId]: 7000 });
  });

  it("keeps the YEARLY share of a month that is over when a standing order is added later", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: hobbyId, period: "YEARLY", amountCents: 1200000 } });
    expect(await load(1)).toEqual({ [hobbyId]: 0 });
    expect(await load(2)).toEqual({ [hobbyId]: 109100 });
    expect(await load(6)).toEqual({ [hobbyId]: 109090 });

    // Different standing orders: availability is now 0 in every month, the plan would be split evenly.
    await replaceRecurring([
      { amountCents: 1200000, description: "CB Jahresgehalt", intervalMonths: 12, month: 6 },
      { amountCents: -100000, description: "CB Miete", intervalMonths: 1, month: 1 }
    ]);
    expect(await load(1)).toEqual({ [hobbyId]: 0 });
    expect(await load(2)).toEqual({ [hobbyId]: 109100 });
    expect(await load(6)).toEqual({ [hobbyId]: 100000 });
    expect(await load(7)).toEqual({ [hobbyId]: 100000 });
    // A month that is over but was never read before freezes with today's figures.
    expect(await load(3)).toEqual({ [hobbyId]: 100000 });
  });

  it("keeps the budget of a month that is over when its per-month Budget row changes", async () => {
    const row = await prisma.budget.create({
      data: { accountId: ACCOUNT_ID, categoryId: travelId, month: 3, year: YEAR, amountCents: 7000 }
    });
    expect(await load(3)).toEqual({ [travelId]: 7000 });

    await prisma.budget.update({ where: { id: row.id }, data: { amountCents: 9000 } });
    expect(await load(3)).toEqual({ [travelId]: 7000 });
    await prisma.budget.delete({ where: { id: row.id } });
    expect(await load(3)).toEqual({ [travelId]: 7000 });
  });

  it("freezes a month without budgets as well", async () => {
    expect(await load(3)).toEqual({});
    const stored = await prisma.budgetMonthSnapshot.findUniqueOrThrow({
      where: { householdId_year_month: { householdId, year: YEAR, month: 3 } }
    });
    expect(stored.budgets).toEqual({});

    await monthlyPlan(foodId, 25000);
    expect(await load(3)).toEqual({});
    expect(await load(6)).toEqual({ [foodId]: 25000 });
  });

  it("stores only the categories that have a budget", async () => {
    await monthlyPlan(foodId, 25000);
    await load(3);
    const stored = await prisma.budgetMonthSnapshot.findUniqueOrThrow({
      where: { householdId_year_month: { householdId, year: YEAR, month: 3 } }
    });
    expect(stored.budgets).toEqual({ [foodId]: 25000 });
  });

  it("freezes the month that just ended as soon as the current month is read", async () => {
    await monthlyPlan(foodId, 25000);
    expect(await snapshotMonths()).toEqual([]);

    expect(await load(6)).toEqual({ [foodId]: 25000 });
    // May has its snapshot now; June (current) and earlier months have none.
    expect(await snapshotMonths()).toEqual([5]);

    await setPlan(foodId, 40000);
    expect(await load(5)).toEqual({ [foodId]: 25000 });
    // April was never read: it freezes now, with what the plan says today.
    expect(await load(4)).toEqual({ [foodId]: 40000 });
    await setPlan(foodId, 50000);
    expect(await load(4)).toEqual({ [foodId]: 40000 });
  });

  it("does not freeze the current or a future month", async () => {
    await monthlyPlan(foodId, 25000);
    await load(6);
    await load(7);
    await load(12);
    expect(await snapshotMonths()).toEqual([5]);
  });

  it("turns the month over at midnight in Berlin", async () => {
    await monthlyPlan(foodId, 25000);
    // 30 Jun 2037, 23:30 in Berlin: June is still the current month.
    vi.setSystemTime(new Date("2037-06-30T21:30:00.000Z"));
    expect(await load(6)).toEqual({ [foodId]: 25000 });
    await setPlan(foodId, 40000);
    expect(await load(6)).toEqual({ [foodId]: 40000 });

    // 1 Jul 2037, 00:30 in Berlin — still 30 June in UTC: June is over and freezes.
    vi.setSystemTime(new Date("2037-06-30T22:30:00.000Z"));
    expect(await load(7)).toEqual({ [foodId]: 40000 });
    expect(await snapshotMonths()).toEqual([5, 6]);
    await setPlan(foodId, 50000);
    expect(await load(6)).toEqual({ [foodId]: 40000 });
    expect(await load(7)).toEqual({ [foodId]: 50000 });
  });

  it("freezes a month of an earlier year too", async () => {
    vi.setSystemTime(new Date("2038-02-10T10:00:00.000Z"));
    await monthlyPlan(foodId, 25000);
    expect(await load(12)).toEqual({ [foodId]: 25000 });
    await setPlan(foodId, 40000);
    expect(await load(12)).toEqual({ [foodId]: 25000 });
  });

  it("gives every reader the same frozen value when several read a month for the first time at once", async () => {
    await monthlyPlan(foodId, 25000);
    const results = await Promise.all(Array.from({ length: 8 }, () => load(3)));
    for (const result of results) expect(result).toEqual({ [foodId]: 25000 });
    expect(await snapshotMonths()).toEqual([3]);

    // The same when the current month is read at once (each reader freezes the month before).
    await Promise.all(Array.from({ length: 8 }, () => load(6)));
    expect(await snapshotMonths()).toEqual([3, 5]);
  });

  it("leaves out a category that was deleted since, soft or hard", async () => {
    const gone = await prisma.category.create({ data: { name: "CB Gone", userId: USER_ID, householdId } });
    await monthlyPlan(foodId, 25000);
    await monthlyPlan(gone.id, 5000);
    await prisma.budget.create({ data: { accountId: ACCOUNT_ID, categoryId: travelId, month: 3, year: YEAR, amountCents: 7000 } });
    expect(await load(3)).toEqual({ [foodId]: 25000, [travelId]: 7000, [gone.id]: 5000 });

    await prisma.category.update({ where: { id: foodId }, data: { deletedAt: new Date() } });
    await prisma.categoryBudgetPlan.deleteMany({ where: { categoryId: gone.id } });
    await prisma.category.delete({ where: { id: gone.id } });
    expect(await load(3)).toEqual({ [travelId]: 7000 });
  });
});
