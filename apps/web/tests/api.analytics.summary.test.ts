import { execSync } from "node:child_process";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const appDir = path.resolve(__dirname, "..");
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/doewe?schema=public";
}

const TEST_USER_ID = "test-user-analytics";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

beforeAll(() => {
  execSync("npx prisma generate", { cwd: appDir, stdio: "inherit", env: process.env });
  execSync("npx prisma db push --force-reset", { cwd: appDir, stdio: "inherit", env: process.env });
});

afterAll(() => {
  // cleanup if needed
});

describe("/api/analytics/summary", () => {
  it("returns totalBalance and carryoverFromLastMonth", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    // Create test user and account
    const user = await prisma.user.create({
      data: { id: TEST_USER_ID, email: "analytics-test@example.com", password: "hashed" }
    });
    const account = await prisma.account.create({ data: { name: "Analytics Test Account", userId: user.id } });

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);

    // Create transactions: one from last month, two from this month
    await prisma.transaction.createMany({
      data: [
        {
          accountId: account.id,
          amountCents: 100000, // +1000€ income last month
          description: "Last month income",
          occurredAt: lastMonth
        },
        {
          accountId: account.id,
          amountCents: -30000, // -300€ expense last month
          description: "Last month expense",
          occurredAt: lastMonth
        },
        {
          accountId: account.id,
          amountCents: 50000, // +500€ income this month
          description: "This month income",
          occurredAt: new Date(thisMonthStart.getTime() + 86400000) // day 2 of this month
        },
        {
          accountId: account.id,
          amountCents: -20000, // -200€ expense this month
          description: "This month expense",
          occurredAt: new Date(thisMonthStart.getTime() + 2 * 86400000) // day 3 of this month
        }
      ]
    });

    // Import route after env + schema are ready
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

    await prisma.$disconnect();
  }, 30000);
});
