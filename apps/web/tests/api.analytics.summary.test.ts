import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Use the same DATABASE_URL as the main app (set by pretest or .env)
// pretest already runs: prisma generate && prisma db push && db:seed

const TEST_USER_ID = "test-user-analytics";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

let prisma: import("@prisma/client").PrismaClient;
let testUserId: string;
let testAccountId: string;
let savingsCategoryId: string;
let foodCategoryId: string;

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  // Create isolated test user and account
  const user = await prisma.user.upsert({
    where: { email: "analytics-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "analytics-test@example.com", password: "hashed" }
  });
  testUserId = user.id;

  const account = await prisma.account.upsert({
    where: { id: "acc_analytics_test" },
    update: { userId: user.id },
    create: { id: "acc_analytics_test", name: "Analytics Test Account", userId: user.id }
  });
  testAccountId = account.id;

  // Create categories
  const savingsCat = await prisma.category.upsert({
    where: { userId_name: { userId: user.id, name: "Savings" } },
    update: {},
    create: { name: "Savings", userId: user.id }
  });
  savingsCategoryId = savingsCat.id;

  const foodCat = await prisma.category.upsert({
    where: { userId_name: { userId: user.id, name: "Food" } },
    update: {},
    create: { name: "Food", userId: user.id }
  });
  foodCategoryId = foodCat.id;

  // Clean up existing data for this test account
  await prisma.recurringTransactionSkip.deleteMany({
    where: { recurring: { accountId: testAccountId } }
  });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: testAccountId } });
  await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
  await prisma.budget.deleteMany({ where: { accountId: testAccountId } });

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);

  // Transactions: last month (+1000, -300), this month (+500, -200 food, -100 savings)
  await prisma.transaction.createMany({
    data: [
      {
        accountId: testAccountId,
        amountCents: 100000, // +1000€ income last month
        description: "Last month income",
        occurredAt: lastMonth
      },
      {
        accountId: testAccountId,
        amountCents: -30000, // -300€ expense last month
        description: "Last month expense",
        occurredAt: new Date(lastMonth.getTime() + 5 * 86400000)
      },
      {
        accountId: testAccountId,
        amountCents: 50000, // +500€ income this month
        description: "This month income",
        occurredAt: new Date(thisMonthStart.getTime() + 1 * 86400000)
      },
      {
        accountId: testAccountId,
        categoryId: foodCategoryId,
        amountCents: -20000, // -200€ food expense this month
        description: "This month food expense",
        occurredAt: new Date(thisMonthStart.getTime() + 2 * 86400000)
      },
      {
        accountId: testAccountId,
        categoryId: savingsCategoryId,
        amountCents: -10000, // -100€ savings transfer this month
        description: "Monthly savings transfer",
        occurredAt: new Date(thisMonthStart.getTime() + 4 * 86400000)
      }
    ]
  });

  // Recurring transactions for this month
  const thisMonthRecurringIncome = new Date(now.getFullYear(), now.getMonth(), 20);
  const thisMonthRecurringExpense = new Date(now.getFullYear(), now.getMonth(), 25);

  await prisma.recurringTransaction.createMany({
    data: [
      {
        id: "rec_income_test",
        accountId: testAccountId,
        amountCents: 40000, // +400€ recurring income
        description: "Recurring income",
        frequency: "MONTHLY",
        intervalMonths: 1,
        dayOfMonth: 20,
        nextOccurrence: thisMonthRecurringIncome
      },
      {
        id: "rec_expense_test",
        accountId: testAccountId,
        categoryId: foodCategoryId,
        amountCents: -15000, // -150€ recurring food expense
        description: "Recurring food expense",
        frequency: "MONTHLY",
        intervalMonths: 1,
        dayOfMonth: 25,
        nextOccurrence: thisMonthRecurringExpense
      }
    ]
  });

  // Budget goals for this month (planned savings)
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  await prisma.budget.createMany({
    data: [
      {
        accountId: testAccountId,
        categoryId: null,
        title: "Vacation fund",
        month,
        year,
        amountCents: 20000 // 200€ goal
      },
      {
        accountId: testAccountId,
        categoryId: null,
        title: "Emergency fund",
        month,
        year,
        amountCents: 10000 // 100€ goal
      }
    ]
  });
});

afterAll(async () => {
  if (prisma) {
    await prisma.recurringTransactionSkip.deleteMany({
      where: { recurring: { accountId: testAccountId } }
    });
    await prisma.budget.deleteMany({ where: { accountId: testAccountId } });
    await prisma.recurringTransaction.deleteMany({ where: { accountId: testAccountId } });
    await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
    await prisma.category.deleteMany({ where: { userId: testUserId } });
    await prisma.account.deleteMany({ where: { id: testAccountId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
  }
});

describe("/api/analytics/summary", () => {
  it("returns correct totalBalance across all months", async () => {
    const routes = await import("../app/api/analytics/summary/route");
    const res = await routes.GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    // totalBalance = +1000 - 300 + 500 - 200 - 100 = 900
    expect(data.totalBalance).toBe(900);
  }, 30000);

  it("returns correct carryoverFromLastMonth", async () => {
    const routes = await import("../app/api/analytics/summary/route");
    const res = await routes.GET();
    const data = await res.json();
    // carryover = +1000 - 300 = 700 (transactions before this month)
    expect(data.carryoverFromLastMonth).toBe(700);
  }, 30000);

  it("returns correct current month income total", async () => {
    const routes = await import("../app/api/analytics/summary/route");
    const res = await routes.GET();
    const data = await res.json();
    // Only positive amounts from this month: +500
    expect(data.incomeTotal).toBe(500);
  }, 30000);

  it("returns outcomeTotal excluding savings category", async () => {
    const routes = await import("../app/api/analytics/summary/route");
    const res = await routes.GET();
    const data = await res.json();
    // Only non-savings negative amounts this month: 200 (food)
    expect(data.outcomeTotal).toBe(200);
    expect(data.outcomeTotalExclSavings).toBe(200);
  }, 30000);

  it("tracks monthly savings actual from Savings category", async () => {
    const routes = await import("../app/api/analytics/summary/route");
    const res = await routes.GET();
    const data = await res.json();
    // Savings category transactions this month: |-100| = 100
    expect(data.monthlySavingsActual).toBe(100);
  }, 30000);

  it("computes remaining as income - outcome - savings", async () => {
    const routes = await import("../app/api/analytics/summary/route");
    const res = await routes.GET();
    const data = await res.json();
    // remaining = 500 - 200 - 100 = 200
    expect(data.remaining).toBe(200);
  }, 30000);

  it("aggregates planned savings from all budgets for current month", async () => {
    const routes = await import("../app/api/analytics/summary/route");
    const res = await routes.GET();
    const data = await res.json();
    // 200 + 100 = 300 (sum of both budget goals)
    expect(data.plannedSavings).toBe(300);
  }, 30000);

  it("includes recurring transactions for current month", async () => {
    const routes = await import("../app/api/analytics/summary/route");
    const res = await routes.GET();
    const data = await res.json();
    expect(data.recurringIncomeTotal).toBe(400);
    expect(data.recurringOutcomeTotal).toBe(150);
    expect(data.recurringTransactions).toHaveLength(2);
  }, 30000);

  it("returns projected totals including recurring", async () => {
    const routes = await import("../app/api/analytics/summary/route");
    const res = await routes.GET();
    const data = await res.json();
    // projectedIncomeTotal = 500 + 400 = 900
    expect(data.projectedIncomeTotal).toBe(900);
    // projectedOutcomeTotal = 200 + 150 = 350
    expect(data.projectedOutcomeTotal).toBe(350);
    // projectedRemaining = 900 - 350 - 100 = 450
    expect(data.projectedRemaining).toBe(450);
  }, 30000);

  it("merges recurring into outgoing category breakdown", async () => {
    const routes = await import("../app/api/analytics/summary/route");
    const res = await routes.GET();
    const data = await res.json();
    // Food: 200 (actual) + 150 (recurring) = 350
    const foodCategory = data.outgoingByCategory.find((c: { name: string }) => c.name === "Food");
    expect(foodCategory).toBeDefined();
    expect(foodCategory.amount).toBe(350);
  }, 30000);
});
