import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

import type { BookedOccurrence, RecurringSuggestion } from "../lib/recurringBooking";

// A payment the user entered by hand is never linked to a standing order on its
// own: the rule "same account, amount and category within 7 days" cannot tell
// "paid early" from "paid additionally", and a silently missing booking is worse
// than a visible duplicate. The dashboard suggests the look-alike, the user
// confirms (POST /api/recurring-transactions/[id]/link-booking).
//
// Fixed instants and a pinned clock: "within 7 days" and "current month" are
// Berlin calendar values, whatever time zone the process runs in. The clock is
// pinned to 2039 (no other test file uses it) and the booking job only ever
// runs for this file's household.

const TEST_USER_ID = "test-user-recurring-adoption";
const FOREIGN_USER_ID = "test-user-recurring-adoption-foreign";
const ACCOUNT_ID = "acc_recurring_adoption_test";
const SECOND_ACCOUNT_ID = "acc_recurring_adoption_second";
const FOREIGN_ACCOUNT_ID = "acc_recurring_adoption_foreign";
const OWN_ACCOUNTS = [ACCOUNT_ID, SECOND_ACCOUNT_ID];
const ALL_ACCOUNTS = [...OWN_ACCOUNTS, FOREIGN_ACCOUNT_ID];
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

/** 19 Nov 2039, 11:00 in Berlin. */
const NOW = new Date("2039-11-19T10:00:00.000Z");
const RENT_CENTS = -95_000;
/** The Berlin month November 2039 as a half-open instant range. */
const NOVEMBER = { gte: new Date("2039-10-31T23:00:00.000Z"), lt: new Date("2039-11-30T23:00:00.000Z") };

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let foreignHouseholdId: string;
let rentCategoryId: string;
let otherCategoryId: string;
let savingsCategoryId: string;
let kidsCategoryId: string;

type TemplateOptions = {
  description?: string;
  amountCents?: number;
  categoryId?: string | null;
  accountId?: string;
  bookFromPeriod?: string;
  intervalMonths?: number;
  deletedAt?: Date;
};

/** A standing order (by default the rent), booked on `dayOfMonth`, running since the month of `anchor`. */
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
      bookFromPeriod: options.bookFromPeriod,
      deletedAt: options.deletedAt
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
  recurringPeriod?: string;
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
      recurringPeriod: options.recurringPeriod,
      createdAt: options.createdAt
    }
  });
}

const row = (id: string) => prisma.transaction.findUniqueOrThrow({ where: { id } });

const link = async (id: string) => {
  const r = await row(id);
  return [r.recurringTransactionId, r.recurringPeriod];
};

/** Live bookings on this household's test accounts. */
const bookingCount = () => prisma.transaction.count({ where: { accountId: { in: OWN_ACCOUNTS }, deletedAt: null } });

/** Every row of every table the dashboard could write to, for this household — deleted rows included. */
async function householdState() {
  const byId = { orderBy: { id: "asc" } } as const;
  const onAccounts = { accountId: { in: OWN_ACCOUNTS } };
  return {
    // The soft-delete filter hides tombstones unless the query names deletedAt.
    liveTransactions: await prisma.transaction.findMany({ where: { ...onAccounts, deletedAt: null }, ...byId }),
    deletedTransactions: await prisma.transaction.findMany({ where: { ...onAccounts, deletedAt: { not: null } }, ...byId }),
    liveTemplates: await prisma.recurringTransaction.findMany({ where: { ...onAccounts, deletedAt: null }, ...byId }),
    deletedTemplates: await prisma.recurringTransaction.findMany({ where: { ...onAccounts, deletedAt: { not: null } }, ...byId }),
    skips: await prisma.recurringTransactionSkip.findMany({
      where: { recurring: onAccounts },
      orderBy: [{ recurringId: "asc" }, { year: "asc" }, { month: "asc" }]
    }),
    budgets: await prisma.budget.findMany({ where: onAccounts, ...byId }),
    budgetSnapshots: await prisma.budgetMonthSnapshot.findMany({ where: { householdId }, ...byId }),
    categories: await prisma.category.findMany({ where: { householdId }, ...byId }),
    accounts: await prisma.account.findMany({ where: { householdId }, ...byId })
  };
}

/** The daily booking run, limited to this file's household. */
async function cron(now = NOW, dryRun = false): Promise<BookedOccurrence[]> {
  const { materializeDueRecurringTransactions } = await import("../lib/recurringBooking");
  return materializeDueRecurringTransactions(now, { householdId, dryRun });
}

async function catchUp(now = NOW): Promise<BookedOccurrence[]> {
  const { catchUpPastRecurringForHousehold } = await import("../lib/recurringBooking");
  return catchUpPastRecurringForHousehold(householdId, now);
}

async function suggestions(now = NOW): Promise<RecurringSuggestion[]> {
  const { loadRecurringSuggestions } = await import("../lib/recurringBooking");
  return loadRecurringSuggestions(householdId, now);
}

type Dashboard = {
  outcomeTotal: number;
  projectedOutcomeTotal: number;
  recurringOutcomeTotal: number;
  recurringDueOutcomeTotal: number;
  recurringDueCount: number;
  recurringTransactions: Array<{ id: string }>;
  recurringSuggestions: RecurringSuggestion[];
};

async function dashboard(): Promise<Dashboard> {
  const { GET } = await import("../app/api/analytics/summary/route");
  const res = await GET();
  expect(res.status).toBe(200);
  return (await res.json()) as Dashboard;
}

/** POST /api/recurring-transactions/{recurringId}/link-booking */
async function confirm(recurringId: string, body: unknown) {
  const { POST } = await import("../app/api/recurring-transactions/[id]/link-booking/route");
  const res = await POST(
    new Request(`http://localhost/api/recurring-transactions/${recurringId}/link-booking`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body)
    }),
    { params: { id: recurringId } }
  );
  return { status: res.status, body: await res.json() };
}

const brief = (occurrences: BookedOccurrence[]) =>
  occurrences.map((o) => ({ recurringId: o.recurringId, period: `${o.year}-${o.month}`, created: o.transactionId !== null }));

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  for (const [id, email] of [
    [TEST_USER_ID, "recurring-adoption-test@example.com"],
    [FOREIGN_USER_ID, "recurring-adoption-foreign@example.com"]
  ]) {
    await prisma.user.upsert({ where: { email }, update: {}, create: { id, email, password: "hashed" } });
  }
  householdId = await ensureTestHousehold(prisma, TEST_USER_ID);
  foreignHouseholdId = await ensureTestHousehold(prisma, FOREIGN_USER_ID);
  for (const id of ALL_ACCOUNTS) {
    const owner = id === FOREIGN_ACCOUNT_ID ? FOREIGN_USER_ID : TEST_USER_ID;
    const hh = id === FOREIGN_ACCOUNT_ID ? foreignHouseholdId : householdId;
    await prisma.account.upsert({
      where: { id },
      update: { userId: owner, householdId: hh, deletedAt: null },
      create: { id, name: `Recurring adoption ${id}`, userId: owner, householdId: hh }
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
  savingsCategoryId = (await category("Sparen")).id;
  kidsCategoryId = (await category("AD Kinder")).id;

  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterEach(async () => {
  vi.setSystemTime(NOW);
  const accounts = { in: ALL_ACCOUNTS };
  // Templates first: once they are gone nothing can book for them any more.
  await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: accounts } } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: accounts } });
  await prisma.transaction.deleteMany({ where: { accountId: accounts } });
  await prisma.budgetMonthSnapshot.deleteMany({ where: { householdId } });
});

afterAll(async () => {
  vi.useRealTimers();
  await prisma.budgetMonthSnapshot.deleteMany({ where: { householdId } });
  await prisma.category.deleteMany({ where: { householdId } });
  await prisma.account.deleteMany({ where: { id: { in: ALL_ACCOUNTS } } });
  for (const id of [TEST_USER_ID, FOREIGN_USER_ID]) {
    await cleanupTestHousehold(prisma, id);
    await prisma.user.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

describe("the booking job never links a hand-entered booking on its own", () => {
  it("an extra savings deposit on 27 Nov does not replace December's standing order", async () => {
    // 200 EUR into savings on the 1st, running since September, booked by the daily run
    const saving = { amountCents: -20_000, categoryId: savingsCategoryId };
    const order = await template(1, "2039-09-01T10:00:00.000Z", { ...saving, description: "Sparen Dauerauftrag" });
    expect(await cron()).toHaveLength(3); // Sep, Oct, Nov

    // 27 Nov: the user puts ANOTHER 200 EUR aside by hand
    const bonus = await manual("2039-11-27T11:00:00.000Z", { ...saving, description: "Weihnachtsgeld zusätzlich" });
    const before = await row(bonus.id);

    // 1 Dec: the daily run books December as usual
    vi.setSystemTime(new Date("2039-12-01T11:00:00.000Z"));
    const result = await cron(new Date("2039-12-01T11:00:00.000Z"));
    expect(brief(result)).toEqual([{ recurringId: order.id, period: "2039-12", created: true }]);
    expect(result[0].transactionId).not.toBe(bonus.id);

    // four standing-order deposits plus the bonus: 1000 EUR in the pool; the bonus untouched
    const deposits = await prisma.transaction.findMany({
      where: { accountId: ACCOUNT_ID, categoryId: savingsCategoryId, deletedAt: null }
    });
    expect(deposits).toHaveLength(5);
    expect(-deposits.reduce((s, r) => s + r.amountCents, 0)).toBe(100_000);
    expect(await row(bonus.id)).toEqual(before);
  });

  it("a second pocket-money payment of 28 Oct does not stand for November, also not after a dashboard load", async () => {
    // 50 EUR on the 1st since September; no daily run, only the self-heal
    const pocket = { amountCents: -5_000, categoryId: kidsCategoryId };
    const order = await template(1, "2039-09-01T10:00:00.000Z", { ...pocket, description: "Taschengeld" });
    expect(brief(await catchUp())).toEqual([
      { recurringId: order.id, period: "2039-9", created: true },
      { recurringId: order.id, period: "2039-10", created: true }
    ]);

    // 28 Oct: an extra 50 EUR for the school trip, entered by hand at the time
    const extra = await manual("2039-10-28T11:00:00.000Z", { ...pocket, description: "Klassenfahrt extra" });
    const before = await row(extra.id);

    // the first dashboard load after the deploy suggests it, and links nothing
    const data = await dashboard();
    expect(data.recurringSuggestions.map((s) => [s.recurringId, s.period, s.transactionId])).toEqual([
      [order.id, "2039-11", extra.id]
    ]);
    expect(await row(extra.id)).toEqual(before);

    // month end: the self-heal books November
    vi.setSystemTime(new Date("2039-12-01T08:00:00.000Z"));
    expect(brief(await catchUp(new Date("2039-12-01T08:00:00.000Z")))).toEqual([
      { recurringId: order.id, period: "2039-11", created: true }
    ]);
    const november = await prisma.transaction.findMany({
      where: { accountId: ACCOUNT_ID, deletedAt: null, occurredAt: NOVEMBER }
    });
    expect(november.map((t) => [t.recurringTransactionId, t.recurringPeriod])).toEqual([[order.id, "2039-11"]]);
    expect(await row(extra.id)).toEqual(before);
  });

  it("deleting a hand-entered rent that the dashboard suggested leaves the month to the standing order", async () => {
    await template(25, "2039-08-25T10:00:00.000Z");
    await catchUp(); // Aug-Oct

    // 18 Nov: typed in a week early; the dashboard is opened and suggests it
    const typed = await manual("2039-11-18T09:00:00.000Z");
    expect((await dashboard()).recurringSuggestions.map((s) => s.transactionId)).toEqual([typed.id]);

    // the user deletes their own entry instead of confirming
    const { DELETE } = await import("../app/api/transactions/[id]/route");
    const res = await DELETE(new Request(`http://localhost/api/transactions/${typed.id}`, { method: "DELETE" }), {
      params: { id: typed.id }
    });
    expect(res.status).toBe(204);

    // 25 Nov: the daily run books November's rent
    await cron(new Date("2039-11-25T11:00:00.000Z"));
    const november = await prisma.transaction.findMany({
      where: { accountId: ACCOUNT_ID, deletedAt: null, occurredAt: NOVEMBER }
    });
    expect(november.map((t) => t.amountCents)).toEqual([RENT_CENTS]);
  });

  it("books the rent on its due day although it was typed in the day before", async () => {
    const rent = await template(3, "2039-11-03T11:00:00.000Z");
    const typed = await manual("2039-11-02T08:00:00.000Z");
    const before = await row(typed.id);

    const result = await cron(new Date("2039-11-03T05:00:00.000Z"));
    expect(result).toEqual([
      {
        recurringId: rent.id,
        accountId: ACCOUNT_ID,
        transactionId: expect.any(String),
        year: 2039,
        month: 11,
        amountCents: RENT_CENTS,
        description: "Miete"
      }
    ]);
    expect(result[0].transactionId).not.toBe(typed.id);
    expect(await row(typed.id)).toEqual(before);
    expect(await bookingCount()).toBe(2);
  });

  it("books a completed month on catch-up although a look-alike was entered by hand", async () => {
    const rent = await template(1, "2039-09-01T10:00:00.000Z");
    const typed = await manual("2039-10-02T10:00:00.000Z");
    const before = await row(typed.id);

    expect(brief(await catchUp())).toEqual([
      { recurringId: rent.id, period: "2039-9", created: true },
      { recurringId: rent.id, period: "2039-10", created: true }
    ]);
    expect(await row(typed.id)).toEqual(before);
    expect(await bookingCount()).toBe(3);
  });

  it("a dry run reports every open occurrence as a booking and writes nothing", async () => {
    const rent = await template(3, "2039-11-03T11:00:00.000Z");
    const typed = await manual("2039-11-02T08:00:00.000Z");
    const before = await householdState();

    const result = await cron(NOW, true);
    expect(result).toEqual([
      {
        recurringId: rent.id,
        accountId: ACCOUNT_ID,
        transactionId: null,
        year: 2039,
        month: 11,
        amountCents: RENT_CENTS,
        description: "Miete"
      }
    ]);
    expect(await householdState()).toEqual(before);
    expect(await link(typed.id)).toEqual([null, null]);
  });
});

describe("suggestions", () => {
  /** Rent due on 15 November; returns whether the booking is suggested for it. */
  async function suggestedFor(occurredAt: string, options: ManualOptions = {}, templateOptions: TemplateOptions = {}) {
    const rent = await template(15, "2039-11-15T11:00:00.000Z", templateOptions);
    const typed = await manual(occurredAt, options);
    const found = await suggestions();
    return found.some((s) => s.recurringId === rent.id && s.transactionId === typed.id);
  }

  it("suggests a look-alike for an occurrence whose day has not come yet", async () => {
    const rent = await template(25, "2039-11-25T11:00:00.000Z");
    const typed = await manual("2039-11-18T09:00:00.000Z", { description: "Miete Dezember?" });

    expect(await suggestions()).toEqual([
      {
        recurringId: rent.id,
        period: "2039-11",
        dueDay: "2039-11-25",
        transactionId: typed.id,
        transactionDescription: "Miete Dezember?",
        transactionOccurredAt: "2039-11-18T09:00:00.000Z",
        amountCents: RENT_CENTS
      }
    ]);
    expect((await dashboard()).recurringSuggestions).toEqual(await suggestions());
  });

  it("suggests a look-alike for an occurrence whose day has passed but which is not booked yet", async () => {
    const rent = await template(10, "2039-11-10T11:00:00.000Z");
    const typed = await manual("2039-11-09T11:00:00.000Z");
    expect((await suggestions()).map((s) => [s.recurringId, s.transactionId, s.dueDay])).toEqual([
      [rent.id, typed.id, "2039-11-10"]
    ]);
  });

  it("is an empty list in the summary when nothing matches", async () => {
    await template(25, "2039-11-25T11:00:00.000Z");
    expect((await dashboard()).recurringSuggestions).toEqual([]);
  });

  it("counts 7 calendar days before and after the due day in Berlin", async () => {
    // 8 Nov 00:30 in Berlin (7 Nov in UTC): 7 days before
    expect(await suggestedFor("2039-11-07T23:30:00.000Z")).toBe(true);
  });

  it("not 8 days before the due day", async () => {
    // 7 Nov 23:30 in Berlin
    expect(await suggestedFor("2039-11-07T22:30:00.000Z")).toBe(false);
  });

  it("still 7 days after the due day", async () => {
    // 22 Nov 23:30 in Berlin
    expect(await suggestedFor("2039-11-22T22:30:00.000Z")).toBe(true);
  });

  it("not 8 days after the due day", async () => {
    // 23 Nov 00:30 in Berlin (22 Nov in UTC)
    expect(await suggestedFor("2039-11-22T23:30:00.000Z")).toBe(false);
  });

  it("not on another account", async () => {
    expect(await suggestedFor("2039-11-15T11:00:00.000Z", { accountId: SECOND_ACCOUNT_ID })).toBe(false);
  });

  it("not with another amount or sign", async () => {
    expect(await suggestedFor("2039-11-15T11:00:00.000Z", { amountCents: RENT_CENTS - 1 })).toBe(false);
  });

  it("not with the opposite sign", async () => {
    expect(await suggestedFor("2039-11-15T11:00:00.000Z", { amountCents: -RENT_CENTS })).toBe(false);
  });

  it("not in another category, whatever the description", async () => {
    expect(await suggestedFor("2039-11-15T11:00:00.000Z", { categoryId: otherCategoryId, description: "Miete" })).toBe(false);
  });

  it("not without category for a template that has one", async () => {
    expect(await suggestedFor("2039-11-15T11:00:00.000Z", { categoryId: null, description: "Miete" })).toBe(false);
  });

  it("without a category on the template: no category and the same description, ignoring case and outer whitespace", async () => {
    expect(
      await suggestedFor("2039-11-15T11:00:00.000Z", { categoryId: null, description: "  MIETE " }, { categoryId: null })
    ).toBe(true);
    await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
    await prisma.recurringTransaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
    expect(
      await suggestedFor("2039-11-15T11:00:00.000Z", { categoryId: null, description: "Miete Garage" }, { categoryId: null })
    ).toBe(false);
  });

  it("not a deleted booking", async () => {
    expect(await suggestedFor("2039-11-15T11:00:00.000Z", { deletedAt: new Date("2039-11-16T10:00:00.000Z") })).toBe(false);
  });

  it("not a booking that already belongs to another standing order", async () => {
    const other = await template(15, "2039-12-15T11:00:00.000Z", { description: "Anderer Dauerauftrag" });
    expect(
      await suggestedFor("2039-11-15T11:00:00.000Z", { recurringTransactionId: other.id, recurringPeriod: "2039-12" })
    ).toBe(false);
  });

  it("nothing for a skipped month", async () => {
    const rent = await template(15, "2039-11-15T11:00:00.000Z");
    await prisma.recurringTransactionSkip.create({ data: { recurringId: rent.id, year: 2039, month: 11 } });
    await manual("2039-11-15T11:00:00.000Z");
    expect(await suggestions()).toEqual([]);
  });

  it("nothing for a booked month", async () => {
    await template(15, "2039-11-15T11:00:00.000Z");
    expect(await cron()).toHaveLength(1);
    await manual("2039-11-15T11:00:00.000Z");
    expect(await suggestions()).toEqual([]);
  });

  it("nothing for a month before bookFromPeriod", async () => {
    await template(15, "2039-09-15T10:00:00.000Z", { bookFromPeriod: "2039-12" });
    await manual("2039-11-15T11:00:00.000Z");
    expect(await suggestions()).toEqual([]);
  });

  it("nothing for a template that is not due this month", async () => {
    // quarterly, due in October and January
    await template(25, "2039-10-25T10:00:00.000Z", { intervalMonths: 3 });
    await manual("2039-11-25T11:00:00.000Z");
    expect(await suggestions()).toEqual([]);
  });

  it("nothing for a deleted template", async () => {
    await template(15, "2039-11-15T11:00:00.000Z", { deletedAt: new Date("2039-11-01T10:00:00.000Z") });
    await manual("2039-11-15T11:00:00.000Z");
    expect(await suggestions()).toEqual([]);
  });

  it("suggests the booking closest to the due day", async () => {
    const rent = await template(15, "2039-11-15T11:00:00.000Z");
    await manual("2039-11-12T11:00:00.000Z");
    const close = await manual("2039-11-14T11:00:00.000Z");
    await manual("2039-11-18T11:00:00.000Z");
    expect((await suggestions()).map((s) => [s.recurringId, s.transactionId])).toEqual([[rent.id, close.id]]);
  });

  it("suggests one booking for one occurrence only", async () => {
    const rent = await template(25, "2039-11-25T11:00:00.000Z");
    const twin = await template(25, "2039-11-25T11:00:00.000Z", { description: "Miete Garage" });
    const a = await manual("2039-11-18T09:00:00.000Z");

    const one = await suggestions();
    expect(one).toHaveLength(1);
    expect(one[0].transactionId).toBe(a.id);
    expect([rent.id, twin.id]).toContain(one[0].recurringId);

    // a second look-alike serves the other template
    const b = await manual("2039-11-20T09:00:00.000Z");
    const two = await suggestions();
    expect(new Set(two.map((s) => s.recurringId))).toEqual(new Set([rent.id, twin.id]));
    expect(new Set(two.map((s) => s.transactionId))).toEqual(new Set([a.id, b.id]));
  });

  it("until confirmed, the look-alike counts as booked and the occurrence as planned", async () => {
    const rent = await template(25, "2039-11-25T11:00:00.000Z");
    await manual("2039-11-18T09:00:00.000Z");

    const data = await dashboard();
    expect(data.recurringSuggestions.map((s) => s.recurringId)).toEqual([rent.id]);
    expect(data.recurringTransactions.map((r) => r.id)).toEqual([rent.id]);
    expect(data.outcomeTotal).toBe(950);
    expect(data.recurringOutcomeTotal).toBe(950);
    expect(data.projectedOutcomeTotal).toBe(1900);
  });
});

describe("computing suggestions writes nothing", () => {
  it("the first dashboard load after the deploy leaves every row as it was", async () => {
    // The state production is in: past months booked by the daily run (one
    // row from before recurringPeriod existed), a duplicate typed in months
    // ago, look-alikes for this month's open occurrences — one due later, one
    // whose day has passed — and a deleted standing-order booking.
    const rent = await template(3, "2039-06-03T10:00:00.000Z");
    const insurance = await template(10, "2039-11-10T11:00:00.000Z", {
      categoryId: otherCategoryId,
      amountCents: -4_500,
      description: "Versicherung"
    });
    const internet = await template(25, "2039-09-25T10:00:00.000Z", {
      categoryId: otherCategoryId,
      amountCents: -3_999,
      description: "Internet"
    });
    // June-October of the rent, booked; June as a legacy row without period
    expect(await cron(new Date("2039-10-31T11:00:00.000Z"))).toHaveLength(7);
    await prisma.transaction.updateMany({
      where: { recurringTransactionId: rent.id, recurringPeriod: "2039-06" },
      data: { recurringPeriod: null }
    });
    await prisma.transaction.updateMany({
      where: { recurringTransactionId: internet.id, recurringPeriod: "2039-10" },
      data: { deletedAt: new Date("2039-10-26T10:00:00.000Z") }
    });
    // November's rent, booked on the 3rd
    expect(brief(await cron(new Date("2039-11-03T11:00:00.000Z")))).toEqual([
      { recurringId: rent.id, period: "2039-11", created: true }
    ]);
    await manual("2039-08-04T10:00:00.000Z"); // the August rent, also typed in back then
    const insuranceTyped = await manual("2039-11-09T10:00:00.000Z", {
      categoryId: otherCategoryId,
      amountCents: -4_500,
      description: "Versicherung bezahlt"
    });
    const internetTyped = await manual("2039-11-18T10:00:00.000Z", {
      categoryId: otherCategoryId,
      amountCents: -3_999,
      description: "Internet"
    });

    const before = await householdState();
    expect(before.liveTransactions).toHaveLength(10);
    expect(before.budgetSnapshots).toEqual([]);

    // Computing the suggestions on its own writes nothing at all.
    const found = await suggestions();
    expect(await householdState()).toEqual(before);

    const data = await dashboard();
    const again = await dashboard();

    // The dashboard load writes no booking, template, skip, budget, category or
    // account. The one row it does add is not about standing orders: the budget
    // freeze (lib/categoryBudgets.ts) stores the month that just ended on the
    // first read of the new one — with nothing in it for this household.
    const after = await householdState();
    expect({ ...after, budgetSnapshots: [] }).toEqual({ ...before, budgetSnapshots: [] });
    expect(after.budgetSnapshots.map((s) => [s.year, s.month, s.budgets])).toEqual([[2039, 10, {}]]);
    expect(new Set(found.map((s) => `${s.recurringId}:${s.transactionId}`))).toEqual(
      new Set([`${insurance.id}:${insuranceTyped.id}`, `${internet.id}:${internetTyped.id}`])
    );
    expect(data.recurringSuggestions).toEqual(found);
    expect(again.recurringSuggestions).toEqual(found);
  });
});

describe("confirming a suggestion", () => {
  it("links exactly that booking and nothing else", async () => {
    const rent = await template(25, "2039-11-25T11:00:00.000Z");
    const typed = await manual("2039-11-18T09:00:00.000Z");
    const bystander = await manual("2039-11-18T09:00:00.000Z", { accountId: SECOND_ACCOUNT_ID });
    const before = await row(typed.id);
    const bystanderBefore = await row(bystander.id);

    const res = await confirm(rent.id, { transactionId: typed.id, period: "2039-11" });
    expect(res).toEqual({
      status: 200,
      body: { id: typed.id, recurringTransactionId: rent.id, recurringPeriod: "2039-11" }
    });

    const after = await row(typed.id);
    expect(after).toEqual({ ...before, recurringTransactionId: rent.id, recurringPeriod: "2039-11", updatedAt: after.updatedAt });
    expect(await row(bystander.id)).toEqual(bystanderBefore);
    expect(await bookingCount()).toBe(2);
  });

  it("afterwards the dashboard no longer plans the occurrence and the job books nothing for it", async () => {
    const rent = await template(25, "2039-11-25T11:00:00.000Z");
    const typed = await manual("2039-11-18T09:00:00.000Z");
    expect((await confirm(rent.id, { transactionId: typed.id, period: "2039-11" })).status).toBe(200);

    const data = await dashboard();
    expect(data.recurringTransactions).toEqual([]);
    expect(data.recurringSuggestions).toEqual([]);
    expect(data.recurringOutcomeTotal).toBe(0);
    expect(data.outcomeTotal).toBe(950);
    expect(data.projectedOutcomeTotal).toBe(950);
    // still one of this month's fixed costs
    expect(data.recurringDueOutcomeTotal).toBe(950);
    expect(data.recurringDueCount).toBe(1);

    expect(await cron(new Date("2039-11-25T11:00:00.000Z"))).toEqual([]);
    vi.setSystemTime(new Date("2039-12-01T08:00:00.000Z"));
    expect(await catchUp(new Date("2039-12-01T08:00:00.000Z"))).toEqual([]);
    expect(await bookingCount()).toBe(1);
  });

  it("links a payment made a few days early in the previous month as the new month's occurrence", async () => {
    const rent = await template(1, "2039-11-01T11:00:00.000Z");
    await cron(); // November is booked
    const typed = await manual("2039-11-28T11:00:00.000Z");

    expect((await confirm(rent.id, { transactionId: typed.id, period: "2039-12" })).status).toBe(200);
    expect(await link(typed.id)).toEqual([rent.id, "2039-12"]);
    expect(await cron(new Date("2039-12-01T11:00:00.000Z"))).toEqual([]);
    expect(await bookingCount()).toBe(2);
  });

  describe("is rejected when the body is malformed", () => {
    it.each([
      ["no transactionId", { period: "2039-11" }],
      ["an empty transactionId", { transactionId: "", period: "2039-11" }],
      ["no period", { transactionId: "x" }],
      ["month 13", { transactionId: "x", period: "2039-13" }],
      ["a one-digit month", { transactionId: "x", period: "2039-1" }],
      ["a day key", { transactionId: "x", period: "2039-11-25" }],
      ["no JSON", "not json"]
    ])("%s → 400", async (_label, body) => {
      const rent = await template(25, "2039-11-25T11:00:00.000Z");
      expect((await confirm(rent.id, body)).status).toBe(400);
    });
  });

  describe("is 404 for what does not exist in the household", () => {
    it("an unknown standing order", async () => {
      const typed = await manual("2039-11-18T09:00:00.000Z");
      const res = await confirm("rec_does_not_exist", { transactionId: typed.id, period: "2039-11" });
      expect(res.status).toBe(404);
      expect(await link(typed.id)).toEqual([null, null]);
    });

    it("another household's standing order", async () => {
      const foreign = await template(25, "2039-11-25T11:00:00.000Z", { accountId: FOREIGN_ACCOUNT_ID });
      const typed = await manual("2039-11-18T09:00:00.000Z");
      expect((await confirm(foreign.id, { transactionId: typed.id, period: "2039-11" })).status).toBe(404);
      expect(await link(typed.id)).toEqual([null, null]);
    });

    it("a deleted standing order", async () => {
      const gone = await template(25, "2039-11-25T11:00:00.000Z", { deletedAt: new Date("2039-11-10T10:00:00.000Z") });
      const typed = await manual("2039-11-18T09:00:00.000Z");
      expect((await confirm(gone.id, { transactionId: typed.id, period: "2039-11" })).status).toBe(404);
      expect(await link(typed.id)).toEqual([null, null]);
    });

    it("an unknown booking", async () => {
      const rent = await template(25, "2039-11-25T11:00:00.000Z");
      expect((await confirm(rent.id, { transactionId: "txn_does_not_exist", period: "2039-11" })).status).toBe(404);
    });

    it("another household's booking", async () => {
      const rent = await template(25, "2039-11-25T11:00:00.000Z");
      const foreign = await manual("2039-11-18T09:00:00.000Z", { accountId: FOREIGN_ACCOUNT_ID, categoryId: null });
      expect((await confirm(rent.id, { transactionId: foreign.id, period: "2039-11" })).status).toBe(404);
      expect(await link(foreign.id)).toEqual([null, null]);
    });
  });

  describe("is 409 when the booking is no longer a match", () => {
    /** Rent due on 25 November; confirms the booking for November and expects a refusal that changes nothing. */
    async function refused(occurredAt: string, options: ManualOptions = {}, templateOptions: TemplateOptions = {}) {
      const rent = await template(25, "2039-11-25T11:00:00.000Z", templateOptions);
      const typed = await manual(occurredAt, options);
      const before = await row(typed.id);
      const res = await confirm(rent.id, { transactionId: typed.id, period: "2039-11" });
      expect(await row(typed.id)).toEqual(before);
      expect(typeof res.body.error).toBe("string");
      return res.status;
    }

    it("on another account", async () => {
      expect(await refused("2039-11-25T11:00:00.000Z", { accountId: SECOND_ACCOUNT_ID })).toBe(409);
    });

    it("with another amount", async () => {
      expect(await refused("2039-11-25T11:00:00.000Z", { amountCents: RENT_CENTS + 1 })).toBe(409);
    });

    it("in another category", async () => {
      expect(await refused("2039-11-25T11:00:00.000Z", { categoryId: otherCategoryId })).toBe(409);
    });

    it("without category for a template that has one", async () => {
      expect(await refused("2039-11-25T11:00:00.000Z", { categoryId: null, description: "Miete" })).toBe(409);
    });

    it("with a category for a template without one", async () => {
      expect(await refused("2039-11-25T11:00:00.000Z", { description: "Miete" }, { categoryId: null })).toBe(409);
    });

    it("with another description for a template without category", async () => {
      expect(
        await refused("2039-11-25T11:00:00.000Z", { categoryId: null, description: "Miete Garage" }, { categoryId: null })
      ).toBe(409);
    });

    it("deleted", async () => {
      expect(await refused("2039-11-25T11:00:00.000Z", { deletedAt: new Date("2039-11-25T12:00:00.000Z") })).toBe(409);
    });

    it("already linked to another standing order", async () => {
      const other = await template(25, "2039-12-25T11:00:00.000Z", { description: "Anderer Dauerauftrag" });
      expect(
        await refused("2039-11-25T11:00:00.000Z", { recurringTransactionId: other.id, recurringPeriod: "2039-12" })
      ).toBe(409);
    });

    it("8 days before the due day", async () => {
      // 17 Nov 23:30 in Berlin
      expect(await refused("2039-11-17T22:30:00.000Z")).toBe(409);
    });

    it("8 days after the due day", async () => {
      // 3 Dec 00:30 in Berlin (2 Dec in UTC)
      expect(await refused("2039-12-02T23:30:00.000Z")).toBe(409);
    });

    it("but accepts 7 days before the due day, counted in Berlin", async () => {
      const rent = await template(25, "2039-11-25T11:00:00.000Z");
      // 18 Nov 00:30 in Berlin (17 Nov in UTC)
      const typed = await manual("2039-11-17T23:30:00.000Z");
      expect((await confirm(rent.id, { transactionId: typed.id, period: "2039-11" })).status).toBe(200);
    });

    it("and 7 days after the due day, counted in Berlin", async () => {
      const rent = await template(25, "2039-11-25T11:00:00.000Z");
      // 2 Dec 23:30 in Berlin
      const typed = await manual("2039-12-02T22:30:00.000Z");
      expect((await confirm(rent.id, { transactionId: typed.id, period: "2039-11" })).status).toBe(200);
    });
  });

  describe("is 409 when the occurrence cannot be linked", () => {
    it("the month is already booked", async () => {
      const rent = await template(15, "2039-11-15T11:00:00.000Z");
      await cron();
      const typed = await manual("2039-11-14T11:00:00.000Z");
      const res = await confirm(rent.id, { transactionId: typed.id, period: "2039-11" });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already booked/);
      expect(await link(typed.id)).toEqual([null, null]);
    });

    it("the month is booked by a deleted booking", async () => {
      const rent = await template(15, "2039-11-15T11:00:00.000Z");
      await cron();
      await prisma.transaction.updateMany({ where: { recurringTransactionId: rent.id }, data: { deletedAt: NOW } });
      const typed = await manual("2039-11-14T11:00:00.000Z");
      expect((await confirm(rent.id, { transactionId: typed.id, period: "2039-11" })).status).toBe(409);
      expect(await link(typed.id)).toEqual([null, null]);
    });

    it("the month is skipped", async () => {
      const rent = await template(15, "2039-11-15T11:00:00.000Z");
      await prisma.recurringTransactionSkip.create({ data: { recurringId: rent.id, year: 2039, month: 11 } });
      const typed = await manual("2039-11-14T11:00:00.000Z");
      const res = await confirm(rent.id, { transactionId: typed.id, period: "2039-11" });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/skipped/);
      expect(await link(typed.id)).toEqual([null, null]);
    });

    it("the month lies before bookFromPeriod", async () => {
      const rent = await template(15, "2039-09-15T10:00:00.000Z", { bookFromPeriod: "2039-12" });
      const typed = await manual("2039-11-14T11:00:00.000Z");
      expect((await confirm(rent.id, { transactionId: typed.id, period: "2039-11" })).status).toBe(409);
      expect(await link(typed.id)).toEqual([null, null]);
    });

    it("the standing order is not due in that month", async () => {
      // quarterly, due in October and January
      const rent = await template(25, "2039-10-25T10:00:00.000Z", { intervalMonths: 3 });
      const typed = await manual("2039-11-25T11:00:00.000Z");
      const res = await confirm(rent.id, { transactionId: typed.id, period: "2039-11" });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/not due/);
      expect(await link(typed.id)).toEqual([null, null]);
    });

    it("the month lies before the standing order starts", async () => {
      const rent = await template(25, "2039-12-25T11:00:00.000Z");
      const typed = await manual("2039-11-25T11:00:00.000Z");
      expect((await confirm(rent.id, { transactionId: typed.id, period: "2039-11" })).status).toBe(409);
      expect(await link(typed.id)).toEqual([null, null]);
    });
  });

  describe("concurrently", () => {
    it("two look-alikes confirmed at once for the same occurrence: one is linked", async () => {
      const rent = await template(25, "2039-11-25T11:00:00.000Z");
      const a = await manual("2039-11-18T09:00:00.000Z");
      const b = await manual("2039-11-20T09:00:00.000Z");

      const results = await Promise.all([
        confirm(rent.id, { transactionId: a.id, period: "2039-11" }),
        confirm(rent.id, { transactionId: b.id, period: "2039-11" })
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const linked = await prisma.transaction.findMany({ where: { recurringTransactionId: rent.id } });
      expect(linked).toHaveLength(1);
      expect([a.id, b.id]).toContain(linked[0].id);
    });

    it("one booking confirmed at once for two identical standing orders: it is linked to one", async () => {
      const rent = await template(25, "2039-11-25T11:00:00.000Z");
      const twin = await template(25, "2039-11-25T11:00:00.000Z", { description: "Miete Garage" });
      const typed = await manual("2039-11-18T09:00:00.000Z");

      const results = await Promise.all([
        confirm(rent.id, { transactionId: typed.id, period: "2039-11" }),
        confirm(twin.id, { transactionId: typed.id, period: "2039-11" })
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const winner = results.find((r) => r.status === 200)!.body.recurringTransactionId;
      expect(await link(typed.id)).toEqual([winner, "2039-11"]);
    });

    it("a confirmation racing the booking job settles the occurrence once", async () => {
      const rent = await template(19, "2039-11-19T11:00:00.000Z");
      const typed = await manual("2039-11-18T09:00:00.000Z");

      const [res, booked] = await Promise.all([confirm(rent.id, { transactionId: typed.id, period: "2039-11" }), cron()]);
      const occurrenceRows = await prisma.transaction.findMany({
        where: { recurringTransactionId: rent.id, recurringPeriod: "2039-11" }
      });
      expect(occurrenceRows).toHaveLength(1);
      if (res.status === 200) {
        expect(booked).toEqual([]);
        expect(occurrenceRows[0].id).toBe(typed.id);
      } else {
        expect(res.status).toBe(409);
        expect(booked).toHaveLength(1);
        expect(await link(typed.id)).toEqual([null, null]);
      }
    });
  });
});
