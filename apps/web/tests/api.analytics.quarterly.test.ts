import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Use the same DATABASE_URL as the main app (set by pretest or .env)
const TEST_USER_ID = "test-user-quarterly";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

let prisma: import("@prisma/client").PrismaClient;
let testUserId: string;
let testHouseholdId: string;
let testAccountId: string;

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "quarterly-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "quarterly-test@example.com", password: "hashed" }
  });
  testUserId = user.id;
  testHouseholdId = await ensureTestHousehold(prisma, user.id);

  const account = await prisma.account.upsert({
    where: { id: "acc_quarterly_test" },
    update: { userId: user.id, householdId: testHouseholdId },
    create: { id: "acc_quarterly_test", name: "Quarterly Test Account", userId: user.id, householdId: testHouseholdId }
  });
  testAccountId = account.id;

  // Savings category with trailing whitespace in the name — the summary and
  // saving-plan routes recognize it (they trim before matching), quarterly
  // did not (DB-level `mode: "insensitive"` only ignores case, not whitespace).
  const savingsCat = await prisma.category.upsert({
    where: { householdId_name: { householdId: testHouseholdId, name: "Savings " } },
    update: {},
    create: { name: "Savings ", userId: user.id, householdId: testHouseholdId }
  });

  await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  await prisma.transaction.create({
    data: {
      accountId: testAccountId,
      categoryId: savingsCat.id,
      amountCents: -15000, // -150€ deposit into savings this month
      description: "Savings deposit",
      occurredAt: new Date(thisMonthStart.getTime() + 1 * 86400000)
    }
  });
});

afterAll(async () => {
  if (prisma) {
    await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
    await prisma.category.deleteMany({ where: { userId: testUserId } });
    await prisma.account.deleteMany({ where: { id: testAccountId } });
    await cleanupTestHousehold(prisma, testUserId);
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
  }
});

describe("/api/analytics/quarterly", () => {
  it("recognizes a savings category name with surrounding whitespace, consistent with /api/analytics/summary", async () => {
    const routes = await import("../app/api/analytics/quarterly/route");
    const res = await routes.GET();
    const data = await res.json();

    const currentQuarter = data.quarters[data.quarters.length - 1];

    // The deposit must land in savingsCents, not be misclassified as an expense.
    expect(currentQuarter.savingsCents).toBe(15000);
    expect(currentQuarter.outcomeCents).toBe(0);
    expect(currentQuarter.incomeCents).toBe(0);
  }, 30000);
});
