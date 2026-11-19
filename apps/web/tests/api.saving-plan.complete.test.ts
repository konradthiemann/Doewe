import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Completing a saving goal takes the money out of the pool with a real booking
// (POST /api/saving-plan/[id]/complete), reopening puts it back, and goals
// completed before that change keep the amount they held back (reservedCents).
// Fixed UTC instants and a pinned clock: same result in any process time zone.

const TEST_USER_ID = "test-user-saving-complete";
const OTHER_USER_ID = "test-user-saving-complete-other";
const ACCOUNT_ID = "acc_saving_complete_main";
const SECOND_ACCOUNT_ID = "acc_saving_complete_second";
const OTHER_ACCOUNT_ID = "acc_saving_complete_other";
const ACCOUNT_IDS = [ACCOUNT_ID, SECOND_ACCOUNT_ID];
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

/** 19 Nov 2026, 11:00 in Berlin. */
const NOW = new Date("2026-11-19T10:00:00.000Z");
const OCTOBER = new Date("2026-10-15T10:00:00.000Z");

type Totals = {
  rawAvailableCents: number;
  withdrawnForCompletedCents: number;
  availableCents: number;
  totalTargetCents: number;
  suggestedMonthlyCents: number;
};
type GoalDto = { id: string; title: string; transactionSpentCents: number; spentCents: number | null };
type Plan = { goals: GoalDto[]; undatedGoals: GoalDto[]; completedGoals: GoalDto[]; totals: Totals };
type Completed = {
  id: string;
  completedAt: string | null;
  spentCents: number | null;
  withdrawalTransactionId: string | null;
  reservedCents: number | null;
  withdrawnCents: number;
  expenseTransactionId: string | null;
};

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let otherHouseholdId: string;
let savingsId: string;
let sparenId: string;
let travelId: string;
let taxId: string;
let foreignCategoryId: string;

const jsonReq = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function plan(): Promise<Plan> {
  const { GET } = await import("../app/api/saving-plan/route");
  const res = await GET();
  expect(res.status).toBe(200);
  return (await res.json()) as Plan;
}

async function complete(goalId: string, body: unknown): Promise<Response> {
  const { POST } = await import("../app/api/saving-plan/[id]/complete/route");
  return POST(jsonReq(`http://localhost/api/saving-plan/${goalId}/complete`, "POST", body), ctx(goalId));
}

async function reopen(goalId: string): Promise<Response> {
  const { DELETE } = await import("../app/api/saving-plan/[id]/complete/route");
  return DELETE(jsonReq(`http://localhost/api/saving-plan/${goalId}/complete`, "DELETE"), ctx(goalId));
}

async function withdraw(amountCents: number): Promise<Response> {
  const { POST } = await import("../app/api/saving-plan/withdraw/route");
  return POST(jsonReq("http://localhost/api/saving-plan/withdraw", "POST", { amountCents }));
}

async function goal(title: string, amountCents: number, extra: Record<string, unknown> = {}): Promise<string> {
  const row = await prisma.budget.create({
    data: { accountId: ACCOUNT_ID, categoryId: null, title, month: 12, year: 2026, amountCents, ...extra }
  });
  return row.id;
}

async function booking(
  amountCents: number,
  categoryId: string | null,
  extra: { accountId?: string; savingGoalId?: string; deletedAt?: Date; occurredAt?: Date } = {}
): Promise<string> {
  const row = await prisma.transaction.create({
    data: { accountId: ACCOUNT_ID, categoryId, amountCents, description: "SC booking", occurredAt: OCTOBER, ...extra }
  });
  return row.id;
}

/** Amounts of all live bookings of the household, smallest first. */
async function liveAmounts(): Promise<number[]> {
  const rows = await prisma.transaction.findMany({
    where: { accountId: { in: ACCOUNT_IDS }, deletedAt: null },
    select: { amountCents: true }
  });
  return rows.map((row) => row.amountCents).sort((a, b) => a - b);
}

/** The pool as the bookings alone give it: minus the sum of all live savings bookings. */
async function poolFromBookings(): Promise<number> {
  const agg = await prisma.transaction.aggregate({
    where: { accountId: { in: ACCOUNT_IDS }, deletedAt: null, categoryId: { in: [savingsId, sparenId] } },
    _sum: { amountCents: true }
  });
  return 0 - (agg._sum.amountCents ?? 0);
}

async function accountBalance(): Promise<number> {
  const agg = await prisma.transaction.aggregate({
    where: { accountId: { in: ACCOUNT_IDS }, deletedAt: null },
    _sum: { amountCents: true }
  });
  return agg._sum.amountCents ?? 0;
}

async function clean() {
  await prisma.budgetAlertLog.deleteMany({ where: { householdId } });
  await prisma.budgetMonthSnapshot.deleteMany({ where: { householdId } });
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
  await prisma.transaction.deleteMany({ where: { accountId: { in: ACCOUNT_IDS } } });
  await prisma.budget.deleteMany({ where: { accountId: { in: ACCOUNT_IDS } } });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "saving-complete-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "saving-complete-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id);
  for (const [id, createdAt] of [
    [ACCOUNT_ID, "2025-01-01T00:00:00.000Z"],
    [SECOND_ACCOUNT_ID, "2025-06-01T00:00:00.000Z"]
  ] as const) {
    await prisma.account.upsert({
      where: { id },
      update: { userId: user.id, householdId, deletedAt: null },
      create: { id, name: id, userId: user.id, householdId, createdAt: new Date(createdAt) }
    });
  }
  await clean();
  await prisma.category.deleteMany({ where: { householdId } });
  const mk = async (name: string, createdAt: string, isTaxRelevant = false) =>
    (
      await prisma.category.create({
        data: { name, userId: user.id, householdId, isTaxRelevant, createdAt: new Date(createdAt) }
      })
    ).id;
  // Two savings categories: withdrawals go to the oldest.
  savingsId = await mk("Savings", "2025-01-01T00:00:00.000Z");
  sparenId = await mk(" Sparen ", "2025-02-01T00:00:00.000Z");
  travelId = await mk("SC Travel", "2025-01-01T00:00:00.000Z");
  taxId = await mk("SC Office", "2025-01-01T00:00:00.000Z", true);

  // Another household: its category and account must not be usable here.
  const other = await prisma.user.upsert({
    where: { email: "saving-complete-other@example.com" },
    update: {},
    create: { id: OTHER_USER_ID, email: "saving-complete-other@example.com", password: "hashed" }
  });
  otherHouseholdId = await ensureTestHousehold(prisma, other.id);
  await prisma.account.upsert({
    where: { id: OTHER_ACCOUNT_ID },
    update: { userId: other.id, householdId: otherHouseholdId, deletedAt: null },
    create: { id: OTHER_ACCOUNT_ID, name: OTHER_ACCOUNT_ID, userId: other.id, householdId: otherHouseholdId }
  });
  foreignCategoryId = (
    await prisma.category.upsert({
      where: { householdId_name: { householdId: otherHouseholdId, name: "SC Foreign" } },
      update: { deletedAt: null },
      create: { name: "SC Foreign", userId: other.id, householdId: otherHouseholdId }
    })
  ).id;
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  await clean();
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  vi.useRealTimers();
  if (!prisma) return;
  await clean();
  await prisma.category.deleteMany({ where: { householdId: { in: [householdId, otherHouseholdId] } } });
  await prisma.account.deleteMany({ where: { id: { in: [...ACCOUNT_IDS, OTHER_ACCOUNT_ID] } } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await cleanupTestHousehold(prisma, OTHER_USER_ID);
  await prisma.user.deleteMany({ where: { id: { in: [TEST_USER_ID, OTHER_USER_ID] } } });
  await prisma.$disconnect();
});

describe("completing a goal books the withdrawal", () => {
  it("takes min(spent, pool) out of the pool as a positive savings booking on the goal's account", async () => {
    await booking(-50_000, savingsId);
    await booking(-10_000, sparenId, { accountId: SECOND_ACCOUNT_ID });
    const id = await goal("Fahrrad", 25_000, { accountId: SECOND_ACCOUNT_ID });

    const res = await complete(id, { spentCents: 25_000 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Completed & { title: string; accountId: string };
    expect(body).toMatchObject({
      id,
      title: "Fahrrad",
      accountId: SECOND_ACCOUNT_ID,
      completedAt: NOW.toISOString(),
      spentCents: 25_000,
      reservedCents: null,
      withdrawnCents: 25_000,
      expenseTransactionId: null
    });
    expect(body.withdrawalTransactionId).toEqual(expect.any(String));

    const withdrawal = await prisma.transaction.findUniqueOrThrow({ where: { id: body.withdrawalTransactionId! } });
    expect(withdrawal).toMatchObject({
      accountId: SECOND_ACCOUNT_ID,
      categoryId: savingsId, // the oldest savings category
      amountCents: 25_000,
      description: "Sparziel: Fahrrad",
      savingGoalId: null,
      createdByUserId: TEST_USER_ID,
      deletedAt: null
    });
    expect(withdrawal.occurredAt.toISOString()).toBe(NOW.toISOString());

    const stored = await prisma.budget.findUniqueOrThrow({ where: { id } });
    expect(stored.withdrawalTransactionId).toBe(withdrawal.id);
    expect(stored.reservedCents).toBeNull();

    // "Verfügbar" is the sum of the savings bookings — nothing is held back on paper.
    const { totals, completedGoals } = await plan();
    expect(totals.rawAvailableCents).toBe(35_000);
    expect(totals.withdrawnForCompletedCents).toBe(0);
    expect(totals.availableCents).toBe(35_000);
    expect(totals.availableCents).toBe(await poolFromBookings());
    // A withdrawal is not "spent on the goal".
    expect(completedGoals).toHaveLength(1);
    expect(completedGoals[0]).toMatchObject({ id, spentCents: 25_000, transactionSpentCents: 0 });
  });

  it("withdraws only what the pool holds, and does not swallow later deposits", async () => {
    await booking(-30_000, savingsId);
    const id = await goal("Auto", 100_000);

    const res = await complete(id, { spentCents: 100_000 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Completed;
    expect(body.spentCents).toBe(100_000);
    expect(body.withdrawnCents).toBe(30_000);

    expect((await plan()).totals).toMatchObject({ rawAvailableCents: 0, availableCents: 0 });

    // A deposit after the completion is fully available.
    await booking(-20_000, savingsId, { occurredAt: NOW });
    expect((await plan()).totals).toMatchObject({
      rawAvailableCents: 20_000,
      withdrawnForCompletedCents: 0,
      availableCents: 20_000
    });
  });

  it("books nothing when the pool is empty or nothing was spent", async () => {
    const empty = await goal("Leer", 10_000);
    const emptyBody = (await (await complete(empty, { spentCents: 10_000 })).json()) as Completed;
    expect(emptyBody).toMatchObject({ withdrawnCents: 0, withdrawalTransactionId: null, spentCents: 10_000 });

    await booking(-30_000, savingsId);
    const free = await goal("Geschenkt", 10_000);
    const freeBody = (await (await complete(free, { spentCents: 0 })).json()) as Completed;
    expect(freeBody).toMatchObject({ withdrawnCents: 0, withdrawalTransactionId: null, spentCents: 0 });

    // Only the deposit exists.
    expect(await liveAmounts()).toEqual([-30_000]);
    expect((await plan()).totals.availableCents).toBe(30_000);
  });

  it("with withdraw false books nothing: withdrawing first and completing then takes the money out once", async () => {
    await booking(-50_000, savingsId);
    const id = await goal("Urlaub", 30_000);

    expect((await withdraw(30_000)).status).toBe(201);
    const res = await complete(id, { spentCents: 30_000, withdraw: false });
    expect(res.status).toBe(200);
    expect((await res.json()) as Completed).toMatchObject({
      spentCents: 30_000,
      withdrawnCents: 0,
      withdrawalTransactionId: null,
      reservedCents: null
    });

    // 500 − 300, not 500 − 300 − 300.
    expect((await plan()).totals).toMatchObject({
      rawAvailableCents: 20_000,
      withdrawnForCompletedCents: 0,
      availableCents: 20_000
    });
    expect(await liveAmounts()).toEqual([-50_000, 30_000]);
  });
});

describe("completing a goal can book the purchase", () => {
  it("books the expense in the given category, linked to the goal — the account balance drops once", async () => {
    await booking(-40_000, savingsId);
    expect(await accountBalance()).toBe(-40_000);
    const id = await goal("Laptop", 40_000);

    const res = await complete(id, { spentCents: 40_000, expense: { categoryId: taxId } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Completed;
    expect(body.withdrawnCents).toBe(40_000);
    expect(body.expenseTransactionId).toEqual(expect.any(String));

    const purchase = await prisma.transaction.findUniqueOrThrow({ where: { id: body.expenseTransactionId! } });
    expect(purchase).toMatchObject({
      accountId: ACCOUNT_ID, // the goal's account
      categoryId: taxId,
      savingGoalId: id,
      amountCents: -40_000,
      description: "Laptop",
      taxRelevant: true, // inherited from the category
      createdByUserId: TEST_USER_ID
    });
    expect(purchase.occurredAt.toISOString()).toBe(NOW.toISOString());

    // Deposit −400, withdrawal +400, purchase −400: the money left the account once.
    expect(await accountBalance()).toBe(-40_000);
    const data = await plan();
    expect(data.totals.availableCents).toBe(0);
    expect(data.completedGoals[0].transactionSpentCents).toBe(40_000);
  });

  it("books it on expense.accountId and without a category when categoryId is null", async () => {
    await booking(-40_000, savingsId);
    const id = await goal("Sofa", 40_000);

    const res = await complete(id, {
      spentCents: 35_000,
      withdraw: false,
      expense: { categoryId: null, accountId: SECOND_ACCOUNT_ID }
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Completed;
    expect(body).toMatchObject({ withdrawnCents: 0, withdrawalTransactionId: null });

    const purchase = await prisma.transaction.findUniqueOrThrow({ where: { id: body.expenseTransactionId! } });
    expect(purchase).toMatchObject({
      accountId: SECOND_ACCOUNT_ID,
      categoryId: null,
      savingGoalId: id,
      amountCents: -35_000,
      taxRelevant: false
    });
    expect((await plan()).totals.availableCents).toBe(40_000);
  });

  it("books no purchase when nothing was spent or expense is null", async () => {
    await booking(-40_000, savingsId);
    const free = await goal("Geschenkt", 10_000);
    const freeBody = (await (await complete(free, { spentCents: 0, expense: { categoryId: travelId } })).json()) as Completed;
    expect(freeBody.expenseTransactionId).toBeNull();

    const plain = await goal("Ohne Kauf", 10_000);
    const plainBody = (await (await complete(plain, { spentCents: 10_000, expense: null })).json()) as Completed;
    expect(plainBody).toMatchObject({ withdrawnCents: 10_000, expenseTransactionId: null });

    expect(await liveAmounts()).toEqual([-40_000, 10_000]);
  });

  it("checks the budget alert of the category the purchase is booked in", async () => {
    await prisma.categoryBudgetPlan.create({
      data: { householdId, categoryId: travelId, period: "MONTHLY", amountCents: 5_000 }
    });
    await booking(-10_000, savingsId);
    const id = await goal("Staffelei", 6_000);

    expect((await complete(id, { spentCents: 6_000, expense: { categoryId: travelId } })).status).toBe(200);

    // 60 € in a category with a budget of 50 €: 100 % is announced, 80 % marked as sent.
    const logged = await prisma.budgetAlertLog.findMany({
      where: { householdId, categoryId: travelId, year: 2026, month: 11 },
      orderBy: { threshold: "asc" }
    });
    expect(logged.map((row) => row.threshold)).toEqual([80, 100]);
  });

  it("rejects a foreign category (404), a savings category (400) and a foreign account (404) without changing anything", async () => {
    await booking(-40_000, savingsId);
    const id = await goal("Reise", 40_000);

    expect((await complete(id, { spentCents: 40_000, expense: { categoryId: foreignCategoryId } })).status).toBe(404);
    expect((await complete(id, { spentCents: 40_000, expense: { categoryId: "does-not-exist" } })).status).toBe(404);
    expect((await complete(id, { spentCents: 40_000, expense: { categoryId: sparenId } })).status).toBe(400);
    expect(
      (await complete(id, { spentCents: 40_000, expense: { categoryId: travelId, accountId: OTHER_ACCOUNT_ID } })).status
    ).toBe(404);

    const stored = await prisma.budget.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({ completedAt: null, spentCents: null, withdrawalTransactionId: null });
    expect(await liveAmounts()).toEqual([-40_000]);
  });

  it("answers 400 for an invalid body", async () => {
    const id = await goal("Reise", 40_000);
    expect((await complete(id, {})).status).toBe(400);
    expect((await complete(id, { spentCents: -1 })).status).toBe(400);
    expect((await complete(id, { spentCents: 1.5 })).status).toBe(400);
    expect((await complete(id, { spentCents: 100, withdraw: "yes" })).status).toBe(400);
    expect((await complete(id, { spentCents: 100, expense: { accountId: ACCOUNT_ID } })).status).toBe(400);
    const { POST } = await import("../app/api/saving-plan/[id]/complete/route");
    const notJson = await POST(
      new Request(`http://localhost/api/saving-plan/${id}/complete`, { method: "POST", body: "not json" }),
      ctx(id)
    );
    expect(notJson.status).toBe(400);
    expect((await prisma.budget.findUniqueOrThrow({ where: { id } })).completedAt).toBeNull();
  });
});

describe("completing twice", () => {
  it("answers 409 for a goal that is already completed and books nothing more", async () => {
    await booking(-50_000, savingsId);
    const id = await goal("Fahrrad", 20_000);

    expect((await complete(id, { spentCents: 20_000 })).status).toBe(200);
    const again = await complete(id, { spentCents: 20_000, expense: { categoryId: travelId } });
    expect(again.status).toBe(409);

    expect(await liveAmounts()).toEqual([-50_000, 20_000]);
    expect((await plan()).totals.availableCents).toBe(30_000);
  });

  it("lets only one of two simultaneous completions of the same goal through", async () => {
    await booking(-50_000, savingsId);
    const id = await goal("Fahrrad", 20_000);

    const responses = await Promise.all([
      complete(id, { spentCents: 20_000 }),
      complete(id, { spentCents: 20_000 }),
      complete(id, { spentCents: 20_000 })
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409, 409]);

    expect(await liveAmounts()).toEqual([-50_000, 20_000]);
    expect((await plan()).totals.availableCents).toBe(30_000);
  });

  it("never takes more out of the pool than it holds when two goals are completed at the same moment", async () => {
    await booking(-50_000, savingsId);
    const first = await goal("Erstes", 40_000);
    const second = await goal("Zweites", 40_000);

    const responses = await Promise.all([complete(first, { spentCents: 40_000 }), complete(second, { spentCents: 40_000 })]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const withdrawn = await Promise.all(responses.map(async (r) => ((await r.json()) as Completed).withdrawnCents));
    expect(withdrawn.sort((a, b) => a - b)).toEqual([10_000, 40_000]);

    expect(await poolFromBookings()).toBe(0);
    expect((await plan()).totals).toMatchObject({ rawAvailableCents: 0, availableCents: 0 });
  });
});

describe("reopening a goal", () => {
  it("deletes the withdrawal so the money is back in the pool, and leaves the purchase alone", async () => {
    await booking(-50_000, savingsId);
    const id = await goal("Laptop", 30_000);
    const done = (await (await complete(id, { spentCents: 30_000, expense: { categoryId: travelId } })).json()) as Completed;
    expect((await plan()).totals.availableCents).toBe(20_000);

    vi.setSystemTime(new Date("2026-11-20T09:00:00.000Z"));
    const res = await reopen(id);
    expect(res.status).toBe(200);
    expect((await res.json()) as Completed).toMatchObject({
      id,
      completedAt: null,
      spentCents: null,
      withdrawalTransactionId: null,
      reservedCents: null
    });

    const withdrawal = await prisma.transaction.findUniqueOrThrow({ where: { id: done.withdrawalTransactionId! } });
    expect(withdrawal.deletedAt?.toISOString()).toBe("2026-11-20T09:00:00.000Z");
    const purchase = await prisma.transaction.findUniqueOrThrow({ where: { id: done.expenseTransactionId! } });
    expect(purchase).toMatchObject({ deletedAt: null, savingGoalId: id, amountCents: -30_000 });

    const data = await plan();
    expect(data.totals).toMatchObject({ rawAvailableCents: 50_000, withdrawnForCompletedCents: 0, availableCents: 50_000 });
    expect(data.completedGoals).toEqual([]);
    expect(data.goals.map((g) => g.id)).toEqual([id]);
    // The purchase is still an expense linked to the goal.
    expect(data.goals[0].transactionSpentCents).toBe(30_000);

    // Completing again books a fresh withdrawal.
    const again = (await (await complete(id, { spentCents: 30_000 })).json()) as Completed;
    expect(again.withdrawnCents).toBe(30_000);
    expect(again.withdrawalTransactionId).not.toBe(done.withdrawalTransactionId);
    expect((await plan()).totals.availableCents).toBe(20_000);
  });

  it("copes with a withdrawal the user already deleted, and with a goal that had none", async () => {
    await booking(-50_000, savingsId);
    const id = await goal("Fahrrad", 20_000);
    const done = (await (await complete(id, { spentCents: 20_000 })).json()) as Completed;
    const deletedAt = new Date("2026-11-19T10:30:00.000Z");
    await prisma.transaction.update({ where: { id: done.withdrawalTransactionId! }, data: { deletedAt } });

    expect((await reopen(id)).status).toBe(200);
    const withdrawal = await prisma.transaction.findUniqueOrThrow({ where: { id: done.withdrawalTransactionId! } });
    expect(withdrawal.deletedAt?.toISOString()).toBe(deletedAt.toISOString());
    expect((await plan()).totals.availableCents).toBe(50_000);

    const none = await goal("Ohne Entnahme", 10_000);
    await complete(none, { spentCents: 10_000, withdraw: false });
    expect((await reopen(none)).status).toBe(200);
    expect(await liveAmounts()).toEqual([-50_000]);
  });
});

describe("goals completed before withdrawals were booked", () => {
  // What the migration leaves behind: completedAt, spentCents and the same
  // amount in reservedCents, no withdrawal booking.
  const legacy = (title: string, cents: number) =>
    goal(title, cents, { completedAt: OCTOBER, spentCents: cents, reservedCents: cents });

  it("show the same available pool as before: raw minus what they hold back", async () => {
    await booking(-100_000, savingsId);
    await legacy("Alt", 60_000);

    const { totals, completedGoals } = await plan();
    expect(totals).toMatchObject({
      rawAvailableCents: 100_000,
      withdrawnForCompletedCents: 60_000,
      availableCents: 40_000
    });
    expect(completedGoals[0].spentCents).toBe(60_000);

    // The cap of a withdrawal and of a new completion is that same figure.
    const tooMuch = await withdraw(40_001);
    expect(tooMuch.status).toBe(409);
    expect(((await tooMuch.json()) as { availableCents: number }).availableCents).toBe(40_000);

    const next = await goal("Neu", 70_000);
    const body = (await (await complete(next, { spentCents: 70_000 })).json()) as Completed;
    expect(body.withdrawnCents).toBe(40_000);
    expect((await plan()).totals).toMatchObject({
      rawAvailableCents: 60_000,
      withdrawnForCompletedCents: 60_000,
      availableCents: 0
    });
  });

  it("floor the available pool at 0 when they hold back more than the pool", async () => {
    await booking(-30_000, savingsId);
    await legacy("Alt", 60_000);
    expect((await plan()).totals).toMatchObject({ rawAvailableCents: 30_000, availableCents: 0 });
    expect((await withdraw(1)).status).toBe(409);
  });

  it("release the amount when reopened, as before — no booking is touched", async () => {
    await booking(-100_000, savingsId);
    const id = await legacy("Alt", 60_000);

    const res = await reopen(id);
    expect(res.status).toBe(200);
    expect((await res.json()) as Completed).toMatchObject({ completedAt: null, spentCents: null, reservedCents: null });

    expect((await plan()).totals).toMatchObject({
      rawAvailableCents: 100_000,
      withdrawnForCompletedCents: 0,
      availableCents: 100_000
    });
    expect(await liveAmounts()).toEqual([-100_000]);

    // Completed again it behaves like any goal: a booking, no reservation.
    const again = (await (await complete(id, { spentCents: 60_000 })).json()) as Completed;
    expect(again).toMatchObject({ withdrawnCents: 60_000, reservedCents: null });
    expect((await plan()).totals).toMatchObject({
      rawAvailableCents: 40_000,
      withdrawnForCompletedCents: 0,
      availableCents: 40_000
    });
  });

  it("do not hold anything back without reservedCents, whatever spentCents says", async () => {
    await booking(-100_000, savingsId);
    await goal("Seit der Umstellung", 60_000, { completedAt: OCTOBER, spentCents: 60_000 });
    expect((await plan()).totals).toMatchObject({ withdrawnForCompletedCents: 0, availableCents: 100_000 });
    expect((await withdraw(100_000)).status).toBe(201);
  });
});

describe("a deleted goal", () => {
  it("is 404 for reading, editing, deleting, completing and reopening", async () => {
    await booking(-50_000, savingsId);
    const id = await goal("Gelöscht", 20_000, { deletedAt: OCTOBER });
    const routes = await import("../app/api/saving-plan/[id]/route");
    const url = `http://localhost/api/saving-plan/${id}`;

    expect((await routes.GET(jsonReq(url, "GET"), ctx(id))).status).toBe(404);
    expect((await routes.PATCH(jsonReq(url, "PATCH", { title: "Wieder da" }), ctx(id))).status).toBe(404);
    expect((await routes.DELETE(jsonReq(url, "DELETE"), ctx(id))).status).toBe(404);
    expect((await complete(id, { spentCents: 20_000 })).status).toBe(404);
    expect((await reopen(id)).status).toBe(404);

    const stored = await prisma.budget.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({ title: "Gelöscht", completedAt: null, spentCents: null });
    expect(stored.deletedAt?.toISOString()).toBe(OCTOBER.toISOString());
    expect(await liveAmounts()).toEqual([-50_000]);
  });

  it("keeps its withdrawal when a completed goal is deleted: the money did leave the pool", async () => {
    await booking(-50_000, savingsId);
    const id = await goal("Fahrrad", 20_000);
    const done = (await (await complete(id, { spentCents: 20_000 })).json()) as Completed;

    const routes = await import("../app/api/saving-plan/[id]/route");
    const res = await routes.DELETE(jsonReq(`http://localhost/api/saving-plan/${id}`, "DELETE"), ctx(id));
    expect(res.status).toBe(200);

    const withdrawal = await prisma.transaction.findUniqueOrThrow({ where: { id: done.withdrawalTransactionId! } });
    expect(withdrawal.deletedAt).toBeNull();
    const data = await plan();
    expect(data.completedGoals).toEqual([]);
    expect(data.totals).toMatchObject({ rawAvailableCents: 30_000, availableCents: 30_000 });
  });
});

describe("transactionSpentCents — what was spent on a goal", () => {
  it("is the linked expenses minus linked refunds, without savings bookings and deleted rows", async () => {
    const id = await goal("Urlaub", 100_000);
    await booking(-20_000, travelId, { savingGoalId: id }); // flight
    await booking(-5_000, null, { savingGoalId: id }); // uncategorised expense
    await booking(4_000, travelId, { savingGoalId: id }); // refund
    await booking(-30_000, savingsId, { savingGoalId: id }); // a deposit linked to the goal is not spending
    await booking(6_000, sparenId, { savingGoalId: id }); // nor is a withdrawal
    await booking(-9_000, travelId, { savingGoalId: id, deletedAt: NOW });

    const data = await plan();
    expect(data.goals[0].transactionSpentCents).toBe(21_000);
  });

  it("is never below 0", async () => {
    const id = await goal("Urlaub", 100_000);
    await booking(-5_000, travelId, { savingGoalId: id });
    await booking(20_000, travelId, { savingGoalId: id });
    expect((await plan()).goals[0].transactionSpentCents).toBe(0);
  });
});
