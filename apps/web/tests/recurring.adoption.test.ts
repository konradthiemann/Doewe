import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

import type { BookedOccurrence } from "../lib/recurringBooking";

// A payment the user entered by hand is recognised as the occurrence of a
// standing order instead of being booked a second time, and the dashboard does
// not count it once as booked and once as planned.
//
// Fixed instants and a pinned clock: "within 7 days" and "current month" are
// Berlin calendar values, whatever time zone the process runs in. The clock is
// pinned to 2029 and the booking job only ever runs for this file's household.

const TEST_USER_ID = "test-user-recurring-adoption";
const ACCOUNT_ID = "acc_recurring_adoption_test";
const SECOND_ACCOUNT_ID = "acc_recurring_adoption_second";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

/** 19 Nov 2029, 11:00 in Berlin. */
const NOW = new Date("2029-11-19T10:00:00.000Z");
const RENT_CENTS = -95_000;

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let rentCategoryId: string;
let otherCategoryId: string;

type TemplateOptions = {
  description?: string;
  amountCents?: number;
  categoryId?: string | null;
  accountId?: string;
  bookFromPeriod?: string;
  intervalMonths?: number;
};

/** A standing order for the rent, booked on `dayOfMonth`, running since the month of `anchor`. */
async function template(dayOfMonth: number, anchor: string, options: TemplateOptions = {}) {
  return prisma.recurringTransaction.create({
    data: {
      accountId: options.accountId ?? ACCOUNT_ID,
      categoryId: options.categoryId === undefined ? rentCategoryId : options.categoryId,
      amountCents: options.amountCents ?? RENT_CENTS,
      description: options.description ?? "Miete",
      frequency: "MONTHLY",
      intervalMonths: options.intervalMonths ?? 1,
      dayOfMonth,
      nextOccurrence: new Date(anchor),
      bookFromPeriod: options.bookFromPeriod
    }
  });
}

type ManualOptions = {
  description?: string;
  amountCents?: number;
  categoryId?: string | null;
  accountId?: string;
  deletedAt?: Date;
  recurringTransactionId?: string;
  createdAt?: Date;
};

/** A booking the user typed in. */
async function manual(occurredAt: string, options: ManualOptions = {}) {
  return prisma.transaction.create({
    data: {
      accountId: options.accountId ?? ACCOUNT_ID,
      categoryId: options.categoryId === undefined ? rentCategoryId : options.categoryId,
      amountCents: options.amountCents ?? RENT_CENTS,
      description: options.description ?? "Miete überwiesen",
      occurredAt: new Date(occurredAt),
      createdByUserId: TEST_USER_ID,
      taxRelevant: true,
      deletedAt: options.deletedAt,
      recurringTransactionId: options.recurringTransactionId,
      createdAt: options.createdAt
    }
  });
}

const link = async (id: string) => {
  const row = await prisma.transaction.findUniqueOrThrow({ where: { id } });
  return [row.recurringTransactionId, row.recurringPeriod];
};

/** Live bookings on the test accounts. */
const bookingCount = () =>
  prisma.transaction.count({ where: { accountId: { in: [ACCOUNT_ID, SECOND_ACCOUNT_ID] }, deletedAt: null } });

/** The daily booking run, limited to this file's household. */
async function cron(now = NOW, dryRun = false): Promise<BookedOccurrence[]> {
  const { materializeDueRecurringTransactions } = await import("../lib/recurringBooking");
  return materializeDueRecurringTransactions(now, { householdId, dryRun });
}

async function catchUp(now = NOW): Promise<BookedOccurrence[]> {
  const { catchUpPastRecurringForHousehold } = await import("../lib/recurringBooking");
  return catchUpPastRecurringForHousehold(householdId, now);
}

async function adopt(now = NOW): Promise<BookedOccurrence[]> {
  const { adoptManualBookingsForCurrentMonth } = await import("../lib/recurringBooking");
  return adoptManualBookingsForCurrentMonth(householdId, now);
}

type Dashboard = {
  outcomeTotal: number;
  projectedOutcomeTotal: number;
  recurringOutcomeTotal: number;
  recurringDueOutcomeTotal: number;
  recurringDueCount: number;
  recurringTransactions: Array<{ id: string }>;
};

async function dashboard(): Promise<Dashboard> {
  const { GET } = await import("../app/api/analytics/summary/route");
  const res = await GET();
  expect(res.status).toBe(200);
  return (await res.json()) as Dashboard;
}

const brief = (occurrences: BookedOccurrence[]) =>
  occurrences.map((o) => ({ recurringId: o.recurringId, period: `${o.year}-${o.month}`, adopted: o.adopted }));

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  await prisma.user.upsert({
    where: { email: "recurring-adoption-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "recurring-adoption-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, TEST_USER_ID);
  for (const id of [ACCOUNT_ID, SECOND_ACCOUNT_ID]) {
    await prisma.account.upsert({
      where: { id },
      update: { userId: TEST_USER_ID, householdId, deletedAt: null },
      create: { id, name: `Recurring adoption ${id}`, userId: TEST_USER_ID, householdId }
    });
    await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: id } } });
    await prisma.transaction.deleteMany({ where: { accountId: id } });
    await prisma.recurringTransaction.deleteMany({ where: { accountId: id } });
  }
  const category = (name: string) =>
    prisma.category.upsert({
      where: { householdId_name: { householdId, name } },
      update: {},
      create: { name, userId: TEST_USER_ID, householdId }
    });
  rentCategoryId = (await category("AD Wohnen")).id;
  otherCategoryId = (await category("AD Sonstiges")).id;

  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterEach(async () => {
  vi.setSystemTime(NOW);
  const accounts = { in: [ACCOUNT_ID, SECOND_ACCOUNT_ID] };
  // Templates first: once they are gone nothing can book for them any more.
  await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: accounts } } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: accounts } });
  await prisma.transaction.deleteMany({ where: { accountId: accounts } });
});

afterAll(async () => {
  vi.useRealTimers();
  await prisma.category.deleteMany({ where: { householdId } });
  await prisma.account.deleteMany({ where: { id: { in: [ACCOUNT_ID, SECOND_ACCOUNT_ID] } } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.$disconnect();
});

describe("the booking run recognises a payment entered by hand", () => {
  it("adopts the rent typed in the day before the due day instead of booking it again", async () => {
    const rent = await template(3, "2029-11-03T11:00:00.000Z");
    // 2 Nov, 09:00 in Berlin; another description, as a person would type it
    const typed = await manual("2029-11-02T08:00:00.000Z");
    const before = await prisma.transaction.findUniqueOrThrow({ where: { id: typed.id } });

    // the daily run on the due day, 3 Nov
    const result = await cron(new Date("2029-11-03T05:00:00.000Z"));
    expect(result).toEqual([
      {
        recurringId: rent.id,
        accountId: ACCOUNT_ID,
        transactionId: typed.id,
        year: 2029,
        month: 11,
        amountCents: RENT_CENTS,
        description: "Miete",
        adopted: true
      }
    ]);
    expect(await bookingCount()).toBe(1);

    // only the link is written; the booking stays what the user entered
    const after = await prisma.transaction.findUniqueOrThrow({ where: { id: typed.id } });
    expect(after).toEqual({
      ...before,
      recurringTransactionId: rent.id,
      recurringPeriod: "2029-11",
      updatedAt: after.updatedAt
    });

    // the occurrence is booked now: nothing more happens
    expect(await cron(new Date("2029-11-03T05:00:00.000Z"))).toEqual([]);
    expect(await cron()).toEqual([]);
    expect(await bookingCount()).toBe(1);
  });

  it("adopts when catching up a completed month, too", async () => {
    // standing order on the 1st since September; October was paid by hand on the 2nd
    const rent = await template(1, "2029-09-01T10:00:00.000Z");
    const typed = await manual("2029-10-02T10:00:00.000Z");

    expect(brief(await catchUp())).toEqual([
      { recurringId: rent.id, period: "2029-9", adopted: false },
      { recurringId: rent.id, period: "2029-10", adopted: true }
    ]);
    expect(await link(typed.id)).toEqual([rent.id, "2029-10"]);
    expect(await bookingCount()).toBe(2);
  });

  it("lets a payment made a few days early in the previous month stand for the new month", async () => {
    const rent = await template(1, "2029-11-01T11:00:00.000Z");
    await cron(); // November is booked
    // December's rent, transferred on 28 November
    const typed = await manual("2029-11-28T11:00:00.000Z");

    expect(brief(await cron(new Date("2029-12-01T11:00:00.000Z")))).toEqual([
      { recurringId: rent.id, period: "2029-12", adopted: true }
    ]);
    // the period is the month it stands for, not the month of its date
    expect(await link(typed.id)).toEqual([rent.id, "2029-12"]);
    expect(await bookingCount()).toBe(2);
  });

  it("a dry run reports what would be adopted and writes nothing", async () => {
    const rent = await template(3, "2029-11-03T11:00:00.000Z");
    const twin = await template(3, "2029-11-03T11:00:00.000Z", { description: "Miete Garage" });
    const typed = await manual("2029-11-02T08:00:00.000Z");

    const result = await cron(NOW, true);
    expect(result.every((o) => o.transactionId === null)).toBe(true);
    // one hand-entered booking stands for one occurrence only: the second template would book
    expect(result.map((o) => o.adopted).sort()).toEqual([false, true]);
    expect(new Set(result.map((o) => o.recurringId))).toEqual(new Set([rent.id, twin.id]));
    expect(await link(typed.id)).toEqual([null, null]);
    expect(await bookingCount()).toBe(1);
  });
});

describe("the dashboard recognises a payment entered before the due day", () => {
  it("does not count the rent once as booked and once as planned", async () => {
    // due on the 25th; typed in on 18 November, "today" is the 19th
    const rent = await template(25, "2029-08-25T10:00:00.000Z");
    await catchUp(); // Aug, Sep and Oct are booked, as on every dashboard load so far
    const typed = await manual("2029-11-18T09:00:00.000Z");

    const data = await dashboard();
    expect(data.outcomeTotal).toBe(950);
    expect(data.recurringTransactions).toEqual([]);
    expect(data.recurringOutcomeTotal).toBe(0);
    expect(data.projectedOutcomeTotal).toBe(950);
    // the standing order is still one of this month's fixed costs
    expect(data.recurringDueOutcomeTotal).toBe(950);
    expect(data.recurringDueCount).toBe(1);

    expect(await link(typed.id)).toEqual([rent.id, "2029-11"]);

    // on the due day the daily run has nothing left to book
    expect(await cron(new Date("2029-11-25T11:00:00.000Z"))).toEqual([]);
    expect(await bookingCount()).toBe(4);
  });

  it("creates nothing: an occurrence without a matching payment stays planned", async () => {
    const rent = await template(25, "2029-11-25T11:00:00.000Z");
    expect(await adopt()).toEqual([]);

    const data = await dashboard();
    expect(data.recurringTransactions.map((r) => r.id)).toEqual([rent.id]);
    expect(data.outcomeTotal).toBe(0);
    expect(data.projectedOutcomeTotal).toBe(950);
    expect(await bookingCount()).toBe(0);
  });

  it("also adopts for an occurrence whose day has passed but that the daily run has not booked yet", async () => {
    const rent = await template(10, "2029-11-10T11:00:00.000Z");
    const typed = await manual("2029-11-09T11:00:00.000Z");
    expect(brief(await adopt())).toEqual([{ recurringId: rent.id, period: "2029-11", adopted: true }]);
    expect(await link(typed.id)).toEqual([rent.id, "2029-11"]);
    expect(await cron()).toEqual([]);
  });

  it("reports the adopted booking's id", async () => {
    await template(25, "2029-11-25T11:00:00.000Z");
    const typed = await manual("2029-11-18T09:00:00.000Z");
    expect((await adopt()).map((o) => [o.transactionId, o.adopted])).toEqual([[typed.id, true]]);
  });

  it("leaves a template that is not due this month alone", async () => {
    // quarterly, due in October and January
    await template(25, "2029-10-25T10:00:00.000Z", { intervalMonths: 3 });
    await catchUp();
    const typed = await manual("2029-11-25T11:00:00.000Z");
    expect(await adopt()).toEqual([]);
    expect(await link(typed.id)).toEqual([null, null]);
  });
});

describe("what counts as the same payment", () => {
  /** Rent due on 15 November; returns whether the booking was adopted by the dashboard load. */
  async function adoptedFor(occurredAt: string, options: ManualOptions = {}, templateOptions: TemplateOptions = {}) {
    const rent = await template(15, "2029-11-15T11:00:00.000Z", templateOptions);
    const typed = await manual(occurredAt, options);
    await adopt();
    const [linkedTo] = await link(typed.id);
    return linkedTo === rent.id;
  }

  it("is within 7 calendar days before or after the due day, counted in Berlin", async () => {
    // 8 Nov 00:30 in Berlin (7 Nov in UTC): 7 days before
    expect(await adoptedFor("2029-11-07T23:30:00.000Z")).toBe(true);
  });

  it("is not 8 days before the due day", async () => {
    // 7 Nov 23:30 in Berlin
    expect(await adoptedFor("2029-11-07T22:30:00.000Z")).toBe(false);
  });

  it("is still the same payment 7 days after the due day", async () => {
    // 22 Nov 23:30 in Berlin
    expect(await adoptedFor("2029-11-22T22:30:00.000Z")).toBe(true);
  });

  it("is not 8 days after the due day", async () => {
    // 23 Nov 00:30 in Berlin (22 Nov in UTC)
    expect(await adoptedFor("2029-11-22T23:30:00.000Z")).toBe(false);
  });

  it("needs exactly the same amount", async () => {
    expect(await adoptedFor("2029-11-15T11:00:00.000Z", { amountCents: RENT_CENTS - 1 })).toBe(false);
  });

  it("needs the same sign", async () => {
    expect(await adoptedFor("2029-11-15T11:00:00.000Z", { amountCents: -RENT_CENTS })).toBe(false);
  });

  it("needs the same account", async () => {
    expect(await adoptedFor("2029-11-15T11:00:00.000Z", { accountId: SECOND_ACCOUNT_ID })).toBe(false);
  });

  it("needs the same category, whatever the description", async () => {
    expect(await adoptedFor("2029-11-15T11:00:00.000Z", { categoryId: otherCategoryId, description: "Miete" })).toBe(false);
  });

  it("does not take a booking without category for a template that has one", async () => {
    expect(await adoptedFor("2029-11-15T11:00:00.000Z", { categoryId: null, description: "Miete" })).toBe(false);
  });

  it("without a category on the template: no category and the same description, ignoring case and outer whitespace", async () => {
    expect(
      await adoptedFor("2029-11-15T11:00:00.000Z", { categoryId: null, description: "  MIETE " }, { categoryId: null })
    ).toBe(true);
  });

  it("without a category on the template: another description is another payment", async () => {
    expect(
      await adoptedFor("2029-11-15T11:00:00.000Z", { categoryId: null, description: "Miete Garage" }, { categoryId: null })
    ).toBe(false);
  });

  it("without a category on the template: a booking that has a category is another payment", async () => {
    expect(
      await adoptedFor("2029-11-15T11:00:00.000Z", { description: "Miete" }, { categoryId: null })
    ).toBe(false);
  });

  it("is not a deleted booking", async () => {
    expect(await adoptedFor("2029-11-15T11:00:00.000Z", { deletedAt: new Date("2029-11-16T10:00:00.000Z") })).toBe(false);
  });

  it("is not a booking that already belongs to another standing order", async () => {
    const other = await template(15, "2029-12-15T11:00:00.000Z", { description: "Anderer Dauerauftrag" });
    const rent = await template(15, "2029-11-15T11:00:00.000Z");
    const typed = await manual("2029-11-15T11:00:00.000Z", { recurringTransactionId: other.id });

    expect(await adopt()).toEqual([]);
    expect(await link(typed.id)).toEqual([other.id, null]);

    // so the rent is still planned, and booked on its day
    expect((await dashboard()).recurringTransactions.map((r) => r.id)).toEqual([rent.id]);
    expect(brief(await cron())).toEqual([{ recurringId: rent.id, period: "2029-11", adopted: false }]);
    expect(await bookingCount()).toBe(2);
  });

  it("takes the booking closest to the due day", async () => {
    const rent = await template(15, "2029-11-15T11:00:00.000Z");
    const early = await manual("2029-11-12T11:00:00.000Z");
    const close = await manual("2029-11-14T11:00:00.000Z");
    const late = await manual("2029-11-18T11:00:00.000Z");

    await adopt();
    expect(await link(close.id)).toEqual([rent.id, "2029-11"]);
    expect(await link(early.id)).toEqual([null, null]);
    expect(await link(late.id)).toEqual([null, null]);
  });

  it("takes the oldest of two equally close bookings", async () => {
    const rent = await template(15, "2029-11-15T11:00:00.000Z");
    const second = await manual("2029-11-14T11:00:00.000Z", { createdAt: new Date("2029-11-14T18:00:00.000Z") });
    const first = await manual("2029-11-14T11:00:00.000Z", { createdAt: new Date("2029-11-14T09:00:00.000Z") });

    await adopt();
    expect(await link(first.id)).toEqual([rent.id, "2029-11"]);
    expect(await link(second.id)).toEqual([null, null]);
  });
});

describe("what is never adopted", () => {
  it("nothing for an occurrence the user skipped", async () => {
    const rent = await template(15, "2029-11-15T11:00:00.000Z");
    await prisma.recurringTransactionSkip.create({ data: { recurringId: rent.id, year: 2029, month: 11 } });
    const typed = await manual("2029-11-15T11:00:00.000Z");

    expect(await adopt()).toEqual([]);
    expect(await cron()).toEqual([]);
    expect(await link(typed.id)).toEqual([null, null]);
    expect(await bookingCount()).toBe(1);
  });

  it("nothing for a month before bookFromPeriod", async () => {
    // running since September, but only booked from November on
    const rent = await template(1, "2029-09-01T10:00:00.000Z", { bookFromPeriod: "2029-11" });
    const october = await manual("2029-10-01T10:00:00.000Z");

    expect(await catchUp()).toEqual([]);
    expect(await link(october.id)).toEqual([null, null]);
    expect(brief(await cron())).toEqual([{ recurringId: rent.id, period: "2029-11", adopted: false }]);
  });

  it("not the same hand-entered booking by two templates with identical amount and category", async () => {
    const rent = await template(25, "2029-11-25T11:00:00.000Z");
    const twin = await template(25, "2029-11-25T11:00:00.000Z", { description: "Miete Garage" });
    const typed = await manual("2029-11-18T09:00:00.000Z");

    const adopted = await adopt();
    expect(adopted).toHaveLength(1);
    const [winner] = await link(typed.id);
    expect([rent.id, twin.id]).toContain(winner);
    const loser = winner === rent.id ? twin.id : rent.id;

    // the other standing order is still planned ...
    const data = await dashboard();
    expect(data.recurringTransactions.map((r) => r.id)).toEqual([loser]);
    expect(data.projectedOutcomeTotal).toBe(1900);
    expect(await link(typed.id)).toEqual([winner, "2029-11"]);

    // ... and booked on its day
    expect(brief(await cron(new Date("2029-11-25T11:00:00.000Z")))).toEqual([
      { recurringId: loser, period: "2029-11", adopted: false }
    ]);
    expect(await bookingCount()).toBe(2);
  });

  it("two hand-entered payments serve two identical templates, one each", async () => {
    const rent = await template(25, "2029-11-25T11:00:00.000Z");
    const twin = await template(25, "2029-11-25T11:00:00.000Z", { description: "Miete Garage" });
    const a = await manual("2029-11-18T09:00:00.000Z");
    const b = await manual("2029-11-20T09:00:00.000Z");

    expect(await adopt()).toHaveLength(2);
    const owners = [(await link(a.id))[0], (await link(b.id))[0]];
    expect(new Set(owners)).toEqual(new Set([rent.id, twin.id]));
    expect((await dashboard()).recurringTransactions).toEqual([]);
    expect(await cron(new Date("2029-11-25T11:00:00.000Z"))).toEqual([]);
    expect(await bookingCount()).toBe(2);
  });

  it("a hand-entered payment from three months ago whose month was auto-booked back then stays untouched", async () => {
    // standing order on the 3rd since June, booked every month up to now
    const rent = await template(3, "2029-06-03T10:00:00.000Z");
    await cron();
    expect(await bookingCount()).toBe(6);
    // the August rent was ALSO typed in by hand at the time — a duplicate the user lives with
    const duplicate = await manual("2029-08-04T10:00:00.000Z");
    const before = await prisma.transaction.findUniqueOrThrow({ where: { id: duplicate.id } });

    // the first dashboard load and the next daily runs after the deploy
    expect(await catchUp()).toEqual([]);
    expect(await adopt()).toEqual([]);
    await dashboard();
    expect(await cron()).toEqual([]);
    expect(await cron(new Date("2029-12-03T11:00:00.000Z"))).toHaveLength(1);

    expect(await prisma.transaction.findUniqueOrThrow({ where: { id: duplicate.id } })).toEqual(before);
    const august = await prisma.transaction.findMany({
      where: { recurringTransactionId: rent.id, recurringPeriod: "2029-08" }
    });
    expect(august).toHaveLength(1);
    expect(august[0].id).not.toBe(duplicate.id);
  });
});

describe("concurrent runs", () => {
  it("four dashboard loads at once link the payment exactly once and create nothing", async () => {
    const rent = await template(25, "2029-11-25T11:00:00.000Z");
    const typed = await manual("2029-11-18T09:00:00.000Z");

    const results = await Promise.all([adopt(), adopt(), adopt(), adopt()]);
    expect(results.flat()).toHaveLength(1);
    expect(await link(typed.id)).toEqual([rent.id, "2029-11"]);
    expect(await bookingCount()).toBe(1);
  });

  it("four daily runs at once adopt once and book nothing", async () => {
    const rent = await template(3, "2029-11-03T11:00:00.000Z");
    const typed = await manual("2029-11-02T08:00:00.000Z");

    const results = await Promise.all([cron(), cron(), cron(), cron()]);
    expect(brief(results.flat())).toEqual([{ recurringId: rent.id, period: "2029-11", adopted: true }]);
    expect(await link(typed.id)).toEqual([rent.id, "2029-11"]);
    expect(await bookingCount()).toBe(1);
  });

  it("a daily run and dashboard loads at once settle the occurrence exactly once", async () => {
    const rent = await template(3, "2029-11-03T11:00:00.000Z");
    const typed = await manual("2029-11-02T08:00:00.000Z");

    const results = await Promise.all([cron(), adopt(), cron(), adopt()]);
    expect(results.flat()).toHaveLength(1);
    expect(await link(typed.id)).toEqual([rent.id, "2029-11"]);
    expect(await bookingCount()).toBe(1);
  });

  it("two identical templates racing for one payment: one adopts, the other books", async () => {
    const rent = await template(3, "2029-11-03T11:00:00.000Z");
    const twin = await template(3, "2029-11-03T11:00:00.000Z", { description: "Miete Garage" });
    const typed = await manual("2029-11-02T08:00:00.000Z");

    const results = (await Promise.all([cron(), cron(), cron(), cron()])).flat();
    expect(results.filter((o) => o.adopted)).toHaveLength(1);
    expect(results.filter((o) => !o.adopted)).toHaveLength(1);
    expect(new Set(results.map((o) => o.recurringId))).toEqual(new Set([rent.id, twin.id]));
    expect((await link(typed.id))[1]).toBe("2029-11");
    expect(await bookingCount()).toBe(2);
  });
});
