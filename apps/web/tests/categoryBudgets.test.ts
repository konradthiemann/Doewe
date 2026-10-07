import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadEffectiveCategoryBudgets } from "../lib/categoryBudgets";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// DB test for loadEffectiveCategoryBudgets. Recurring fixtures live in 2037 with
// future anchors so the cron test (books all due items globally) is unaffected.
// Smoothed availability 2037: income is spread evenly (3_600_000 / 12 = 3000 EUR per month), only fixed
// costs vary: Jan 3000 - 3000 = 0, Feb-Dec 3000 - 1000 = 2000 EUR (salary +3000, rent -1000, insurance -2000 in Jan).
// Plans beat legacy per-month Budget rows; a Budget only applies to categories without a plan.
const USER_ID = "test-user-category-budgets";
const ACCOUNT_ID = "acc_category_budgets";
const YEAR = 2037;

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let foodId: string;
let hobbyId: string;
let travelId: string;

const load = (month: number) => loadEffectiveCategoryBudgets({ householdId, accountId: ACCOUNT_ID, year: YEAR, month });

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
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
  await prisma.budget.deleteMany({ where: { accountId: ACCOUNT_ID } });
});

afterAll(async () => {
  if (!prisma) return;
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
  await prisma.budget.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.category.deleteMany({ where: { householdId } });
  await prisma.account.deleteMany({ where: { id: ACCOUNT_ID } });
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
