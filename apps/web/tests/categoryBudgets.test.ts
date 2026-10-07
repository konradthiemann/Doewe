import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadEffectiveCategoryBudgets } from "../lib/categoryBudgets";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// DB test for loadEffectiveCategoryBudgets. Recurring fixtures live in 2037 with
// future anchors so the cron test (books all due items globally) is unaffected.
// Net availability 2037: Jan 0, Feb-Dec 2000 EUR (salary +3000, rent -1000, insurance -2000 in Jan).
const USER_ID = "test-user-category-budgets";
const ACCOUNT_ID = "acc_category_budgets";
const YEAR = 2037;

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let foodId: string;
let hobbyId: string;
let travelId: string;

const load = (month: number) => loadEffectiveCategoryBudgets({ householdId, accountId: ACCOUNT_ID, year: YEAR, month });

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

  await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: ACCOUNT_ID } } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  const anchor = new Date(Date.UTC(YEAR, 0, 1, 12));
  await prisma.recurringTransaction.createMany({
    data: [
      { accountId: ACCOUNT_ID, amountCents: 300000, description: "CB Gehalt", frequency: "MONTHLY", intervalMonths: 1, dayOfMonth: 1, nextOccurrence: anchor },
      { accountId: ACCOUNT_ID, amountCents: -100000, description: "CB Miete", frequency: "MONTHLY", intervalMonths: 1, dayOfMonth: 1, nextOccurrence: anchor },
      { accountId: ACCOUNT_ID, amountCents: -200000, description: "CB Versicherung", frequency: "MONTHLY", intervalMonths: 12, dayOfMonth: 1, nextOccurrence: anchor }
    ]
  });
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

  it("distributes a YEARLY plan by recurring net availability", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: hobbyId, period: "YEARLY", amountCents: 1200000 } });
    // Jan has 0 availability; Feb gets the remainder (109090 + 10)
    expect(await load(1)).toEqual({ [hobbyId]: 0 });
    expect(await load(2)).toEqual({ [hobbyId]: 109100 });
    expect(await load(3)).toEqual({ [hobbyId]: 109090 });
  });

  it("lets a legacy Budget of the same month override the plan", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 25000 } });
    await prisma.budget.create({ data: { accountId: ACCOUNT_ID, categoryId: foodId, month: 4, year: YEAR, amountCents: 9900 } });
    expect(await load(4)).toEqual({ [foodId]: 9900 });
  });

  it("adds a legacy Budget for a category without a plan", async () => {
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
