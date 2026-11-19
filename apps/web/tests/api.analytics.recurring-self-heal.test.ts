import { shiftMonth, zonedMonth, zonedMonthRange, zonedTimeToUtc } from "@doewe/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Self-healing: monthly-review, summary, quarterly and category-year book due
// recurring transactions of past months for the requesting household on read,
// so a missing/broken cron can never silently leave completed months without
// their standing orders — and the tiles the dashboard loads in parallel all
// see the same bookings.

const TEST_USER_ID = "test-user-recurring-self-heal";
const OTHER_USER_ID = "test-user-recurring-self-heal-other";
const ACCOUNT_ID = "acc_recurring_self_heal_test";
const OTHER_ACCOUNT_ID = "acc_recurring_self_heal_other";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

let prisma: import("@prisma/client").PrismaClient;
let rentId: string;
let skippedId: string;
let currentMonthOnlyId: string;
let otherHouseholdId: string;

// Months are calendar months in Europe/Berlin; anchors are dated at noon in
// Berlin on the 1st, which is the same day in any process time zone.
const now = new Date();
const current = zonedMonth(now);
const { year: prevYear, month: prevMonth } = shiftMonth(current, -1);
const firstOf = (delta: number) => zonedTimeToUtc({ ...shiftMonth(current, delta), day: 1, hour: 12 });
const monthRange = (year: number, month: number) => {
  const { start, end } = zonedMonthRange(year, month);
  return { gte: start, lt: end };
};

async function fetchReview(): Promise<{ outcomeCents: number }> {
  const { GET } = await import("../app/api/analytics/monthly-review/route");
  const res = await GET(
    new Request(`http://localhost/api/analytics/monthly-review?month=${prevMonth}&year=${prevYear}`)
  );
  expect(res.status).toBe(200);
  return (await res.json()) as { outcomeCents: number };
}

async function bookingsIn(recurringId: string, year: number, month: number): Promise<number> {
  return prisma.transaction.count({
    where: { recurringTransactionId: recurringId, deletedAt: null, occurredAt: monthRange(year, month) }
  });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  for (const [userId, accountId] of [
    [TEST_USER_ID, ACCOUNT_ID],
    [OTHER_USER_ID, OTHER_ACCOUNT_ID]
  ]) {
    await prisma.user.upsert({
      where: { email: `${userId}@example.com` },
      update: {},
      create: { id: userId, email: `${userId}@example.com`, password: "hashed" }
    });
    const householdId = await ensureTestHousehold(prisma, userId);
    await prisma.account.upsert({
      where: { id: accountId },
      update: { userId, householdId },
      create: { id: accountId, name: `Self-heal ${userId}`, userId, householdId }
    });
    await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId } } });
    await prisma.transaction.deleteMany({ where: { accountId } });
    await prisma.recurringTransaction.deleteMany({ where: { accountId } });
  }

  // Anchored 3 months back, so the previous month is due but was never booked.
  const anchor = firstOf(-3);
  const recurring = (accountId: string, amountCents: number, description: string, nextOccurrence = anchor) =>
    prisma.recurringTransaction.create({
      data: {
        accountId,
        amountCents,
        description,
        frequency: "MONTHLY",
        intervalMonths: 1,
        dayOfMonth: 1,
        nextOccurrence
      }
    });

  rentId = (await recurring(ACCOUNT_ID, -113000, "Rent")).id;
  skippedId = (await recurring(ACCOUNT_ID, -5000, "Skipped last month")).id;
  await prisma.recurringTransactionSkip.create({ data: { recurringId: skippedId, year: prevYear, month: prevMonth } });
  // First due in the current month: must stay "planned", never booked on read.
  currentMonthOnlyId = (
    await recurring(ACCOUNT_ID, -2000, "Starts this month", firstOf(0))
  ).id;
  otherHouseholdId = (await recurring(OTHER_ACCOUNT_ID, -777, "Other household")).id;
});

afterAll(async () => {
  if (prisma) {
    for (const [userId, accountId] of [
      [TEST_USER_ID, ACCOUNT_ID],
      [OTHER_USER_ID, OTHER_ACCOUNT_ID]
    ]) {
      await prisma.transaction.deleteMany({ where: { accountId } });
      await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId } } });
      await prisma.recurringTransaction.deleteMany({ where: { accountId } });
      await prisma.account.deleteMany({ where: { id: accountId } });
      await cleanupTestHousehold(prisma, userId);
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  }
});

describe("recurring self-healing on read", () => {
  it("monthly-review counts due but never-booked recurring expenses of the reviewed month", async () => {
    const data = await fetchReview();
    expect(data.outcomeCents).toBe(113000);
    expect(await bookingsIn(rentId, prevYear, prevMonth)).toBe(1);
  }, 30000);

  it("does not book a skipped month", async () => {
    await fetchReview();
    expect(await bookingsIn(skippedId, prevYear, prevMonth)).toBe(0);
  }, 30000);

  it("books each month at most once, even under concurrent requests", async () => {
    // Start from "never booked" so the parallel requests really race.
    await prisma.transaction.deleteMany({ where: { recurringTransactionId: rentId } });
    await Promise.all([fetchReview(), fetchReview(), fetchReview(), fetchReview()]);
    expect(await bookingsIn(rentId, prevYear, prevMonth)).toBe(1);
  }, 30000);

  it("summary catches up past months but leaves the current month as planned", async () => {
    const { GET } = await import("../app/api/analytics/summary/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { carryoverFromLastMonth: number; recurringTransactions: { id: string }[] };

    // 3 past months of rent (-1130 each) + 2 unskipped past months of -50.
    expect(data.carryoverFromLastMonth).toBe(-3490);
    expect(await bookingsIn(currentMonthOnlyId, current.year, current.month)).toBe(0);
    expect(data.recurringTransactions.map((r) => r.id)).toContain(currentMonthOnlyId);
  }, 30000);

  it("quarterly books missed occurrences before computing, so it matches the review", async () => {
    await prisma.transaction.deleteMany({ where: { recurringTransactionId: rentId } });
    const { GET } = await import("../app/api/analytics/quarterly/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      quarters: Array<{ month: number; year: number; outcomeCents: number; balanceCents: number }>;
    };

    expect(await bookingsIn(rentId, prevYear, prevMonth)).toBe(1);
    const column = data.quarters.find((q) => q.month === prevMonth && q.year === prevYear);
    expect(column?.outcomeCents).toBe((await fetchReview()).outcomeCents);
    expect(column?.outcomeCents).toBe(113000);
    // 3 past months of rent + 2 unskipped past months of -50
    expect(column?.balanceCents).toBe(-349000);
  }, 30000);

  it("category-year books missed occurrences before computing", async () => {
    await prisma.transaction.deleteMany({ where: { recurringTransactionId: rentId } });
    const { GET } = await import("../app/api/analytics/category-year/route");
    const res = await GET(new Request(`http://localhost/api/analytics/category-year?year=${prevYear}`));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { expenses: { monthlyTotalsCents: number[] } };

    expect(await bookingsIn(rentId, prevYear, prevMonth)).toBe(1);
    expect(data.expenses.monthlyTotalsCents[prevMonth - 1]).toBe(113000);
  }, 30000);

  it("keeps booking the remaining occurrences when one booking fails", async () => {
    const { catchUpPastRecurringForHousehold } = await import("../lib/recurringBooking");
    const { prisma: appPrisma } = await import("../lib/prisma");
    await prisma.transaction.deleteMany({ where: { recurringTransactionId: rentId } });
    const spy = vi.spyOn(appPrisma, "$transaction").mockRejectedValueOnce(new Error("simulated FK violation"));
    try {
      const booked = await catchUpPastRecurringForHousehold(`hh_${TEST_USER_ID}`, now);
      // 3 past rent months due, the first booking attempt fails -> 2 still booked.
      expect(booked.filter((o) => o.recurringId === rentId)).toHaveLength(2);
    } finally {
      spy.mockRestore();
    }
  }, 30000);

  it("only books recurring transactions of the requesting household", async () => {
    // Checked on the catch-up's own result: the global cron test may book the
    // other household's row in parallel, which is fine and not under test here.
    const { catchUpPastRecurringForHousehold } = await import("../lib/recurringBooking");
    await prisma.transaction.deleteMany({ where: { recurringTransactionId: { in: [rentId, otherHouseholdId] } } });
    const booked = await catchUpPastRecurringForHousehold(`hh_${TEST_USER_ID}`, now);
    expect(booked.map((o) => o.recurringId)).toContain(rentId);
    expect(booked.map((o) => o.recurringId)).not.toContain(otherHouseholdId);
  }, 30000);
});
