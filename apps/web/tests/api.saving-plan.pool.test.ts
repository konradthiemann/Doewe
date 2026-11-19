import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Route-level tests for the saving plan: one savings pool per household (all
// savings categories, all accounts), goals are Budget rows without a category,
// deleted bookings count nowhere, and the suggested monthly rate is measured
// against the pool at the start of the current Europe/Berlin month.
// All fixtures are fixed UTC instants and "now" is pinned, so the suite gives
// the same answer in any process time zone (run it with TZ=UTC as well).

const TEST_USER_ID = "test-user-saving-pool";
const ACCOUNT_ID = "acc_saving_pool_main";
const SECOND_ACCOUNT_ID = "acc_saving_pool_second";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

/** 19 Nov 2026, 11:00 in Berlin. */
const NOW = new Date("2026-11-19T10:00:00.000Z");

type Goal = {
  id: string;
  title: string;
  categoryId: string | null;
  amountCents: number | null;
  transactionSpentCents: number;
};
type Plan = {
  goals: Goal[];
  undatedGoals: Goal[];
  completedGoals: Goal[];
  totals: {
    rawAvailableCents: number;
    withdrawnForCompletedCents: number;
    availableCents: number;
    totalTargetCents: number;
    suggestedMonthlyCents: number;
  };
};

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let savingsId: string;
let sparenId: string;
let foodId: string;
let holidayGoalId: string;
let bikeGoalId: string;
let categoryBudgetId: string;

async function plan(): Promise<Plan> {
  const { GET } = await import("../app/api/saving-plan/route");
  const res = await GET();
  expect(res.status).toBe(200);
  return (await res.json()) as Plan;
}

const jsonReq = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

async function withdraw(body: unknown): Promise<Response> {
  const { POST } = await import("../app/api/saving-plan/withdraw/route");
  return POST(jsonReq("http://localhost/api/saving-plan/withdraw", "POST", body));
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function wipe() {
  for (const accountId of [ACCOUNT_ID, SECOND_ACCOUNT_ID]) {
    await prisma.transaction.deleteMany({ where: { accountId } });
    await prisma.budget.deleteMany({ where: { accountId } });
  }
  await prisma.category.deleteMany({ where: { householdId } });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "saving-pool-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "saving-pool-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id);

  for (const [id, createdAt] of [
    [ACCOUNT_ID, new Date("2025-01-01T00:00:00.000Z")],
    [SECOND_ACCOUNT_ID, new Date("2025-06-01T00:00:00.000Z")]
  ] as const) {
    await prisma.account.upsert({
      where: { id },
      update: { userId: user.id, householdId, deletedAt: null },
      create: { id, name: id, userId: user.id, householdId, createdAt }
    });
  }
  await wipe();

  const mk = async (name: string, createdAt: string) =>
    (await prisma.category.create({ data: { name, userId: user.id, householdId, createdAt: new Date(createdAt) } }))
      .id;
  // Two savings categories; the second with stray whitespace and created later.
  savingsId = await mk("Savings", "2025-01-01T00:00:00.000Z");
  sparenId = await mk(" Sparen ", "2025-02-01T00:00:00.000Z");
  foodId = await mk("SP Food", "2025-01-01T00:00:00.000Z");

  // A real goal: 1,200 € due January 2027.
  holidayGoalId = (
    await prisma.budget.create({
      data: { accountId: ACCOUNT_ID, categoryId: null, title: "Urlaub", month: 1, year: 2027, amountCents: 120_000 }
    })
  ).id;
  // An undated idea on the second account: listed, but outside the plan.
  await prisma.budget.create({
    data: { accountId: SECOND_ACCOUNT_ID, categoryId: null, title: "Küche", month: null, year: null, amountCents: null }
  });
  // A category budget (as the demo seed and older versions create them): not a goal.
  categoryBudgetId = (
    await prisma.budget.create({
      data: { accountId: ACCOUNT_ID, categoryId: foodId, title: "", month: 11, year: 2026, amountCents: 50_000 }
    })
  ).id;

  const t = (
    amountCents: number,
    description: string,
    occurredAt: string,
    categoryId: string | null,
    extra: { accountId?: string; deletedAt?: Date; savingGoalId?: string } = {}
  ) => ({ accountId: ACCOUNT_ID, amountCents, description, occurredAt: new Date(occurredAt), categoryId, ...extra });

  await prisma.transaction.createMany({
    data: [
      // ── October 2026 ──────────────────────────────────────────────────
      t(-30_000, "oct deposit", "2026-10-15T10:00:00.000Z", savingsId),
      t(-10_000, "oct deposit, 2nd category, 2nd account", "2026-10-16T10:00:00.000Z", sparenId, {
        accountId: SECOND_ACCOUNT_ID
      }),
      t(-99_900, "oct deposit, deleted", "2026-10-17T10:00:00.000Z", savingsId, {
        deletedAt: new Date("2026-10-18T10:00:00.000Z")
      }),
      // ── November 2026 (current month) ─────────────────────────────────
      // 1 Nov 00:00:30 in Berlin — still 31 Oct in UTC
      t(-5_000, "nov deposit, first minute", "2026-10-31T23:00:30.000Z", sparenId),
      t(-40_000, "nov deposit", "2026-11-05T10:00:00.000Z", savingsId),
      // Spent for the goal: one live booking, one deleted.
      t(-20_000, "flight", "2026-11-06T10:00:00.000Z", foodId, { savingGoalId: holidayGoalId }),
      t(-30_000, "hotel, deleted", "2026-11-07T10:00:00.000Z", foodId, {
        savingGoalId: holidayGoalId,
        deletedAt: new Date("2026-11-08T10:00:00.000Z")
      }),
      // A booking linked to the category budget row must not make it a goal.
      t(-1_000, "groceries", "2026-11-09T10:00:00.000Z", foodId, { savingGoalId: categoryBudgetId })
    ]
  });
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  vi.useRealTimers();
  if (prisma) {
    await wipe();
    await prisma.account.deleteMany({ where: { id: { in: [ACCOUNT_ID, SECOND_ACCOUNT_ID] } } });
    await cleanupTestHousehold(prisma, TEST_USER_ID);
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.$disconnect();
  }
});

describe("GET /api/saving-plan", () => {
  it("lists only Budget rows without a category as goals, across all accounts", async () => {
    const data = await plan();

    expect(data.goals.map((g) => g.title)).toEqual(["Urlaub"]);
    expect(data.undatedGoals.map((g) => g.title)).toEqual(["Küche"]);
    expect(data.completedGoals).toEqual([]);
    const all = [...data.goals, ...data.undatedGoals, ...data.completedGoals];
    expect(all.some((g) => g.id === categoryBudgetId)).toBe(false);
    expect(all.every((g) => g.categoryId === null)).toBe(true);
    // The 500 € category budget is not part of the planned total.
    expect(data.totals.totalTargetCents).toBe(120_000);
  });

  it("sums the pool over every savings category and every account, without deleted bookings", async () => {
    const data = await plan();

    // 300 + 100 (2nd category, 2nd account) + 50 + 400; the deleted 999 € is out.
    expect(data.totals.rawAvailableCents).toBe(85_000);
    expect(data.totals.availableCents).toBe(85_000);
    expect(data.totals.withdrawnForCompletedCents).toBe(0);
  });

  it("does not count deleted bookings as spent for a goal", async () => {
    const data = await plan();
    expect(data.goals[0].transactionSpentCents).toBe(20_000);
  });

  it("measures the suggested rate against the pool at the start of the Berlin month", async () => {
    const data = await plan();

    // 450 € of the 850 € were deposited in November (the 00:00:30 booking
    // included): covered at the start of the month 400 €, two months left.
    expect(data.totals.suggestedMonthlyCents).toBe(40_000);
  });

  it("switches the month at midnight in Berlin", async () => {
    // 1 Nov 00:30 in Berlin (31 Oct 23:30 UTC): November, same answer as on the 19th.
    vi.setSystemTime(new Date("2026-10-31T23:30:00.000Z"));
    expect((await plan()).totals.suggestedMonthlyCents).toBe(40_000);

    // 31 Oct 23:30 in Berlin: October. 400 € were deposited in October, so
    // 450 € were covered at its start; three months left: (1200 − 450) / 3.
    vi.setSystemTime(new Date("2026-10-31T22:30:00.000Z"));
    expect((await plan()).totals.suggestedMonthlyCents).toBe(25_000);

    // 1 Dec 00:30 in Berlin (30 Nov 23:30 UTC): nothing deposited in December
    // yet, one month left: (1200 − 850) / 1.
    vi.setSystemTime(new Date("2026-11-30T23:30:00.000Z"));
    expect((await plan()).totals.suggestedMonthlyCents).toBe(35_000);
  });

  it("rejects a title consisting only of whitespace with 400", async () => {
    const { POST } = await import("../app/api/saving-plan/route");
    const res = await POST(
      jsonReq("http://localhost/api/saving-plan", "POST", { accountId: ACCOUNT_ID, title: "   " })
    );
    expect(res.status).toBe(400);
  });
});

describe("a category budget is not a saving goal", () => {
  it("GET, PATCH and DELETE /api/saving-plan/[id] answer 404", async () => {
    const routes = await import("../app/api/saving-plan/[id]/route");
    const url = `http://localhost/api/saving-plan/${categoryBudgetId}`;

    expect((await routes.GET(jsonReq(url, "GET"), ctx(categoryBudgetId))).status).toBe(404);
    expect(
      (await routes.PATCH(jsonReq(url, "PATCH", { title: "Hijacked", amountCents: 1 }), ctx(categoryBudgetId))).status
    ).toBe(404);
    expect((await routes.DELETE(jsonReq(url, "DELETE"), ctx(categoryBudgetId))).status).toBe(404);

    const row = await prisma.budget.findUnique({ where: { id: categoryBudgetId } });
    expect(row?.title).toBe("");
    expect(row?.amountCents).toBe(50_000);
    expect(row?.deletedAt).toBeNull();
  });

  it("POST and DELETE /api/saving-plan/[id]/complete answer 404", async () => {
    const routes = await import("../app/api/saving-plan/[id]/complete/route");
    const url = `http://localhost/api/saving-plan/${categoryBudgetId}/complete`;

    expect((await routes.POST(jsonReq(url, "POST", { spentCents: 10_000 }), ctx(categoryBudgetId))).status).toBe(404);
    expect((await routes.DELETE(jsonReq(url, "DELETE"), ctx(categoryBudgetId))).status).toBe(404);

    const row = await prisma.budget.findUnique({ where: { id: categoryBudgetId } });
    expect(row?.completedAt).toBeNull();
    expect(row?.spentCents).toBeNull();
    // The pool is untouched.
    expect((await plan()).totals.availableCents).toBe(85_000);
  });

  it("a real goal can still be edited", async () => {
    const routes = await import("../app/api/saving-plan/[id]/route");
    const url = `http://localhost/api/saving-plan/${holidayGoalId}`;

    const res = await routes.PATCH(jsonReq(url, "PATCH", { title: "  Sommerurlaub " }), ctx(holidayGoalId));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { title: string }).title).toBe("Sommerurlaub");

    const blank = await routes.PATCH(jsonReq(url, "PATCH", { title: "   " }), ctx(holidayGoalId));
    expect(blank.status).toBe(400);
  });
});

describe("completing and withdrawing use the household pool", () => {
  it("completing a goal takes its amount out of the pool with a booking; reopening puts it back", async () => {
    bikeGoalId = (
      await prisma.budget.create({
        data: { accountId: SECOND_ACCOUNT_ID, categoryId: null, title: "Fahrrad", month: 12, year: 2026, amountCents: 25_000 }
      })
    ).id;
    const routes = await import("../app/api/saving-plan/[id]/complete/route");
    const url = `http://localhost/api/saving-plan/${bikeGoalId}/complete`;

    const done = await routes.POST(jsonReq(url, "POST", { spentCents: 25_000 }), ctx(bikeGoalId));
    expect(done.status).toBe(200);
    const body = (await done.json()) as { completedAt: string; spentCents: number; withdrawnCents: number };
    // completedAt is the instant of the request.
    expect(body.completedAt).toBe(NOW.toISOString());
    expect(body.spentCents).toBe(25_000);
    expect(body.withdrawnCents).toBe(25_000);

    // The pool is the sum of the savings bookings again: nothing is held back.
    const afterComplete = await plan();
    expect(afterComplete.completedGoals.map((g) => g.title)).toEqual(["Fahrrad"]);
    expect(afterComplete.totals.rawAvailableCents).toBe(60_000);
    expect(afterComplete.totals.withdrawnForCompletedCents).toBe(0);
    expect(afterComplete.totals.availableCents).toBe(60_000);

    const tooMuch = await routes.POST(jsonReq(url, "POST", { spentCents: 3_000_000_000 }), ctx(bikeGoalId));
    expect(tooMuch.status).toBe(400);

    const reopened = await routes.DELETE(jsonReq(url, "DELETE"), ctx(bikeGoalId));
    expect(reopened.status).toBe(200);
    const afterReopen = await plan();
    expect(afterReopen.totals.rawAvailableCents).toBe(85_000);
    expect(afterReopen.totals.availableCents).toBe(85_000);

    await prisma.budget.delete({ where: { id: bikeGoalId } });
  });

  it("caps a withdrawal at the household pool, whichever account it is booked on", async () => {
    // The second account alone holds only 100 € of savings bookings.
    const tooMuch = await withdraw({ accountId: SECOND_ACCOUNT_ID, amountCents: 85_001 });
    expect(tooMuch.status).toBe(409);
    expect(((await tooMuch.json()) as { availableCents: number }).availableCents).toBe(85_000);

    const ok = await withdraw({ accountId: SECOND_ACCOUNT_ID, amountCents: 80_000 });
    expect(ok.status).toBe(201);
    const body = (await ok.json()) as { id: string; amountCents: number; availableCents: number };
    expect(body.amountCents).toBe(80_000);
    expect(body.availableCents).toBe(5_000);

    // Booked as a positive row in the oldest savings category, at the instant of the request.
    const row = await prisma.transaction.findUnique({ where: { id: body.id } });
    expect(row?.categoryId).toBe(savingsId);
    expect(row?.accountId).toBe(SECOND_ACCOUNT_ID);
    expect(row?.amountCents).toBe(80_000);
    expect(row?.occurredAt.toISOString()).toBe(NOW.toISOString());

    const data = await plan();
    expect(data.totals.availableCents).toBe(5_000);
    // November is now a net withdrawal (450 − 800): it is not added back, the
    // rate is measured against the 50 € that are left: ceil((1200 − 50) / 2).
    expect(data.totals.suggestedMonthlyCents).toBe(57_500);

    const next = await withdraw({ amountCents: 5_001 });
    expect(next.status).toBe(409);
    expect(((await next.json()) as { availableCents: number }).availableCents).toBe(5_000);
  });
});
