import { smoothedAvailablePerMonth, planMonthlyCents } from "@doewe/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadEffectiveCategoryBudgetsForYear } from "../lib/categoryBudgets";
import { loadRecurringYearMatrix } from "../lib/recurringYear";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// DB test for loadEffectiveCategoryBudgetsForYear. Recurring fixtures live in 2036 with
// anchors in the future so the cron test (books all due items globally) is unaffected.
const USER_ID = "test-user-category-budgets-year";
const ACCOUNT_ID = "acc_category_budgets_year";
const YEAR = 2036;

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let foodId: string;
let hobbyId: string;
let travelId: string;
let quietId: string;

const load = () => loadEffectiveCategoryBudgetsForYear({ householdId, accountId: ACCOUNT_ID, year: YEAR });
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
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
  await prisma.budget.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.category.updateMany({ where: { householdId }, data: { deletedAt: null } });
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
