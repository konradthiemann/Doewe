import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// The saving plan's monthly rate per month (lib/savingRate.ts): recorded for
// the running Europe/Berlin month whenever the plan is read or a goal changes,
// never again once the month is over; the review compares it with what was
// set aside that month. Clock year 2049, own fixture ids.

const TEST_USER_ID = "test-user-saving-rate-review";
const ACCOUNT_ID = "acc_saving_rate_review";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

/** 19 Nov 2049, 11:00 in Berlin. */
const NOVEMBER = new Date("2049-11-19T10:00:00.000Z");
/** 3 Dec 2049, 11:00 in Berlin. */
const DECEMBER = new Date("2049-12-03T10:00:00.000Z");

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let savingsId: string;

const jsonReq = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function readPlan(): Promise<{ totals: { monthlyRateCents: number } }> {
  const { GET } = await import("../app/api/saving-plan/route");
  const res = await GET();
  expect(res.status).toBe(200);
  return (await res.json()) as { totals: { monthlyRateCents: number } };
}

async function recorded(year: number, month: number): Promise<number | null> {
  const row = await prisma.savingRateMonthSnapshot.findUnique({
    where: { householdId_year_month: { householdId, year, month } }
  });
  return row?.rateCents ?? null;
}

async function goal(title: string, extra: Record<string, unknown>): Promise<string> {
  const row = await prisma.budget.create({
    data: { accountId: ACCOUNT_ID, categoryId: null, title, month: 6, year: 2050, amountCents: 300_000, ...extra }
  });
  return row.id;
}

async function patchGoal(id: string, body: unknown) {
  const { PATCH } = await import("../app/api/saving-plan/[id]/route");
  return PATCH(jsonReq(`http://localhost/api/saving-plan/${id}`, "PATCH", body), ctx(id));
}

async function review(month: number, year: number) {
  const { GET } = await import("../app/api/analytics/monthly-review/route");
  const res = await GET(new Request(`http://localhost/api/analytics/monthly-review?month=${month}&year=${year}`));
  expect(res.status).toBe(200);
  return (await res.json()) as {
    month: number;
    savingsCents: number;
    savingPlan: { rateCents: number | null; savedCents: number };
  };
}

async function clean() {
  await prisma.savingRateMonthSnapshot.deleteMany({ where: { householdId } });
  await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.budget.deleteMany({ where: { accountId: ACCOUNT_ID } });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  const user = await prisma.user.upsert({
    where: { email: "saving-rate-review@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "saving-rate-review@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id);
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: user.id, householdId, deletedAt: null },
    create: { id: ACCOUNT_ID, name: ACCOUNT_ID, userId: user.id, householdId }
  });
  await clean();
  await prisma.category.deleteMany({ where: { householdId } });
  savingsId = (await prisma.category.create({ data: { name: "Sparen", userId: user.id, householdId } })).id;
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOVEMBER);
  await clean();
});

afterAll(async () => {
  vi.useRealTimers();
  if (prisma) {
    await clean();
    await prisma.category.deleteMany({ where: { householdId } });
    await prisma.account.deleteMany({ where: { id: ACCOUNT_ID } });
    await cleanupTestHousehold(prisma, TEST_USER_ID);
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.$disconnect();
  }
});

describe("recording the monthly rate", () => {
  it("writes the running month when the plan is read, and follows changes within the month", async () => {
    const id = await goal("Urlaub", { monthlyRateCents: 40_000 });
    expect((await readPlan()).totals.monthlyRateCents).toBe(40_000);
    expect(await recorded(2049, 11)).toBe(40_000);

    // A change to a goal updates the running month right away — no read needed.
    expect((await patchGoal(id, { monthlyRateCents: 45_000 })).status).toBe(200);
    expect(await recorded(2049, 11)).toBe(45_000);
  });

  it("never rewrites a month that is over", async () => {
    const id = await goal("Urlaub", { monthlyRateCents: 40_000 });
    await readPlan();

    vi.setSystemTime(DECEMBER);
    await patchGoal(id, { monthlyRateCents: 60_000 });
    expect(await recorded(2049, 11)).toBe(40_000);
    expect(await recorded(2049, 12)).toBe(60_000);
  });

  it("records the rate without the goal once it is completed, and with it again when reopened", async () => {
    await goal("Rad", { monthlyRateCents: 10_000 });
    const id = await goal("Urlaub", { monthlyRateCents: 40_000 });
    await readPlan();
    expect(await recorded(2049, 11)).toBe(50_000);

    const routes = await import("../app/api/saving-plan/[id]/complete/route");
    await routes.POST(jsonReq(`http://localhost/api/saving-plan/${id}/complete`, "POST", {}), ctx(id));
    expect(await recorded(2049, 11)).toBe(10_000);
    await routes.DELETE(jsonReq(`http://localhost/api/saving-plan/${id}/complete`, "DELETE"), ctx(id));
    expect(await recorded(2049, 11)).toBe(50_000);
  });

  it("is written for every household by the daily run, not for the demo account", async () => {
    await goal("Urlaub", { monthlyRateCents: 40_000 });
    const { recordSavingRatesForAllHouseholds } = await import("../lib/savingRate");
    expect(await recordSavingRatesForAllHouseholds(NOVEMBER)).toBeGreaterThan(0);
    expect(await recorded(2049, 11)).toBe(40_000);

    const { DEMO_ACCOUNT_ID } = await import("../lib/demoConstants");
    const demo = await prisma.account.findUnique({ where: { id: DEMO_ACCOUNT_ID }, select: { householdId: true } });
    if (demo?.householdId) {
      const demoRow = await prisma.savingRateMonthSnapshot.findUnique({
        where: { householdId_year_month: { householdId: demo.householdId, year: 2049, month: 11 } }
      });
      expect(demoRow).toBeNull();
    }
  });
});

describe("the review of a month", () => {
  it("compares what was set aside with the rate recorded in that month", async () => {
    const id = await goal("Urlaub", { monthlyRateCents: 40_000 });
    await readPlan();
    await prisma.transaction.createMany({
      data: [
        { accountId: ACCOUNT_ID, categoryId: savingsId, amountCents: -30_000, description: "RR deposit", occurredAt: new Date("2049-11-05T11:00:00.000Z") },
        { accountId: ACCOUNT_ID, categoryId: savingsId, amountCents: -5_000, description: "RR deposit 2", occurredAt: new Date("2049-11-20T11:00:00.000Z") }
      ]
    });

    // In December the plan changes; November keeps its rate.
    vi.setSystemTime(DECEMBER);
    await patchGoal(id, { monthlyRateCents: 99_000 });

    const november = await review(11, 2049);
    expect(november.month).toBe(11);
    expect(november.savingPlan).toEqual({ rateCents: 40_000, savedCents: 35_000 });
    expect(november.savingPlan.savedCents).toBe(november.savingsCents);
  });

  it("has no rate for a month in which none was recorded, and never a negative amount set aside", async () => {
    await prisma.transaction.create({
      data: { accountId: ACCOUNT_ID, categoryId: savingsId, amountCents: 20_000, description: "RR back", occurredAt: new Date("2049-10-10T10:00:00.000Z") }
    });
    const october = await review(10, 2049);
    expect(october.savingsCents).toBe(-20_000);
    expect(october.savingPlan).toEqual({ rateCents: null, savedCents: 0 });
  });
});
