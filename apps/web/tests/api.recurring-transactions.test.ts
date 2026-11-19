import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// pretest (siehe tests/setup.ts) läuft: prisma generate && db push && seed.
// Auth wird über TEST_USER_ID_BYPASS umgangen (siehe lib/auth.ts).
//
// Feste Zeitpunkte und eine festgehaltene Uhr: der Anker ist 12:00 Uhr Berliner
// Zeit des gemeinten Kalendertags, egal in welcher Zeitzone der Prozess läuft.
const TEST_USER_ID = "test-user-recurring";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

/** 19 Nov 2026, 11:00 in Berlin. */
const NOW = new Date("2026-11-19T10:00:00.000Z");

let prisma: import("@prisma/client").PrismaClient;
let testUserId: string;
let testHouseholdId: string;
let testAccountId: string;

type Created = {
  id: string;
  dayOfMonth: number;
  nextOccurrence: string;
  frequency: string;
  bookFromPeriod: string | null;
};

async function create(body: Record<string, unknown>): Promise<Response> {
  const routes = await import("../app/api/recurring-transactions/route");
  return routes.POST(
    new Request("http://localhost/api/recurring-transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: testAccountId, amountCents: -1000, description: "Test", ...body })
    })
  );
}

async function patch(id: string, body: Record<string, unknown>): Promise<Response> {
  const detailRoutes = await import("../app/api/recurring-transactions/[id]/route");
  return detailRoutes.PATCH(
    new Request(`http://localhost/api/recurring-transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }),
    { params: { id } }
  );
}

/** Anchor a template created at `now` with only a dayOfMonth gets. */
async function anchorFor(dayOfMonth: number, now: string): Promise<string> {
  vi.setSystemTime(new Date(now));
  const res = await create({ dayOfMonth });
  expect(res.status).toBe(201);
  return ((await res.json()) as Created).nextOccurrence;
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "recurring-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "recurring-test@example.com", password: "hashed" }
  });
  testUserId = user.id;
  testHouseholdId = await ensureTestHousehold(prisma, user.id);

  const account = await prisma.account.upsert({
    where: { id: "acc_recurring_test" },
    update: { userId: user.id, householdId: testHouseholdId },
    create: { id: "acc_recurring_test", name: "Recurring Test Account", userId: user.id, householdId: testHouseholdId }
  });
  testAccountId = account.id;

  await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: testAccountId } });

  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterEach(async () => {
  vi.setSystemTime(NOW);
  // Templates here can be due "today", so the global cron run of a parallel
  // test file may book them. Templates first: once they are gone nothing new
  // can be booked, then the bookings can be removed for good.
  await prisma.recurringTransaction.deleteMany({ where: { accountId: testAccountId } });
  await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
});

afterAll(async () => {
  vi.useRealTimers();
  if (prisma) {
    await prisma.recurringTransaction.deleteMany({ where: { accountId: testAccountId } });
    await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
    await prisma.account.deleteMany({ where: { id: testAccountId } });
    await cleanupTestHousehold(prisma, testUserId);
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
  }
});

describe("/api/recurring-transactions", () => {
  it("pins nextOccurrence to an explicit startDate and derives dayOfMonth", async () => {
    const res = await create({ amountCents: -1999, description: "Streaming-Abo", intervalMonths: 1, startDate: "2034-06-15" });
    expect(res.status).toBe(201);
    const created = (await res.json()) as Created;

    // 15 June 2034, 12:00 in Berlin (summer time)
    expect(created.nextOccurrence).toBe("2034-06-15T10:00:00.000Z");
    expect(created.dayOfMonth).toBe(15);
    expect(created.frequency).toBe("MONTHLY");
  }, 20000);

  it("stores a startDate on the first of a month as that Berlin day, in summer and in winter time", async () => {
    const summer = (await (await create({ startDate: "2027-07-01" })).json()) as Created;
    const winter = (await (await create({ startDate: "2027-01-01" })).json()) as Created;
    expect(summer.nextOccurrence).toBe("2027-07-01T10:00:00.000Z");
    expect(winter.nextOccurrence).toBe("2027-01-01T11:00:00.000Z");
    expect(summer.dayOfMonth).toBe(1);
    expect(winter.dayOfMonth).toBe(1);
  }, 20000);

  describe("without a startDate the first occurrence follows from dayOfMonth and today in Berlin", () => {
    it("is this month when the day is still ahead", async () => {
      expect(await anchorFor(25, "2026-11-19T10:00:00.000Z")).toBe("2026-11-25T11:00:00.000Z");
    }, 20000);

    it("is next month when the day is today, so a payment entered by hand today is not booked again", async () => {
      expect(await anchorFor(19, "2026-11-19T10:00:00.000Z")).toBe("2026-12-19T11:00:00.000Z");
    }, 20000);

    it("is next month when the day has passed", async () => {
      expect(await anchorFor(1, "2026-11-19T10:00:00.000Z")).toBe("2026-12-01T11:00:00.000Z");
      expect(await anchorFor(18, "2026-11-19T10:00:00.000Z")).toBe("2026-12-18T11:00:00.000Z");
    }, 20000);

    it("treats day 30 and day 31 the same on 30 November: both start in December", async () => {
      expect(await anchorFor(30, "2026-11-30T10:00:00.000Z")).toBe("2026-12-30T11:00:00.000Z");
      expect(await anchorFor(31, "2026-11-30T10:00:00.000Z")).toBe("2026-12-31T11:00:00.000Z");
      // One day earlier the clamped day 30 is still ahead.
      expect(await anchorFor(31, "2026-11-29T10:00:00.000Z")).toBe("2026-11-30T11:00:00.000Z");
    }, 20000);

    it("clamps to the last day of the following month and rolls over the year", async () => {
      // 31 Jan: day 30 has passed -> February, which has 28 days in 2027.
      expect(await anchorFor(30, "2027-01-31T10:00:00.000Z")).toBe("2027-02-28T11:00:00.000Z");
      expect(await anchorFor(5, "2026-12-15T10:00:00.000Z")).toBe("2027-01-05T11:00:00.000Z");
    }, 20000);

    it("takes today from the Berlin calendar, not from UTC", async () => {
      // 1 Dec 00:30 in Berlin — still 30 Nov in UTC. Day 1 is today (-> January), day 2 is ahead.
      expect(await anchorFor(1, "2026-11-30T23:30:00.000Z")).toBe("2027-01-01T11:00:00.000Z");
      expect(await anchorFor(2, "2026-11-30T23:30:00.000Z")).toBe("2026-12-02T11:00:00.000Z");
      // 30 Nov 23:30 in Berlin: day 1 is ahead, in December.
      expect(await anchorFor(1, "2026-11-30T22:30:00.000Z")).toBe("2026-12-01T11:00:00.000Z");
    }, 20000);

    it("defaults dayOfMonth to 1", async () => {
      const created = (await (await create({})).json()) as Created;
      expect(created.dayOfMonth).toBe(1);
      expect(created.nextOccurrence).toBe("2026-12-01T11:00:00.000Z");
    }, 20000);
  });

  it("lets an explicit dayOfMonth and startDate coexist independently", async () => {
    const res = await create({
      amountCents: -2500,
      description: "Abo mit erster Zahlung später",
      intervalMonths: 1,
      dayOfMonth: 20,
      startDate: "2034-06-15"
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as Created;
    // startDate steuert die erste Buchung; dayOfMonth bleibt der explizit gewählte Wert.
    expect(created.dayOfMonth).toBe(20);
    expect(created.nextOccurrence).toBe("2034-06-15T10:00:00.000Z");
  }, 20000);

  it("updates nextOccurrence when startDate is changed via PATCH", async () => {
    const createRes = await create({ amountCents: -1200, description: "Zeitschrift", intervalMonths: 3, dayOfMonth: 10 });
    const created = (await createRes.json()) as Created;

    const patchRes = await patch(created.id, { startDate: "2034-03-05" });
    expect(patchRes.status).toBe(200);
    const updated = (await patchRes.json()) as Created;
    // 5 March 2034, 12:00 in Berlin (winter time)
    expect(updated.nextOccurrence).toBe("2034-03-05T11:00:00.000Z");
    expect(updated.dayOfMonth).toBe(5);
  }, 20000);

  it("keeps the anchor month and changes only the day when only dayOfMonth is sent via PATCH", async () => {
    const created = (await (await create({ startDate: "2027-09-10" })).json()) as Created;

    const later = (await (await patch(created.id, { dayOfMonth: 25 })).json()) as Created;
    expect(later.dayOfMonth).toBe(25);
    expect(later.nextOccurrence).toBe("2027-09-25T10:00:00.000Z");

    // Day 31 is clamped to the length of the anchor month; dayOfMonth itself stays 31.
    const clamped = (await (await patch(created.id, { dayOfMonth: 31 })).json()) as Created;
    expect(clamped.dayOfMonth).toBe(31);
    expect(clamped.nextOccurrence).toBe("2027-09-30T10:00:00.000Z");
  }, 20000);

  it("does not re-anchor a quarterly series when only dayOfMonth is changed via PATCH", async () => {
    // Quarterly since January 2026: due in Jan, Apr, Jul and Oct. "Today" is 19 Nov 2026.
    const created = (await (
      await create({ amountCents: -30000, description: "Versicherung", intervalMonths: 3, startDate: "2026-01-15" })
    ).json()) as Created;

    const dueMonths = async (year: number) => {
      const { GET } = await import("../app/api/recurring-transactions/yearly/route");
      const res = await GET(new Request(`http://localhost/api/recurring-transactions/yearly?year=${year}`));
      const matrix = (await res.json()) as { expenses: { rows: Array<{ id: string; monthlyCents: number[] }> } };
      const row = matrix.expenses.rows.find((r) => r.id === created.id);
      return row?.monthlyCents.flatMap((cents, index) => (cents === 0 ? [] : [index + 1]));
    };
    expect(await dueMonths(2026)).toEqual([1, 4, 7, 10]);

    const updated = (await (await patch(created.id, { dayOfMonth: 28 })).json()) as Created;
    expect(updated.dayOfMonth).toBe(28);
    // Still anchored in January 2026 — not moved to the next 28th after today.
    expect(updated.nextOccurrence).toBe("2026-01-28T11:00:00.000Z");
    // Same phase, and the months before today stay in the yearly view.
    expect(await dueMonths(2026)).toEqual([1, 4, 7, 10]);
    expect(await dueMonths(2027)).toEqual([1, 4, 7, 10]);
  }, 20000);

  it("leaves nextOccurrence alone when neither startDate nor dayOfMonth is sent", async () => {
    const created = (await (await create({ startDate: "2027-09-10" })).json()) as Created;
    const updated = (await (await patch(created.id, { description: "Umbenannt" })).json()) as Created;
    expect(updated.nextOccurrence).toBe("2027-09-10T10:00:00.000Z");
    expect(updated.dayOfMonth).toBe(10);
  }, 20000);

  it("rejects an invalid startDate (400)", async () => {
    const res = await create({ amountCents: -500, description: "Ungültiges Datum", startDate: "2034-02-31" });
    expect(res.status).toBe(400);

    const createRes = await create({ startDate: "2034-06-15" });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as Created;
    expect((await patch(created.id, { startDate: "2034-13-01" })).status).toBe(400);
  }, 20000);

  describe("startDate must lie within 10 years of today (19 Nov 2026 in Berlin)", () => {
    it("rejects a start date more than 10 years back or ahead on POST (400), and stores nothing", async () => {
      // the typo this guards against: 2016 instead of 2026
      expect((await create({ startDate: "2016-01-01" })).status).toBe(400);
      expect((await create({ startDate: "2016-11-18" })).status).toBe(400);
      expect((await create({ startDate: "2036-11-20" })).status).toBe(400);
      expect((await create({ startDate: "2099-06-15", backfill: true })).status).toBe(400);
      expect(await prisma.recurringTransaction.count({ where: { accountId: testAccountId } })).toBe(0);
    }, 20000);

    it("accepts the same day 10 years back and 10 years ahead", async () => {
      expect((await create({ startDate: "2016-11-19" })).status).toBe(201);
      expect((await create({ startDate: "2036-11-19" })).status).toBe(201);
    }, 20000);

    it("takes today from the Berlin calendar", async () => {
      // 20 Nov 00:30 in Berlin — still 19 Nov in UTC: 20 Nov 2036 is now exactly 10 years ahead.
      vi.setSystemTime(new Date("2026-11-19T23:30:00.000Z"));
      expect((await create({ startDate: "2036-11-20" })).status).toBe(201);
      expect((await create({ startDate: "2016-11-19" })).status).toBe(400);
    }, 20000);

    it("rejects a changed start date outside the range on PATCH (400) and leaves the template as it was", async () => {
      const created = (await (await create({ startDate: "2027-09-10" })).json()) as Created;
      expect((await patch(created.id, { startDate: "2016-09-10" })).status).toBe(400);
      expect((await patch(created.id, { startDate: "2037-09-10" })).status).toBe(400);
      const row = await prisma.recurringTransaction.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.nextOccurrence.toISOString()).toBe("2027-09-10T10:00:00.000Z");
    }, 20000);

    it("does not re-validate an old anchor that the edit form resends unchanged", async () => {
      // A template from before the rule, anchored more than 10 years back. The lower
      // bound keeps the global booking run of a parallel test file away from it.
      const old = await prisma.recurringTransaction.create({
        data: {
          accountId: testAccountId,
          amountCents: -1000,
          description: "Alt",
          frequency: "MONTHLY",
          intervalMonths: 1,
          dayOfMonth: 1,
          nextOccurrence: new Date("2010-03-01T00:00:00.000Z"),
          bookFromPeriod: "2026-11"
        }
      });
      const res = await patch(old.id, {
        description: "Alt, umbenannt",
        intervalMonths: 1,
        dayOfMonth: 1,
        startDate: "2010-03-01"
      });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { description: string }).description).toBe("Alt, umbenannt");
    }, 20000);
  });

  describe("the first booking is never before the start date (POST)", () => {
    it("starts in the following month when dayOfMonth lies before the start date's day", async () => {
      // start 20 November, booked on the 5th: 5 November would be before the start
      const created = (await (await create({ startDate: "2026-11-20", dayOfMonth: 5 })).json()) as Created;
      expect(created.dayOfMonth).toBe(5);
      expect(created.nextOccurrence).toBe("2026-12-05T11:00:00.000Z");
    }, 20000);

    it("compares the day clamped to the length of the start month, and clamps in the following month", async () => {
      // 30 April, day 31: clamped to 30 = the start day -> April
      const april = (await (await create({ startDate: "2027-04-30", dayOfMonth: 31 })).json()) as Created;
      expect(april.nextOccurrence).toBe("2027-04-30T10:00:00.000Z");
      // 31 January, day 30: before the start -> February, which has 28 days in 2027
      const february = (await (await create({ startDate: "2027-01-31", dayOfMonth: 30 })).json()) as Created;
      expect(february.nextOccurrence).toBe("2027-02-28T11:00:00.000Z");
      // 20 December, day 5: rolls over the year
      const january = (await (await create({ startDate: "2026-12-20", dayOfMonth: 5 })).json()) as Created;
      expect(january.nextOccurrence).toBe("2027-01-05T11:00:00.000Z");
    }, 20000);

    it("keeps the start month when dayOfMonth is the start day or later", async () => {
      const same = (await (await create({ startDate: "2026-11-20", dayOfMonth: 20 })).json()) as Created;
      expect(same.nextOccurrence).toBe("2026-11-20T11:00:00.000Z");
      const later = (await (await create({ startDate: "2026-11-20", dayOfMonth: 25 })).json()) as Created;
      expect(later.nextOccurrence).toBe("2026-11-20T11:00:00.000Z");
      expect(later.dayOfMonth).toBe(25);
    }, 20000);

    it("is not applied on PATCH: the edit form resends the stored anchor, which may have another day", async () => {
      const created = (await (await create({ startDate: "2027-09-10" })).json()) as Created;
      const updated = (await (await patch(created.id, { startDate: "2027-09-10", dayOfMonth: 5 })).json()) as Created;
      expect(updated.dayOfMonth).toBe(5);
      expect(updated.nextOccurrence).toBe("2027-09-10T10:00:00.000Z");
      const moved = (await (await patch(created.id, { startDate: "2027-10-20", dayOfMonth: 5 })).json()) as Created;
      expect(moved.nextOccurrence).toBe("2027-10-20T10:00:00.000Z");
    }, 20000);
  });

  describe("bookFromPeriod: a series that starts in the past is booked from the current month on", () => {
    it("is the current Berlin month when the first occurrence lies in an earlier month", async () => {
      const lastMonth = (await (await create({ startDate: "2026-10-31" })).json()) as Created;
      expect(lastMonth.bookFromPeriod).toBe("2026-11");
      const lastYear = (await (await create({ startDate: "2025-11-19", intervalMonths: 12 })).json()) as Created;
      expect(lastYear.bookFromPeriod).toBe("2026-11");
    }, 20000);

    it("stays empty with backfill: true", async () => {
      const created = (await (await create({ startDate: "2026-01-15", backfill: true })).json()) as Created;
      expect(created.bookFromPeriod).toBeNull();
      expect(created.nextOccurrence).toBe("2026-01-15T11:00:00.000Z");
    }, 20000);

    it("stays empty when the first occurrence is in the current month or later, with or without a start date", async () => {
      // earlier this month: the current month is never back-booking
      expect(((await (await create({ startDate: "2026-11-01" })).json()) as Created).bookFromPeriod).toBeNull();
      expect(((await (await create({ startDate: "2026-12-01" })).json()) as Created).bookFromPeriod).toBeNull();
      expect(((await (await create({ dayOfMonth: 1 })).json()) as Created).bookFromPeriod).toBeNull();
      expect(
        ((await (await create({ startDate: "2026-11-01", backfill: false })).json()) as Created).bookFromPeriod
      ).toBeNull();
    }, 20000);

    it("decides by the first occurrence, not by the start date: a start late last month with an earlier day begins this month", async () => {
      // start 20 October, booked on the 5th -> first occurrence 5 November, the current month
      const created = (await (await create({ startDate: "2026-10-20", dayOfMonth: 5 })).json()) as Created;
      expect(created.nextOccurrence).toBe("2026-11-05T11:00:00.000Z");
      expect(created.bookFromPeriod).toBeNull();
    }, 20000);

    it("takes the current month from the Berlin calendar", async () => {
      // 1 Dec 00:30 in Berlin — still 30 Nov in UTC: a November start is now in the past
      vi.setSystemTime(new Date("2026-11-30T23:30:00.000Z"));
      const created = (await (await create({ startDate: "2026-11-15" })).json()) as Created;
      expect(created.bookFromPeriod).toBe("2026-12");
    }, 20000);

    it("rejects a backfill that is not a boolean (400)", async () => {
      expect((await create({ startDate: "2026-01-15", backfill: "yes" })).status).toBe(400);
    }, 20000);
  });

  describe("bookFromPeriod on PATCH", () => {
    /** A template from before the column: quarterly since January 2026, no lower bound. */
    async function existingQuarterly() {
      return prisma.recurringTransaction.create({
        data: {
          accountId: testAccountId,
          amountCents: -30000,
          description: "Versicherung",
          frequency: "MONTHLY",
          intervalMonths: 3,
          dayOfMonth: 15,
          nextOccurrence: new Date("2026-01-15T11:00:00.000Z")
        }
      });
    }

    it("leaves it alone when the form resends the stored start date and interval", async () => {
      const row = await existingQuarterly();
      const resent = { intervalMonths: 3, dayOfMonth: 15, startDate: "2026-01-15" };
      const renamed = (await (await patch(row.id, { ...resent, description: "Umbenannt" })).json()) as Created;
      expect(renamed.bookFromPeriod).toBeNull();

      // also a bound that is already set stays what it is, later on
      await prisma.recurringTransaction.update({ where: { id: row.id }, data: { bookFromPeriod: "2026-08" } });
      vi.setSystemTime(new Date("2027-02-10T10:00:00.000Z"));
      const again = (await (await patch(row.id, { ...resent, amountCents: -31000 })).json()) as Created;
      expect(again.bookFromPeriod).toBe("2026-08");
      // backfill: false is the form's default and changes nothing either
      const unticked = (await (await patch(row.id, { ...resent, backfill: false })).json()) as Created;
      expect(unticked.bookFromPeriod).toBe("2026-08");
      // an explicit backfill: true is the user asking for the past months: it lifts the bound
      const withFlag = (await (await patch(row.id, { ...resent, backfill: true })).json()) as Created;
      expect(withFlag.bookFromPeriod).toBeNull();
    }, 20000);

    it("leaves it alone when only dayOfMonth changes", async () => {
      const row = await existingQuarterly();
      const updated = (await (await patch(row.id, { dayOfMonth: 28 })).json()) as Created;
      expect(updated.bookFromPeriod).toBeNull();
    }, 20000);

    it("reads a stored anchor at Berlin midnight as its Berlin day: resending it is no change", async () => {
      // 1 Aug 2026 the way a dev machine in Berlin stored anchors: 31 July, 22:00 UTC
      const row = await prisma.recurringTransaction.create({
        data: {
          accountId: testAccountId,
          amountCents: -1000,
          description: "Altanker",
          frequency: "MONTHLY",
          intervalMonths: 1,
          dayOfMonth: 1,
          nextOccurrence: new Date("2026-07-31T22:00:00.000Z")
        }
      });
      const updated = (await (
        await patch(row.id, { intervalMonths: 1, dayOfMonth: 1, startDate: "2026-08-01" })
      ).json()) as Created;
      expect(updated.bookFromPeriod).toBeNull();
    }, 20000);

    it("sets it to the current month when the interval changes and the anchor is in the past", async () => {
      const row = await existingQuarterly();
      const updated = (await (
        await patch(row.id, { intervalMonths: 1, dayOfMonth: 15, startDate: "2026-01-15" })
      ).json()) as Created;
      expect(updated.bookFromPeriod).toBe("2026-11");
      // the anchor itself is untouched
      expect(updated.nextOccurrence).toBe("2026-01-15T11:00:00.000Z");
    }, 20000);

    it("sets it to the current month when the start date moves to another day in the past", async () => {
      const row = await existingQuarterly();
      const updated = (await (await patch(row.id, { startDate: "2026-02-15" })).json()) as Created;
      expect(updated.bookFromPeriod).toBe("2026-11");
    }, 20000);

    it("clears it with backfill: true, and when the start moves into the current month or the future", async () => {
      const row = await existingQuarterly();
      await prisma.recurringTransaction.update({ where: { id: row.id }, data: { bookFromPeriod: "2026-08" } });

      const backfilled = (await (await patch(row.id, { intervalMonths: 1, backfill: true })).json()) as Created;
      expect(backfilled.bookFromPeriod).toBeNull();

      const past = (await (await patch(row.id, { startDate: "2026-03-15" })).json()) as Created;
      expect(past.bookFromPeriod).toBe("2026-11");
      const future = (await (await patch(row.id, { startDate: "2027-03-15" })).json()) as Created;
      expect(future.bookFromPeriod).toBeNull();
      const thisMonth = (await (await patch(row.id, { startDate: "2026-11-02" })).json()) as Created;
      expect(thisMonth.bookFromPeriod).toBeNull();
    }, 20000);
  });
});
