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

type Created = { id: string; dayOfMonth: number; nextOccurrence: string; frequency: string };

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
    const res = await create({ amountCents: -1999, description: "Streaming-Abo", intervalMonths: 1, startDate: "2099-06-15" });
    expect(res.status).toBe(201);
    const created = (await res.json()) as Created;

    // 15 June 2099, 12:00 in Berlin (summer time)
    expect(created.nextOccurrence).toBe("2099-06-15T10:00:00.000Z");
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

    it("is this month when the day is today", async () => {
      expect(await anchorFor(19, "2026-11-19T10:00:00.000Z")).toBe("2026-11-19T11:00:00.000Z");
    }, 20000);

    it("is next month when the day has passed", async () => {
      expect(await anchorFor(1, "2026-11-19T10:00:00.000Z")).toBe("2026-12-01T11:00:00.000Z");
      expect(await anchorFor(18, "2026-11-19T10:00:00.000Z")).toBe("2026-12-18T11:00:00.000Z");
    }, 20000);

    it("treats day 30 and day 31 the same on 30 November: both are due today", async () => {
      expect(await anchorFor(30, "2026-11-30T10:00:00.000Z")).toBe("2026-11-30T11:00:00.000Z");
      expect(await anchorFor(31, "2026-11-30T10:00:00.000Z")).toBe("2026-11-30T11:00:00.000Z");
    }, 20000);

    it("clamps to the last day of the following month and rolls over the year", async () => {
      // 31 Jan: day 30 has passed -> February, which has 28 days in 2027.
      expect(await anchorFor(30, "2027-01-31T10:00:00.000Z")).toBe("2027-02-28T11:00:00.000Z");
      expect(await anchorFor(5, "2026-12-15T10:00:00.000Z")).toBe("2027-01-05T11:00:00.000Z");
    }, 20000);

    it("takes today from the Berlin calendar, not from UTC", async () => {
      // 1 Dec 00:30 in Berlin — still 30 Nov in UTC. Day 1 is today, day 30 is ahead in December.
      expect(await anchorFor(1, "2026-11-30T23:30:00.000Z")).toBe("2026-12-01T11:00:00.000Z");
      expect(await anchorFor(30, "2026-11-30T23:30:00.000Z")).toBe("2026-12-30T11:00:00.000Z");
      // 30 Nov 23:30 in Berlin: day 30 is still today.
      expect(await anchorFor(30, "2026-11-30T22:30:00.000Z")).toBe("2026-11-30T11:00:00.000Z");
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
      startDate: "2099-06-15"
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as Created;
    // startDate steuert die erste Buchung; dayOfMonth bleibt der explizit gewählte Wert.
    expect(created.dayOfMonth).toBe(20);
    expect(created.nextOccurrence).toBe("2099-06-15T10:00:00.000Z");
  }, 20000);

  it("updates nextOccurrence when startDate is changed via PATCH", async () => {
    const createRes = await create({ amountCents: -1200, description: "Zeitschrift", intervalMonths: 3, dayOfMonth: 10 });
    const created = (await createRes.json()) as Created;

    const patchRes = await patch(created.id, { startDate: "2099-03-05" });
    expect(patchRes.status).toBe(200);
    const updated = (await patchRes.json()) as Created;
    // 5 March 2099, 12:00 in Berlin (winter time)
    expect(updated.nextOccurrence).toBe("2099-03-05T11:00:00.000Z");
    expect(updated.dayOfMonth).toBe(5);
  }, 20000);

  it("re-anchors from today in Berlin when only dayOfMonth is changed via PATCH", async () => {
    const created = (await (await create({ startDate: "2027-09-10" })).json()) as Created;

    const ahead = (await (await patch(created.id, { dayOfMonth: 25 })).json()) as Created;
    expect(ahead.dayOfMonth).toBe(25);
    expect(ahead.nextOccurrence).toBe("2026-11-25T11:00:00.000Z");

    const passed = (await (await patch(created.id, { dayOfMonth: 5 })).json()) as Created;
    expect(passed.nextOccurrence).toBe("2026-12-05T11:00:00.000Z");
  }, 20000);

  it("leaves nextOccurrence alone when neither startDate nor dayOfMonth is sent", async () => {
    const created = (await (await create({ startDate: "2027-09-10" })).json()) as Created;
    const updated = (await (await patch(created.id, { description: "Umbenannt" })).json()) as Created;
    expect(updated.nextOccurrence).toBe("2027-09-10T10:00:00.000Z");
    expect(updated.dayOfMonth).toBe(10);
  }, 20000);

  it("rejects an invalid startDate (400)", async () => {
    const res = await create({ amountCents: -500, description: "Ungültiges Datum", startDate: "2099-02-31" });
    expect(res.status).toBe(400);

    const created = (await (await create({ startDate: "2099-06-15" })).json()) as Created;
    expect((await patch(created.id, { startDate: "2099-13-01" })).status).toBe(400);
  }, 20000);
});
