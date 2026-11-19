import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Acceptance test for docs/calculations/00-grundregeln.md §1 and §4: a
// recurring occurrence is identified by (recurringTransactionId,
// recurringPeriod), is dated at noon in Berlin, and becomes due by the Berlin
// calendar. Moving or deleting the booking must not make it come back.
// Fixed instants and a pinned "now": same result in any process time zone.

const TEST_USER_ID = "test-user-recurring-occurrence";
const ACCOUNT_ID = "acc_recurring_occurrence_test";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

/** 19 Nov 2026, 11:00 in Berlin. */
const NOW = new Date("2026-11-19T10:00:00.000Z");

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let taxCategoryId: string;

type Booking = { id: string; occurredAt: Date; recurringPeriod: string | null; deletedAt: Date | null; taxRelevant: boolean };

async function template(description: string, anchor: string, dayOfMonth: number, extra: { categoryId?: string } = {}) {
  return prisma.recurringTransaction.create({
    data: {
      accountId: ACCOUNT_ID,
      amountCents: -50_000,
      description,
      frequency: "MONTHLY",
      intervalMonths: 1,
      dayOfMonth,
      nextOccurrence: new Date(anchor),
      ...extra
    }
  });
}

/** All bookings of a template, tombstones included, oldest period first. */
async function bookings(recurringId: string): Promise<Booking[]> {
  const rows = await prisma.transaction.findMany({
    where: { recurringTransactionId: recurringId },
    select: { id: true, occurredAt: true, recurringPeriod: true, deletedAt: true, taxRelevant: true },
    orderBy: [{ recurringPeriod: "asc" }, { createdAt: "asc" }]
  });
  return rows;
}

const live = (rows: Booking[]) => rows.filter((row) => row.deletedAt === null);

async function catchUp(now = NOW) {
  const { catchUpPastRecurringForHousehold } = await import("../lib/recurringBooking");
  return catchUpPastRecurringForHousehold(householdId, now);
}

async function cron(now = NOW) {
  const { materializeDueRecurringTransactions } = await import("../lib/recurringBooking");
  return materializeDueRecurringTransactions(now, { householdId });
}

async function deleteTransaction(id: string) {
  const { DELETE } = await import("../app/api/transactions/[id]/route");
  const res = await DELETE(new Request(`http://localhost/api/transactions/${id}`, { method: "DELETE" }), {
    params: { id }
  });
  expect(res.status).toBe(204);
}

async function moveTransaction(id: string, occurredAt: string) {
  const { PATCH } = await import("../app/api/transactions/[id]/route");
  const res = await PATCH(
    new Request(`http://localhost/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: ACCOUNT_ID, amountCents: -50_000, description: "moved", occurredAt })
    }),
    { params: { id } }
  );
  expect(res.status).toBe(200);
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  await prisma.user.upsert({
    where: { email: "recurring-occurrence-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "recurring-occurrence-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, TEST_USER_ID);
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: TEST_USER_ID, householdId, deletedAt: null },
    create: { id: ACCOUNT_ID, name: "Recurring occurrence test", userId: TEST_USER_ID, householdId }
  });
  await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: ACCOUNT_ID } } });
  await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  taxCategoryId = (
    await prisma.category.upsert({
      where: { householdId_name: { householdId, name: "RO Donations" } },
      update: { isTaxRelevant: true },
      create: { name: "RO Donations", isTaxRelevant: true, userId: TEST_USER_ID, householdId }
    })
  ).id;

  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterEach(async () => {
  vi.setSystemTime(NOW);
  // Each test owns its templates; clear them so runs never depend on order.
  await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: ACCOUNT_ID } } });
  await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
});

afterAll(async () => {
  vi.useRealTimers();
  await prisma.category.deleteMany({ where: { householdId } });
  await prisma.account.deleteMany({ where: { id: ACCOUNT_ID } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.$disconnect();
});

describe("booking an occurrence", () => {
  it("dates it at noon in Berlin and records the month it was booked for", async () => {
    // Anchor stored the way production wrote it so far: UTC midnight.
    const rent = await template("rent", "2026-09-01T00:00:00.000Z", 1);
    await catchUp();

    const rows = await bookings(rent.id);
    expect(rows.map((row) => row.recurringPeriod)).toEqual(["2026-09", "2026-10"]);
    // 12:00 CEST = 10:00 UTC on both days (clocks change on 25 Oct)
    expect(rows.map((row) => row.occurredAt.toISOString())).toEqual([
      "2026-09-01T10:00:00.000Z",
      "2026-10-01T10:00:00.000Z"
    ]);
  });

  it("clamps day 31 to the last day of a shorter month", async () => {
    const rent = await template("rent end of month", "2026-09-30T10:00:00.000Z", 31);
    await catchUp();
    const rows = await bookings(rent.id);
    expect(rows.map((row) => row.occurredAt.toISOString())).toEqual([
      "2026-09-30T10:00:00.000Z",
      "2026-10-31T11:00:00.000Z" // 12:00 CET
    ]);
  });

  it("is idempotent", async () => {
    const rent = await template("rent", "2026-09-01T00:00:00.000Z", 1);
    await catchUp();
    expect(await catchUp()).toEqual([]);
    expect(await bookings(rent.id)).toHaveLength(2);
  });

  it("inherits the category's tax flag, like a manual booking", async () => {
    const donation = await template("donation", "2026-10-05T10:00:00.000Z", 5, { categoryId: taxCategoryId });
    await catchUp();
    const rows = await bookings(donation.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].taxRelevant).toBe(true);
  });
});

describe("an occurrence stays booked when the user changes the booking", () => {
  it("does not book a deleted occurrence again", async () => {
    const rent = await template("rent", "2026-09-01T00:00:00.000Z", 1);
    await catchUp();
    const october = (await bookings(rent.id))[1];

    await deleteTransaction(october.id);
    expect(await catchUp()).toEqual([]);
    expect(await cron(new Date("2026-10-31T12:00:00.000Z"))).toEqual([]);

    const rows = await bookings(rent.id);
    expect(rows).toHaveLength(2);
    expect(live(rows).map((row) => row.recurringPeriod)).toEqual(["2026-09"]);
  });

  it("does not book a month again after its booking was moved into the previous month", async () => {
    const rent = await template("rent", "2026-09-01T00:00:00.000Z", 1);
    await catchUp();
    const october = (await bookings(rent.id))[1];

    await moveTransaction(october.id, "2026-09-30T10:00:00.000Z");
    expect(await catchUp()).toEqual([]);

    const rows = await bookings(rent.id);
    expect(rows).toHaveLength(2);
    expect(rows[1].recurringPeriod).toBe("2026-10");
    expect(rows[1].occurredAt.toISOString()).toBe("2026-09-30T10:00:00.000Z");
  });

  it("still books the next month after a booking was moved into it", async () => {
    const rent = await template("rent", "2026-11-01T00:00:00.000Z", 1);
    expect(await cron()).toHaveLength(1);
    const november = (await bookings(rent.id))[0];

    // paid late: the user moves November's booking to 2 December
    await moveTransaction(november.id, "2026-12-02T11:00:00.000Z");
    expect(await cron()).toEqual([]);

    const inDecember = await cron(new Date("2026-12-05T10:00:00.000Z"));
    expect(inDecember.map((b) => [b.year, b.month])).toEqual([[2026, 12]]);
    expect((await bookings(rent.id)).map((row) => row.recurringPeriod)).toEqual(["2026-11", "2026-12"]);
  });

  it("no longer plans a current-month occurrence on the dashboard once its booking was deleted", async () => {
    const donation = await template("donation", "2026-11-05T10:00:00.000Z", 5);
    expect(await cron()).toHaveLength(1);
    await deleteTransaction((await bookings(donation.id))[0].id);

    const { GET } = await import("../app/api/analytics/summary/route");
    const body = (await (await GET()).json()) as {
      recurringTransactions: Array<{ id: string }>;
      projectedOutcomeTotal: number;
    };
    expect(body.recurringTransactions.map((r) => r.id)).not.toContain(donation.id);
    expect(body.projectedOutcomeTotal).toBe(0);
    expect(await cron()).toEqual([]);
  });
});

describe("bookings written before recurringPeriod existed", () => {
  it("counts a UTC-midnight booking for the Berlin month of its date", async () => {
    const gym = await template("gym", "2026-10-01T00:00:00.000Z", 1);
    await prisma.transaction.create({
      data: {
        accountId: ACCOUNT_ID,
        amountCents: -50_000,
        description: "gym",
        occurredAt: new Date("2026-10-01T00:00:00.000Z"),
        recurringTransactionId: gym.id
      }
    });
    expect(await catchUp()).toEqual([]);
    expect(await bookings(gym.id)).toHaveLength(1);
  });

  it("counts a Berlin-midnight booking (23:00 UTC the day before) for the new month", async () => {
    const phone = await template("phone", "2026-10-31T23:00:00.000Z", 1);
    await prisma.transaction.create({
      data: {
        accountId: ACCOUNT_ID,
        amountCents: -50_000,
        description: "phone",
        occurredAt: new Date("2026-10-31T23:00:00.000Z"),
        recurringTransactionId: phone.id
      }
    });
    // anchor and booking both mean November; October must not be booked, November not twice
    expect(await catchUp()).toEqual([]);
    expect(await cron()).toEqual([]);
    expect(await bookings(phone.id)).toHaveLength(1);
  });
});

describe("an occurrence becomes due by the Berlin calendar", () => {
  it("is not booked at 23:30 on the day before, but is at 00:30 on its day", async () => {
    const insurance = await template("insurance", "2026-11-20T11:00:00.000Z", 20);

    // 19 Nov 23:30 in Berlin
    expect(await cron(new Date("2026-11-19T22:30:00.000Z"))).toEqual([]);

    // 20 Nov 00:30 in Berlin — still 19 Nov in UTC
    const booked = await cron(new Date("2026-11-19T23:30:00.000Z"));
    expect(booked.map((b) => [b.year, b.month])).toEqual([[2026, 11]]);
    const rows = await bookings(insurance.id);
    expect(rows[0].occurredAt.toISOString()).toBe("2026-11-20T11:00:00.000Z");
    expect(rows[0].recurringPeriod).toBe("2026-11");
  });

  it("books the new month's first-day occurrence right after midnight in Berlin", async () => {
    const rent = await template("rent", "2026-12-01T11:00:00.000Z", 1);
    // 1 Dec 00:30 in Berlin — 30 Nov in UTC
    const booked = await cron(new Date("2026-11-30T23:30:00.000Z"));
    expect(booked.map((b) => [b.year, b.month])).toEqual([[2026, 12]]);
    expect((await bookings(rent.id))[0].recurringPeriod).toBe("2026-12");
  });
});
