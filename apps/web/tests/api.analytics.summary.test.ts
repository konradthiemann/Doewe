import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Use the same DATABASE_URL as the main app (set by pretest or .env)
// pretest already runs: prisma generate && prisma db push && db:seed

const TEST_USER_ID = "test-user-analytics";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

let prisma: import("@prisma/client").PrismaClient;
let testUserId: string;
let testAccountId: string;

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
  
  // Clean up any existing transactions for this test account
  await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
  
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);

  // Create transactions: some from last month, some from this month
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
        occurredAt: lastMonth
      },
      {
        accountId: testAccountId,
        amountCents: 50000, // +500€ income this month
        description: "This month income",
        occurredAt: new Date(thisMonthStart.getTime() + 86400000) // day 2 of this month
      },
      {
        accountId: testAccountId,
        amountCents: -20000, // -200€ expense this month
        description: "This month expense",
        occurredAt: new Date(thisMonthStart.getTime() + 2 * 86400000) // day 3 of this month
      }
    ]
  });
});

afterAll(async () => {
  // Cleanup test data
  if (prisma) {
    await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
    await prisma.account.deleteMany({ where: { id: testAccountId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
  }
});

describe("/api/analytics/summary", () => {
  it("returns totalBalance and carryoverFromLastMonth", async () => {
    // Import route
    const routes = await import("../app/api/analytics/summary/route");
    const res = await routes.GET();

    expect(res.status).toBe(200);
    const data = await res.json();

    // totalBalance = +1000 - 300 + 500 - 200 = 1000€
    expect(data.totalBalance).toBe(1000);

    // carryoverFromLastMonth = +1000 - 300 = 700€ (transactions before this month)
    expect(data.carryoverFromLastMonth).toBe(700);

    // Also verify existing fields still work
    expect(data.incomeTotal).toBe(500); // this month only
    expect(typeof data.remaining).toBe("number");
  }, 30000);
});
