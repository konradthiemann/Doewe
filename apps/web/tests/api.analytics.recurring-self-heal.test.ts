import { zonedMonthRange } from "@doewe/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Self-healing: monthly-review and summary book due recurring transactions of
// past months for the requesting household on read, so a missing/broken cron
// can never silently leave completed months without their standing orders.
//
// Fixed instants and a pinned clock: "past month" and the anchor month are
// Berlin calendar months, whatever time zone the process runs in.

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

/** 19 Nov 2026, 11:00 in Berlin. */
const NOW = new Date("2026-11-19T10:00:00.000Z");
const prevMonth = 10;
const prevYear = 2026;
/**
 * 1 Aug 2026 the way a dev machine in Berlin stored anchors so far: local
 * midnight, which is still 31 July in UTC. It must read back as August —
 * three months before NOW, so August, September and October are past and due.
 */
const ANCHOR = new Date("2026-07-31T22:00:00.000Z");

async function fetchReview(): Promise<{ outcomeCents: number }> {
  const { GET } = await import("../app/api/analytics/monthly-review/route");
  const res = await GET(
    new Request(`http://localhost/api/analytics/monthly-review?month=${prevMonth}&year=${prevYear}`)
  );
  expect(res.status).toBe(200);
  return (await res.json()) as { outcomeCents: number };
}

async function bookingsIn(recurringId: string, year: number, month: number): Promise<number> {
  const { start, end } = zonedMonthRange(year, month);
  return prisma.transaction.count({
    where: { recurringTransactionId: recurringId, deletedAt: null, occurredAt: { gte: start, lt: end } }
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
  const recurring = (accountId: string, amountCents: number, description: string, nextOccurrence = ANCHOR) =>
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
    await recurring(ACCOUNT_ID, -2000, "Starts this month", new Date("2026-11-01T11:00:00.000Z"))
  ).id;
  otherHouseholdId = (await recurring(OTHER_ACCOUNT_ID, -777, "Other household")).id;

  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterAll(async () => {
  vi.useRealTimers();
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

  it("reads a Berlin-midnight anchor as its Berlin month: nothing is booked for the month before", async () => {
    // The anchor instant lies on 31 July in UTC. July must stay empty.
    await fetchReview();
    expect(await bookingsIn(rentId, 2026, 7)).toBe(0);
    const rows = await prisma.transaction.findMany({
      where: { recurringTransactionId: rentId },
      orderBy: { recurringPeriod: "asc" }
    });
    expect(rows.map((row) => row.recurringPeriod)).toEqual(["2026-08", "2026-09", "2026-10"]);
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
    expect(await bookingsIn(currentMonthOnlyId, 2026, 11)).toBe(0);
    expect(data.recurringTransactions.map((r) => r.id)).toContain(currentMonthOnlyId);
  }, 30000);

  it("keeps booking the remaining occurrences when one booking fails", async () => {
    const { catchUpPastRecurringForHousehold } = await import("../lib/recurringBooking");
    const { prisma: appPrisma } = await import("../lib/prisma");
    await prisma.transaction.deleteMany({ where: { recurringTransactionId: rentId } });
    const spy = vi.spyOn(appPrisma, "$transaction").mockRejectedValueOnce(new Error("simulated FK violation"));
    try {
      const booked = await catchUpPastRecurringForHousehold(`hh_${TEST_USER_ID}`, NOW);
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
    const booked = await catchUpPastRecurringForHousehold(`hh_${TEST_USER_ID}`, NOW);
    expect(booked.map((o) => o.recurringId)).toContain(rentId);
    expect(booked.map((o) => o.recurringId)).not.toContain(otherHouseholdId);
  }, 30000);

  it("treats a month as completed once it has ended in Berlin, not in UTC", async () => {
    const { catchUpPastRecurringForHousehold } = await import("../lib/recurringBooking");
    const novemberOf = (booked: Array<{ recurringId: string; year: number; month: number }>) =>
      booked.filter((o) => o.recurringId === currentMonthOnlyId).map((o) => [o.year, o.month]);

    // 30 Nov 23:30 in Berlin: November is still the current month.
    const before = await catchUpPastRecurringForHousehold(`hh_${TEST_USER_ID}`, new Date("2026-11-30T22:30:00.000Z"));
    expect(novemberOf(before)).toEqual([]);

    // 1 Dec 00:30 in Berlin — still 30 Nov in UTC: November is complete.
    const after = await catchUpPastRecurringForHousehold(`hh_${TEST_USER_ID}`, new Date("2026-11-30T23:30:00.000Z"));
    expect(novemberOf(after)).toEqual([[2026, 11]]);
    expect(await bookingsIn(currentMonthOnlyId, 2026, 11)).toBe(1);
  }, 30000);
});
