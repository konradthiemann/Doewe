import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { checkBudgetAlerts } from "../lib/budgetAlerts";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// checkBudgetAlerts: the "spent" figure it compares with the budget follows
// docs/calculations/00-grundregeln.md — the Berlin month of the booking, all
// accounts of the household, classifyFlow, plus recurring occurrences that are
// due but not booked for that month. Observed through the BudgetAlertLog rows
// it writes, keyed by household, category, month and threshold (the push
// itself is a no-op without a subscription; who is notified is covered by
// budgetAlerts.household.test.ts).
// Fixed UTC instants and a pinned clock (19 Nov 2031): same result in any
// process time zone, and November 2031 is the current month, so its budgets are
// computed live.

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

/** A legacy per-month Budget row. */
async function budget(categoryId: string, amountCents: number, month = 11): Promise<string> {
  const row = await prisma.budget.create({
    data: { accountId: ACCOUNT_ID, categoryId, month, year: 2031, amountCents }
  });
  return row.id;
}

/** A budget plan — the only kind of budget the app's pages create. */
async function plan(categoryId: string, amountCents: number, period: "MONTHLY" | "YEARLY" = "MONTHLY"): Promise<void> {
  await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId, period, amountCents } });
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

async function template(
  amountCents: number,
  anchor = nov(25),
  accountId = ACCOUNT_ID,
  bookFromPeriod: string | null = null
): Promise<string> {
  const row = await prisma.recurringTransaction.create({
    data: {
      accountId,
      categoryId: foodId,
      amountCents,
      description: "BA standing order",
      frequency: "MONTHLY",
      intervalMonths: 1,
      dayOfMonth: 25,
      nextOccurrence: anchor,
      bookFromPeriod
    }
  });
  return row.id;
}

async function loggedThresholds(categoryId = foodId, month = 11): Promise<number[]> {
  const rows = await prisma.budgetAlertLog.findMany({
    where: { householdId, categoryId, year: 2031, month },
    orderBy: { threshold: "asc" }
  });
  return rows.map((row) => row.threshold);
}

/** Runs the check as the transaction routes do after a booking and returns the logged thresholds. */
async function alertsFor(occurredAt = nov(10), categoryId = foodId): Promise<number[]> {
  await checkBudgetAlerts({ householdId, categoryId, occurredAt });
  return loggedThresholds(categoryId);
}

async function clean() {
  await prisma.budgetAlertLog.deleteMany({ where: { householdId } });
  await prisma.budgetMonthSnapshot.deleteMany({ where: { householdId } });
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
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
  vi.useFakeTimers({ toFake: ["Date"], now: nov(19) });
});

beforeEach(clean);

afterAll(async () => {
  vi.useRealTimers();
  await clean();
  await prisma.category.deleteMany({ where: { householdId } });
  await prisma.account.deleteMany({ where: { id: { in: ACCOUNT_IDS } } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.$disconnect();
});

describe("checkBudgetAlerts — thresholds", () => {
  it("logs nothing below 80 %, 80 once it is reached, and 100 with 80 when both are reached at once", async () => {
    await budget(foodId, 10_000);
    await booking(-7_900, nov(3));
    expect(await alertsFor()).toEqual([]);

    await booking(-100, nov(4));
    expect(await alertsFor()).toEqual([80]);
    // the same threshold is reported once
    expect(await alertsFor()).toEqual([80]);

    await booking(-2_000, nov(5));
    expect(await alertsFor()).toEqual([80, 100]);
  });

  it("marks 80 as sent when 100 is the first threshold reached", async () => {
    await budget(foodId, 10_000);
    await booking(-12_000, nov(3));
    expect(await alertsFor()).toEqual([80, 100]);
  });

  it("does nothing for a booking without a category or without a budget in that month", async () => {
    await budget(foodId, 10_000, 10); // October budget only
    await booking(-20_000, nov(3));
    await checkBudgetAlerts({ householdId, categoryId: null, occurredAt: nov(3) });
    expect(await alertsFor()).toEqual([]);
    expect(await prisma.budgetAlertLog.count({ where: { householdId } })).toBe(0);
  });
});

describe("checkBudgetAlerts — budget plans", () => {
  it("alerts for a category that only has a MONTHLY plan and no per-month Budget row", async () => {
    await plan(foodId, 10_000);
    await booking(-7_900, nov(3));
    expect(await alertsFor()).toEqual([]);

    await booking(-600, nov(4));
    expect(await alertsFor()).toEqual([80]);

    const rows = await prisma.budgetAlertLog.findMany({ where: { householdId } });
    expect(rows.map((r) => [r.budgetId, r.categoryId, r.year, r.month, r.threshold])).toEqual([
      [null, foodId, 2031, 11, 80]
    ]);

    await booking(-1_500, nov(5));
    expect(await alertsFor()).toEqual([80, 100]);
  });

  it("alerts against the monthly share of a YEARLY plan", async () => {
    // No standing orders in the fixture: the yearly amount is spread evenly, 100 € per month.
    await plan(foodId, 120_000, "YEARLY");
    await booking(-7_900, nov(3));
    expect(await alertsFor()).toEqual([]);
    await booking(-100, nov(4));
    expect(await alertsFor()).toEqual([80]);
  });

  it("keeps each month's thresholds apart", async () => {
    await plan(foodId, 10_000);
    await booking(-9_000, nov(3));
    expect(await alertsFor()).toEqual([80]);

    const december = new Date(Date.UTC(2031, 11, 3, 11));
    await booking(-8_500, december);
    await checkBudgetAlerts({ householdId, categoryId: foodId, occurredAt: december });
    expect(await loggedThresholds(foodId, 12)).toEqual([80]);
    expect(await loggedThresholds(foodId, 11)).toEqual([80]);
  });
});

describe("checkBudgetAlerts — thresholds announced before the log was keyed by category", () => {
  // Such a row carries the id of the per-month Budget row it was logged for;
  // the migration added household and category to it.
  it("does not announce 80 % again, but still announces 100 %", async () => {
    const budgetId = await budget(foodId, 10_000);
    await prisma.budgetAlertLog.create({
      data: { budgetId, householdId, categoryId: foodId, year: 2031, month: 11, threshold: 80 }
    });

    await booking(-8_500, nov(3));
    expect(await alertsFor()).toEqual([80]);
    expect(await prisma.budgetAlertLog.count({ where: { householdId } })).toBe(1);

    await booking(-2_000, nov(4));
    expect(await alertsFor()).toEqual([80, 100]);
    const rows = await prisma.budgetAlertLog.findMany({ where: { householdId }, orderBy: { threshold: "asc" } });
    expect(rows.map((r) => r.budgetId)).toEqual([budgetId, null]);
  });

  it("does not announce 100 % again when it was announced before", async () => {
    const budgetId = await budget(foodId, 10_000);
    await prisma.budgetAlertLog.createMany({
      data: [80, 100].map((threshold) => ({ budgetId, householdId, categoryId: foodId, year: 2031, month: 11, threshold }))
    });
    await booking(-15_000, nov(3));
    expect(await alertsFor()).toEqual([80, 100]);
    expect(await prisma.budgetAlertLog.count({ where: { householdId } })).toBe(2);
  });
});

describe("checkBudgetAlerts — spent follows the calculation rules", () => {
  it("uses the Berlin month of the booking", async () => {
    await budget(foodId, 10_000);
    // 1 Nov 00:30 in Berlin — still 31 Oct in UTC: November
    const firstMinutes = new Date("2031-10-31T23:30:00.000Z");
    await booking(-8_500, firstMinutes);
    // 31 Oct 23:30 in Berlin: October, must not count
    await booking(-9_000, new Date("2031-10-31T22:30:00.000Z"));
    // 1 Dec 00:30 in Berlin — still 30 Nov in UTC: December, must not count
    await booking(-9_000, new Date("2031-11-30T23:30:00.000Z"));

    expect(await alertsFor(firstMinutes)).toEqual([80]);
  });

  it("adds up the category's spend on all accounts of the household", async () => {
    await budget(foodId, 10_000);
    await booking(-5_000, nov(3));
    await booking(-3_500, nov(4), { accountId: SECOND_ACCOUNT_ID });
    expect(await alertsFor()).toEqual([80]);
  });

  it("does not let a refund reduce the spend, and ignores deleted bookings", async () => {
    await budget(foodId, 10_000);
    await booking(-8_000, nov(3));
    await booking(5_000, nov(4)); // refund: income
    await booking(-9_000, nov(5), { deletedAt: nov(6) });
    expect(await alertsFor()).toEqual([80]);
  });

  it("never alerts for a savings category: deposits are not spending", async () => {
    await budget(savingsId, 10_000);
    await booking(-20_000, nov(3), { categoryId: savingsId });
    expect(await alertsFor(nov(3), savingsId)).toEqual([]);
  });
});

describe("checkBudgetAlerts — recurring occurrences", () => {
  it("counts a due, not yet booked occurrence as spent, on any account", async () => {
    await budget(foodId, 10_000);
    await template(-8_500, nov(25), SECOND_ACCOUNT_ID);
    await booking(-100, nov(3));
    expect(await alertsFor()).toEqual([80]);
  });

  it("does not count an occurrence twice once it is booked", async () => {
    await budget(foodId, 10_000);
    const rent = await template(-5_000);
    await booking(-5_000, nov(25), { recurringTransactionId: rent, recurringPeriod: "2031-11" });
    // 5,000 booked + 0 planned = 50 %
    expect(await alertsFor()).toEqual([]);
  });

  it("treats a deleted or moved booking as booked: it is not planned again", async () => {
    await budget(foodId, 10_000);
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
    expect(await alertsFor()).toEqual([]);
  });

  it("reads the anchor month in Berlin and respects skips", async () => {
    await budget(foodId, 10_000);
    // first due on 1 Dec 00:30 in Berlin (23:30 UTC on 30 Nov): not due in November
    await template(-9_000, new Date("2031-11-30T23:30:00.000Z"));
    const skipped = await template(-9_000);
    await prisma.recurringTransactionSkip.create({ data: { recurringId: skipped, year: 2031, month: 11 } });
    await booking(-100, nov(3));
    expect(await alertsFor()).toEqual([]);
  });

  it("does not plan an occurrence before the first month the standing order may be booked", async () => {
    await budget(foodId, 10_000);
    // Due every month from October on, but only booked from December.
    await template(-9_000, new Date(Date.UTC(2031, 9, 25, 10)), ACCOUNT_ID, "2031-12");
    await booking(-100, nov(3));
    expect(await alertsFor()).toEqual([]);

    // From its first bookable month on it counts as planned.
    await budget(foodId, 10_000, 12);
    const december = new Date(Date.UTC(2031, 11, 3, 11));
    await checkBudgetAlerts({ householdId, categoryId: foodId, occurredAt: december });
    expect(await loggedThresholds(foodId, 12)).toEqual([80]);
  });
});
