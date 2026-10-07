import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Analytics endpoints must resolve category budgets through the budget plans
// (MONTHLY plan as default, legacy per-month Budget row as override).
const TEST_USER_ID = "test-user-analytics-budget-plans";
const ACCOUNT_ID = "acc_analytics_budget_plans";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

type SummaryBudget = { categoryId: string; name: string; budget: number; spent: number; diff: number };
type ReviewCategory = {
  id: string;
  name: string;
  spentCents: number;
  budgetCents: number | null;
  transactions: unknown[];
};

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let foodId: string;
let quietId: string;

const now = new Date();
const CURRENT_MONTH = now.getMonth() + 1;
const CURRENT_YEAR = now.getFullYear();

async function fetchSummaryBudgets(): Promise<SummaryBudget[]> {
  const { GET } = await import("../app/api/analytics/summary/route");
  const res = await GET();
  expect(res.status).toBe(200);
  return ((await res.json()) as { categoryBudgets: SummaryBudget[] }).categoryBudgets;
}

async function fetchReview(): Promise<ReviewCategory[]> {
  const { GET } = await import("../app/api/analytics/monthly-review/route");
  const res = await GET(new Request("http://localhost/api/analytics/monthly-review?month=3&year=2025"));
  expect(res.status).toBe(200);
  return ((await res.json()) as { categories: ReviewCategory[] }).categories;
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  const user = await prisma.user.upsert({
    where: { email: "analytics-budget-plans-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "analytics-budget-plans-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id, "Analytics Budget Plans Household");
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: user.id, householdId },
    create: { id: ACCOUNT_ID, name: "Analytics Budget Plans", userId: user.id, householdId }
  });
  const mk = async (name: string) =>
    (
      await prisma.category.upsert({
        where: { householdId_name: { householdId, name } },
        update: {},
        create: { name, userId: user.id, householdId }
      })
    ).id;
  foodId = await mk("ABP Food");
  quietId = await mk("ABP Quiet");
});

beforeEach(async () => {
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
  await prisma.budget.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
});

afterAll(async () => {
  if (!prisma) return;
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
  await prisma.budget.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.category.deleteMany({ where: { householdId } });
  await prisma.account.deleteMany({ where: { id: ACCOUNT_ID } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.$disconnect();
});

describe("GET /api/analytics/summary - categoryBudgets from plans", () => {
  it("includes a MONTHLY plan with spent 0 when nothing was spent", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: quietId, period: "MONTHLY", amountCents: 30000 } });
    const budgets = await fetchSummaryBudgets();
    expect(budgets.find((b) => b.categoryId === quietId)).toEqual({
      categoryId: quietId,
      name: "ABP Quiet",
      budget: 300,
      spent: 0,
      diff: -300
    });
  });

  it("computes spent and diff against the plan", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 30000 } });
    await prisma.transaction.create({
      data: {
        accountId: ACCOUNT_ID,
        categoryId: foodId,
        amountCents: -12000,
        description: "ABP food",
        occurredAt: new Date(CURRENT_YEAR, CURRENT_MONTH - 1, 1, 12)
      }
    });
    const budgets = await fetchSummaryBudgets();
    expect(budgets.find((b) => b.categoryId === foodId)).toMatchObject({ budget: 300, spent: 120, diff: -180 });
  });

  it("lets a legacy Budget of the current month override the plan", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 30000 } });
    await prisma.budget.create({
      data: { accountId: ACCOUNT_ID, categoryId: foodId, month: CURRENT_MONTH, year: CURRENT_YEAR, amountCents: 5000 }
    });
    const budgets = await fetchSummaryBudgets();
    const entries = budgets.filter((b) => b.categoryId === foodId);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.budget).toBe(50);
  });

  it("omits soft-deleted plans", async () => {
    await prisma.categoryBudgetPlan.create({
      data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 30000, deletedAt: new Date() }
    });
    const budgets = await fetchSummaryBudgets();
    expect(budgets.find((b) => b.categoryId === foodId)).toBeUndefined();
  });
});

describe("GET /api/analytics/monthly-review - budgetCents from plans", () => {
  const day = (d: number) => new Date(2025, 2, d, 12, 0, 0);

  it("takes budgetCents from the MONTHLY plan, also for categories without spending", async () => {
    await prisma.categoryBudgetPlan.createMany({
      data: [
        { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 30000 },
        { householdId, categoryId: quietId, period: "MONTHLY", amountCents: 8000 }
      ]
    });
    await prisma.transaction.create({
      data: { accountId: ACCOUNT_ID, categoryId: foodId, amountCents: -1500, description: "ABP review food", occurredAt: day(4) }
    });

    const categories = await fetchReview();
    expect(categories.find((c) => c.id === foodId)).toMatchObject({ spentCents: 1500, budgetCents: 30000 });
    const quiet = categories.find((c) => c.id === quietId);
    expect(quiet).toBeDefined();
    expect(quiet).toMatchObject({ name: "ABP Quiet", spentCents: 0, budgetCents: 8000, transactions: [] });
  });

  it("lets a legacy Budget of the reviewed month override the plan", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 30000 } });
    await prisma.budget.create({ data: { accountId: ACCOUNT_ID, categoryId: foodId, month: 3, year: 2025, amountCents: 4200 } });

    const categories = await fetchReview();
    expect(categories.find((c) => c.id === foodId)?.budgetCents).toBe(4200);
  });

  it("does not apply a Budget of a different month as override", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 30000 } });
    await prisma.budget.create({ data: { accountId: ACCOUNT_ID, categoryId: foodId, month: 4, year: 2025, amountCents: 4200 } });

    const categories = await fetchReview();
    expect(categories.find((c) => c.id === foodId)?.budgetCents).toBe(30000);
  });
});
