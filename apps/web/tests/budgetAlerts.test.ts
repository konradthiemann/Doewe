import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { checkBudgetAlerts } from "../lib/budgetAlerts";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// checkBudgetAlerts: the "spent" figure it compares with the budget follows
// docs/calculations/00-grundregeln.md — the Berlin month of the booking, all
// accounts of the household, classifyFlow, plus recurring occurrences that are
// due but not booked for that month. Observed through the BudgetAlertLog rows
// it writes (the push itself is a no-op without a subscription).
// Fixed UTC instants: same result in any process time zone.

const TEST_USER_ID = "test-user-budget-alerts";
const ACCOUNT_ID = "acc_budget_alerts";
const SECOND_ACCOUNT_ID = "acc_budget_alerts_second";
const ACCOUNT_IDS = [ACCOUNT_ID, SECOND_ACCOUNT_ID];

/** Noon in Berlin on a day of November 2031 (CET = UTC+1). */
const nov = (day: number) => new Date(Date.UTC(2031, 10, day, 11));

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let foodId: string;
let savingsId: string;
let budgetIds: string[] = [];

async function budget(categoryId: string, amountCents: number, month = 11): Promise<string> {
  const row = await prisma.budget.create({
    data: { accountId: ACCOUNT_ID, categoryId, month, year: 2031, amountCents }
  });
  budgetIds.push(row.id);
  return row.id;
}

async function booking(
  amountCents: number,
  occurredAt: Date,
  extra: {
    categoryId?: string;
    accountId?: string;
    recurringTransactionId?: string;
    recurringPeriod?: string;
    deletedAt?: Date;
  } = {}
): Promise<void> {
  await prisma.transaction.create({
    data: { accountId: ACCOUNT_ID, categoryId: foodId, amountCents, description: "BA booking", occurredAt, ...extra }
  });
}

async function template(amountCents: number, anchor = nov(25), accountId = ACCOUNT_ID): Promise<string> {
  const row = await prisma.recurringTransaction.create({
    data: {
      accountId,
      categoryId: foodId,
      amountCents,
      description: "BA standing order",
      frequency: "MONTHLY",
      intervalMonths: 1,
      dayOfMonth: 25,
      nextOccurrence: anchor
    }
  });
  return row.id;
}

/** Runs the check as the transaction route does after a booking and returns the logged thresholds. */
async function alertsFor(budgetId: string, occurredAt = nov(10), categoryId = foodId): Promise<number[]> {
  await checkBudgetAlerts({ accountId: ACCOUNT_ID, userId: TEST_USER_ID, categoryId, occurredAt });
  const rows = await prisma.budgetAlertLog.findMany({ where: { budgetId }, orderBy: { threshold: "asc" } });
  return rows.map((row) => row.threshold);
}

async function clean() {
  await prisma.budgetAlertLog.deleteMany({ where: { budgetId: { in: budgetIds } } });
  budgetIds = [];
  await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: { in: ACCOUNT_IDS } } } });
  await prisma.transaction.deleteMany({ where: { accountId: { in: ACCOUNT_IDS } } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: { in: ACCOUNT_IDS } } });
  await prisma.budget.deleteMany({ where: { accountId: { in: ACCOUNT_IDS } } });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "budget-alerts-test@example.com" },
    update: { notifyBudgetAlerts: true },
    create: { id: TEST_USER_ID, email: "budget-alerts-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id);
  for (const id of ACCOUNT_IDS) {
    await prisma.account.upsert({
      where: { id },
      update: { userId: user.id, householdId, deletedAt: null },
      create: { id, name: id, userId: user.id, householdId }
    });
  }
  const mk = async (name: string) =>
    (
      await prisma.category.upsert({
        where: { householdId_name: { householdId, name } },
        update: { deletedAt: null },
        create: { name, userId: user.id, householdId }
      })
    ).id;
  foodId = await mk("BA Food");
  savingsId = await mk(" Sparen ");
});

beforeEach(clean);

afterAll(async () => {
  await clean();
  await prisma.category.deleteMany({ where: { householdId } });
  await prisma.account.deleteMany({ where: { id: { in: ACCOUNT_IDS } } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.$disconnect();
});

describe("checkBudgetAlerts — thresholds", () => {
  it("logs nothing below 80 %, 80 once it is reached, and 100 with 80 when both are reached at once", async () => {
    const id = await budget(foodId, 10_000);
    await booking(-7_900, nov(3));
    expect(await alertsFor(id)).toEqual([]);

    await booking(-100, nov(4));
    expect(await alertsFor(id)).toEqual([80]);
    // the same threshold is reported once
    expect(await alertsFor(id)).toEqual([80]);

    await booking(-2_000, nov(5));
    expect(await alertsFor(id)).toEqual([80, 100]);
  });

  it("does nothing for a booking without a category or without a budget in that month", async () => {
    const id = await budget(foodId, 10_000, 10); // October budget only
    await booking(-20_000, nov(3));
    await checkBudgetAlerts({ accountId: ACCOUNT_ID, userId: TEST_USER_ID, categoryId: null, occurredAt: nov(3) });
    expect(await alertsFor(id)).toEqual([]);
  });
});

describe("checkBudgetAlerts — spent follows the calculation rules", () => {
  it("uses the Berlin month of the booking", async () => {
    const id = await budget(foodId, 10_000);
    // 1 Nov 00:30 in Berlin — still 31 Oct in UTC: November
    const firstMinutes = new Date("2031-10-31T23:30:00.000Z");
    await booking(-8_500, firstMinutes);
    // 31 Oct 23:30 in Berlin: October, must not count
    await booking(-9_000, new Date("2031-10-31T22:30:00.000Z"));
    // 1 Dec 00:30 in Berlin — still 30 Nov in UTC: December, must not count
    await booking(-9_000, new Date("2031-11-30T23:30:00.000Z"));

    expect(await alertsFor(id, firstMinutes)).toEqual([80]);
  });

  it("adds up the category's spend on all accounts of the household", async () => {
    const id = await budget(foodId, 10_000);
    await booking(-5_000, nov(3));
    await booking(-3_500, nov(4), { accountId: SECOND_ACCOUNT_ID });
    expect(await alertsFor(id)).toEqual([80]);
  });

  it("does not let a refund reduce the spend, and ignores deleted bookings", async () => {
    const id = await budget(foodId, 10_000);
    await booking(-8_000, nov(3));
    await booking(5_000, nov(4)); // refund: income
    await booking(-9_000, nov(5), { deletedAt: nov(6) });
    expect(await alertsFor(id)).toEqual([80]);
  });

  it("never alerts for a savings category: deposits are not spending", async () => {
    const id = await budget(savingsId, 10_000);
    await booking(-20_000, nov(3), { categoryId: savingsId });
    expect(await alertsFor(id, nov(3), savingsId)).toEqual([]);
  });
});

describe("checkBudgetAlerts — recurring occurrences", () => {
  it("counts a due, not yet booked occurrence as spent, on any account", async () => {
    const id = await budget(foodId, 10_000);
    await template(-8_500, nov(25), SECOND_ACCOUNT_ID);
    await booking(-100, nov(3));
    expect(await alertsFor(id)).toEqual([80]);
  });

  it("does not count an occurrence twice once it is booked", async () => {
    const id = await budget(foodId, 10_000);
    const rent = await template(-5_000);
    await booking(-5_000, nov(25), { recurringTransactionId: rent, recurringPeriod: "2031-11" });
    // 5,000 booked + 0 planned = 50 %
    expect(await alertsFor(id)).toEqual([]);
  });

  it("treats a deleted or moved booking as booked: it is not planned again", async () => {
    const id = await budget(foodId, 10_000);
    const deleted = await template(-5_000);
    const moved = await template(-4_000);
    await booking(-5_000, nov(25), { recurringTransactionId: deleted, recurringPeriod: "2031-11", deletedAt: nov(26) });
    // November's occurrence, moved back into October by the user
    await booking(-4_000, new Date("2031-10-30T11:00:00.000Z"), {
      recurringTransactionId: moved,
      recurringPeriod: "2031-11"
    });
    await booking(-1_000, nov(3));
    // 1,000 booked in November, nothing planned
    expect(await alertsFor(id)).toEqual([]);
  });

  it("reads the anchor month in Berlin and respects skips", async () => {
    const id = await budget(foodId, 10_000);
    // first due on 1 Dec 00:30 in Berlin (23:30 UTC on 30 Nov): not due in November
    await template(-9_000, new Date("2031-11-30T23:30:00.000Z"));
    const skipped = await template(-9_000);
    await prisma.recurringTransactionSkip.create({ data: { recurringId: skipped, year: 2031, month: 11 } });
    await booking(-100, nov(3));
    expect(await alertsFor(id)).toEqual([]);
  });
});
