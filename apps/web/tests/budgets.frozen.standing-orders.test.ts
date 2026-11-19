import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// A YEARLY budget plan is spread over the months by the standing orders of its
// year. Creating, editing or deleting a standing order must therefore freeze
// the budgets of the months that are over first — otherwise the budget of a
// month long gone would change afterwards. Fixed instants, pinned clock.

const TEST_USER_ID = "test-user-frozen-standing";
const ACCOUNT_ID = "acc_frozen_standing";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

/** 19 Nov 2033, 11:00 in Berlin. */
const NOW = new Date("2033-11-19T10:00:00.000Z");

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let groceriesId: string;

async function frozenGroceries(): Promise<Record<string, number>> {
  const rows = await prisma.budgetMonthSnapshot.findMany({
    where: { householdId, year: 2033 },
    orderBy: { month: "asc" }
  });
  return Object.fromEntries(
    rows.map((row) => [String(row.month), (row.budgets as Record<string, number>)[groceriesId] ?? 0])
  );
}

async function postTemplate(body: Record<string, unknown>) {
  const { POST } = await import("../app/api/recurring-transactions/route");
  const res = await POST(
    new Request("http://localhost/api/recurring-transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: ACCOUNT_ID, ...body })
    })
  );
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  await prisma.user.upsert({
    where: { email: "frozen-standing@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "frozen-standing@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, TEST_USER_ID);
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: TEST_USER_ID, householdId, deletedAt: null },
    create: { id: ACCOUNT_ID, name: "Frozen standing", userId: TEST_USER_ID, householdId }
  });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterEach(async () => {
  vi.setSystemTime(NOW);
  await prisma.budgetMonthSnapshot.deleteMany({ where: { householdId } });
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
  await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: ACCOUNT_ID } } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.category.deleteMany({ where: { householdId } });
});

afterAll(async () => {
  vi.useRealTimers();
  await prisma.account.deleteMany({ where: { id: ACCOUNT_ID } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.$disconnect();
});

/**
 * Salary of 3,000 € every month since January and a YEARLY groceries plan of
 * 1,200 €: every month has the same room, so the plan is 100 € per month.
 */
async function setUp() {
  groceriesId = (
    await prisma.category.create({ data: { name: "FS Groceries", userId: TEST_USER_ID, householdId } })
  ).id;
  await prisma.categoryBudgetPlan.create({
    data: { householdId, categoryId: groceriesId, period: "YEARLY", amountCents: 120_000 }
  });
  await prisma.recurringTransaction.create({
    data: {
      accountId: ACCOUNT_ID,
      amountCents: 300_000,
      description: "Gehalt",
      frequency: "MONTHLY",
      intervalMonths: 1,
      dayOfMonth: 1,
      nextOccurrence: new Date("2033-01-01T11:00:00.000Z")
    }
  });
  // The earliest booking decides where freezing starts.
  await prisma.transaction.create({
    data: {
      accountId: ACCOUNT_ID,
      categoryId: groceriesId,
      amountCents: -4_000,
      description: "Einkauf",
      occurredAt: new Date("2033-01-10T11:00:00.000Z")
    }
  });
}

const tenEach = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), 10_000]));

describe("standing orders and frozen budgets", () => {
  it("creating a standing order keeps the YEARLY plan's share of the months that are over", async () => {
    await setUp();
    expect(await frozenGroceries()).toEqual({});

    // Rent of 1,000 € from March changes how the plan would be spread now.
    await postTemplate({
      amountCents: -100_000,
      description: "Miete",
      intervalMonths: 1,
      dayOfMonth: 1,
      startDate: "2033-03-01"
    });

    expect(await frozenGroceries()).toEqual(tenEach);
  });

  it("deleting a standing order keeps them too", async () => {
    await setUp();
    const rent = await prisma.recurringTransaction.create({
      data: {
        accountId: ACCOUNT_ID,
        amountCents: -100_000,
        description: "Miete",
        frequency: "MONTHLY",
        intervalMonths: 1,
        dayOfMonth: 1,
        nextOccurrence: new Date("2033-03-01T11:00:00.000Z")
      }
    });
    // With the rent, January and February have more room than March to October.
    const { loadEffectiveCategoryBudgetsForYear } = await import("../lib/categoryBudgets");
    const withRent = (await loadEffectiveCategoryBudgetsForYear({ householdId, year: 2033 }))[groceriesId];
    expect(withRent?.[0]).toBeGreaterThan(withRent?.[2] ?? 0);
    const frozenWithRent = await frozenGroceries();
    await prisma.budgetMonthSnapshot.deleteMany({ where: { householdId } });

    const { DELETE } = await import("../app/api/recurring-transactions/[id]/route");
    const res = await DELETE(new Request(`http://localhost/api/recurring-transactions/${rent.id}`), {
      params: { id: rent.id }
    });
    expect(res.status).toBe(204);

    // Frozen before the delete: still the split with the rent, not 100 € each.
    expect(await frozenGroceries()).toEqual(frozenWithRent);
    expect(await frozenGroceries()).not.toEqual(tenEach);
  });
});
