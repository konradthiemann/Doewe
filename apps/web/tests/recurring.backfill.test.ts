import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// A standing order that starts in the past is not back-booked unless the user
// asks for it (`RecurringTransaction.bookFromPeriod`, `backfill`). Covers the
// three ways a schedule comes to lie in the past: a start date in the past, a
// shortened interval and "make recurring" on an older booking.
//
// Fixed instants and a pinned clock: same result in any process time zone.
// The clock is pinned to 2029, a year no other test file uses, and the booking
// job only ever runs for this file's own household.

const TEST_USER_ID = "test-user-recurring-backfill";
const ACCOUNT_ID = "acc_recurring_backfill_test";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

/** 19 Nov 2029, 11:00 in Berlin. */
const NOW = new Date("2029-11-19T10:00:00.000Z");
/** 25 Nov 2029, 00:30 in Berlin — still 24 Nov in UTC. */
const NOV_25_JUST_AFTER_MIDNIGHT = new Date("2029-11-24T23:30:00.000Z");

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;

type Template = { id: string; nextOccurrence: string; bookFromPeriod: string | null; dayOfMonth: number };

async function createTemplate(body: Record<string, unknown>): Promise<Template> {
  const { POST } = await import("../app/api/recurring-transactions/route");
  const res = await POST(
    new Request("http://localhost/api/recurring-transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: ACCOUNT_ID, amountCents: -95_000, description: "Miete", ...body })
    })
  );
  expect(res.status).toBe(201);
  return (await res.json()) as Template;
}

async function patchTemplate(id: string, body: Record<string, unknown>): Promise<Template> {
  const { PATCH } = await import("../app/api/recurring-transactions/[id]/route");
  const res = await PATCH(
    new Request(`http://localhost/api/recurring-transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }),
    { params: { id } }
  );
  expect(res.status).toBe(200);
  return (await res.json()) as Template;
}

/** A template as it exists in production today: written before `bookFromPeriod`, so the column is empty. */
async function existingTemplate(anchor: string, dayOfMonth: number, intervalMonths = 1) {
  return prisma.recurringTransaction.create({
    data: {
      accountId: ACCOUNT_ID,
      amountCents: -95_000,
      description: "Miete",
      frequency: "MONTHLY",
      intervalMonths,
      dayOfMonth,
      nextOccurrence: new Date(anchor)
    }
  });
}

/** Periods booked for a template, tombstones included, in order. */
async function periods(recurringId: string): Promise<Array<string | null>> {
  const rows = await prisma.transaction.findMany({
    where: { recurringTransactionId: recurringId },
    select: { recurringPeriod: true },
    orderBy: { recurringPeriod: "asc" }
  });
  return rows.map((row) => row.recurringPeriod);
}

/** What the dashboard load does first: book completed months. */
async function catchUp(now = NOW) {
  const { catchUpPastRecurringForHousehold } = await import("../lib/recurringBooking");
  return (await catchUpPastRecurringForHousehold(householdId, now)).map((b) => [b.year, b.month]);
}

/** The daily booking run, limited to this file's household. */
async function cron(now = NOW, dryRun = false) {
  const { materializeDueRecurringTransactions } = await import("../lib/recurringBooking");
  return (await materializeDueRecurringTransactions(now, { householdId, dryRun })).map((b) => [b.year, b.month]);
}

const monthsFrom = (year: number, month: number, count: number) =>
  Array.from({ length: count }, (_, i) => {
    const absolute = year * 12 + (month - 1) + i;
    return `${Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, "0")}`;
  });

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  await prisma.user.upsert({
    where: { email: "recurring-backfill-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "recurring-backfill-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, TEST_USER_ID);
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: TEST_USER_ID, householdId, deletedAt: null },
    create: { id: ACCOUNT_ID, name: "Recurring backfill test", userId: TEST_USER_ID, householdId }
  });
  await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: ACCOUNT_ID } } });
  await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: ACCOUNT_ID } });

  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterEach(async () => {
  vi.setSystemTime(NOW);
  // Templates first: once they are gone nothing can book for them any more.
  await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: ACCOUNT_ID } } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
});

afterAll(async () => {
  vi.useRealTimers();
  await prisma.account.deleteMany({ where: { id: ACCOUNT_ID } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.$disconnect();
});

describe("a template created today with a start date a year ago", () => {
  it("without backfill books nothing for the past, and the current month once its day has come", async () => {
    const rent = await createTemplate({ startDate: "2028-11-25" });
    expect(rent.nextOccurrence).toBe("2028-11-25T11:00:00.000Z");
    expect(rent.bookFromPeriod).toBe("2029-11");

    // the dashboard load and the daily run on 19 Nov: nothing is due that may be booked
    expect(await catchUp()).toEqual([]);
    expect(await cron()).toEqual([]);
    expect(await periods(rent.id)).toEqual([]);

    // 24 Nov, 23:30 in Berlin: not yet
    expect(await cron(new Date("2029-11-24T22:30:00.000Z"))).toEqual([]);
    expect(await cron(NOV_25_JUST_AFTER_MIDNIGHT)).toEqual([[2029, 11]]);
    expect(await periods(rent.id)).toEqual(["2029-11"]);

    // and it carries on from there
    expect(await cron(new Date("2029-12-25T11:00:00.000Z"))).toEqual([[2029, 12]]);
    expect(await periods(rent.id)).toEqual(["2029-11", "2029-12"]);
  });

  it("with backfill: true books every month since the start", async () => {
    const rent = await createTemplate({ startDate: "2028-11-25", backfill: true });
    expect(rent.bookFromPeriod).toBeNull();

    // completed months on the next dashboard load: Nov 2028 to Oct 2029
    expect(await catchUp()).toHaveLength(12);
    expect(await periods(rent.id)).toEqual(monthsFrom(2028, 11, 12));

    expect(await cron(NOV_25_JUST_AFTER_MIDNIGHT)).toEqual([[2029, 11]]);
    expect(await periods(rent.id)).toEqual(monthsFrom(2028, 11, 13));
  });

  it("a dry run lists nothing before the lower bound either", async () => {
    await createTemplate({ startDate: "2028-11-25" });
    expect(await cron(NOW, true)).toEqual([]);
    expect(await cron(NOV_25_JUST_AFTER_MIDNIGHT, true)).toEqual([[2029, 11]]);
  });

  it("keeps the lower bound where it was set: a month missed by the daily run is caught up later, earlier ones are not", async () => {
    const rent = await createTemplate({ startDate: "2028-11-25" });
    // no daily run in November; the dashboard is opened on 2 December
    expect(await catchUp(new Date("2029-12-02T10:00:00.000Z"))).toEqual([[2029, 11]]);
    expect(await periods(rent.id)).toEqual(["2029-11"]);
  });

  it("still shows the whole schedule: planned this month on the dashboard, every month in the yearly view", async () => {
    const rent = await createTemplate({ startDate: "2028-11-25" });

    const { GET: summary } = await import("../app/api/analytics/summary/route");
    const dashboard = (await (await summary()).json()) as {
      recurringTransactions: Array<{ id: string }>;
      carryoverFromLastMonth: number;
      projectedOutcomeTotal: number;
    };
    expect(dashboard.recurringTransactions.map((r) => r.id)).toEqual([rent.id]);
    expect(dashboard.projectedOutcomeTotal).toBe(950);
    // nothing was booked for the past by loading the dashboard
    expect(dashboard.carryoverFromLastMonth).toBe(0);
    expect(await periods(rent.id)).toEqual([]);

    const { GET: yearly } = await import("../app/api/recurring-transactions/yearly/route");
    const matrix = (await (
      await yearly(new Request("http://localhost/api/recurring-transactions/yearly?year=2029"))
    ).json()) as { expenses: { rows: Array<{ id: string; monthlyCents: number[] }> } };
    expect(matrix.expenses.rows.find((row) => row.id === rent.id)?.monthlyCents).toEqual(
      new Array(12).fill(-95_000)
    );
  });
});

describe("the current month is not the past", () => {
  it("books an occurrence earlier this month on the next run", async () => {
    // start 5 November, created on 19 November
    const rent = await createTemplate({ startDate: "2029-11-05" });
    expect(rent.bookFromPeriod).toBeNull();
    expect(await catchUp()).toEqual([]);
    expect(await cron()).toEqual([[2029, 11]]);
    expect(await periods(rent.id)).toEqual(["2029-11"]);
  });
});

describe("an existing template (no lower bound)", () => {
  it("is booked as before: every due month from its anchor", async () => {
    const rent = await existingTemplate("2029-08-01T00:00:00.000Z", 1);
    expect(rent.bookFromPeriod).toBeNull();

    expect(await catchUp()).toEqual([
      [2029, 8],
      [2029, 9],
      [2029, 10]
    ]);
    expect(await cron()).toEqual([[2029, 11]]);
    expect(await periods(rent.id)).toEqual(["2029-08", "2029-09", "2029-10", "2029-11"]);
  });

  it("keeps its missing months coming after an edit that does not touch the schedule", async () => {
    const rent = await existingTemplate("2029-08-01T00:00:00.000Z", 1);
    // the edit form resends start date, interval and day with every save
    const updated = await patchTemplate(rent.id, {
      description: "Miete neu",
      intervalMonths: 1,
      dayOfMonth: 1,
      startDate: "2029-08-01"
    });
    expect(updated.bookFromPeriod).toBeNull();
    expect(await catchUp()).toHaveLength(3);
  });
});

describe("changing the interval of an existing template", () => {
  it("from 3 to 1 does not book the months in between", async () => {
    // quarterly since January: Jan, Apr, Jul and Oct are booked
    const insurance = await existingTemplate("2029-01-10T11:00:00.000Z", 10, 3);
    expect(await catchUp()).toHaveLength(4);
    expect(await periods(insurance.id)).toEqual(["2029-01", "2029-04", "2029-07", "2029-10"]);

    const updated = await patchTemplate(insurance.id, { intervalMonths: 1, dayOfMonth: 10, startDate: "2029-01-10" });
    expect(updated.bookFromPeriod).toBe("2029-11");

    expect(await catchUp()).toEqual([]);
    expect(await periods(insurance.id)).toEqual(["2029-01", "2029-04", "2029-07", "2029-10"]);

    // monthly from now on: 10 November has passed, so the daily run books it
    expect(await cron()).toEqual([[2029, 11]]);
    expect(await cron(new Date("2029-12-10T11:00:00.000Z"))).toEqual([[2029, 12]]);
    expect(await periods(insurance.id)).toEqual(["2029-01", "2029-04", "2029-07", "2029-10", "2029-11", "2029-12"]);
  });

  it("books the months in between when the user asks for it", async () => {
    const insurance = await existingTemplate("2029-01-10T11:00:00.000Z", 10, 3);
    await catchUp();

    const updated = await patchTemplate(insurance.id, { intervalMonths: 1, backfill: true });
    expect(updated.bookFromPeriod).toBeNull();
    expect(await catchUp()).toEqual([
      [2029, 2],
      [2029, 3],
      [2029, 5],
      [2029, 6],
      [2029, 8],
      [2029, 9]
    ]);
  });

  it("moving the start date into the past does not back-book either", async () => {
    const rent = await createTemplate({ startDate: "2029-12-01" });
    const updated = await patchTemplate(rent.id, { startDate: "2029-03-01" });
    expect(updated.bookFromPeriod).toBe("2029-11");
    expect(await catchUp()).toEqual([]);
    // 1 November has passed: the current month is booked by the daily run
    expect(await cron()).toEqual([[2029, 11]]);
  });
});

describe("make recurring on an older booking", () => {
  async function makeRecurring(transactionId: string, body: Record<string, unknown>): Promise<Template> {
    const { POST } = await import("../app/api/transactions/[id]/make-recurring/route");
    const res = await POST(
      new Request(`http://localhost/api/transactions/${transactionId}/make-recurring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }),
      { params: { id: transactionId } }
    );
    expect(res.status).toBe(201);
    return (await res.json()) as Template;
  }

  it("on a two-month-old booking does not book last month", async () => {
    // paid by hand on 10 September, turned into a standing order on 19 November
    const source = await prisma.transaction.create({
      data: {
        accountId: ACCOUNT_ID,
        amountCents: -4_999,
        description: "Fitnessstudio",
        occurredAt: new Date("2029-09-10T10:00:00.000Z")
      }
    });
    const recurring = await makeRecurring(source.id, { intervalMonths: 1 });
    expect(recurring.nextOccurrence).toBe("2029-10-10T10:00:00.000Z");
    expect(recurring.bookFromPeriod).toBe("2029-11");

    expect(await catchUp()).toEqual([]);
    // the origin booking is September's occurrence; October stays unbooked
    expect(await periods(recurring.id)).toEqual(["2029-09"]);

    // the series continues from now: 10 November has passed
    expect(await cron()).toEqual([[2029, 11]]);
    expect(await periods(recurring.id)).toEqual(["2029-09", "2029-11"]);
  });

  it("takes the current month from the Berlin calendar", async () => {
    const source = await prisma.transaction.create({
      data: {
        accountId: ACCOUNT_ID,
        amountCents: -4_999,
        description: "Fitnessstudio",
        occurredAt: new Date("2029-09-10T10:00:00.000Z")
      }
    });
    // 1 Dec 00:30 in Berlin — still 30 Nov in UTC
    vi.setSystemTime(new Date("2029-11-30T23:30:00.000Z"));
    const recurring = await makeRecurring(source.id, { intervalMonths: 1 });
    expect(recurring.bookFromPeriod).toBe("2029-12");
  });
});
