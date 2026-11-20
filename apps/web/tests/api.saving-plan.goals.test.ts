import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Route-level tests for the saving plan without a savings balance
// (docs/calculations/07-sparziele.md): goals are Budget rows without a
// category; each dated goal carries a monthly rate the household sets; what
// was spent on a goal comes from linked bookings (monthly budget) and from
// payments recorded on the goal (paid from savings, never a booking).
// Completing books nothing. Fixed UTC instants and a pinned clock (19 Nov 2047),
// so the suite gives the same answer in any process time zone.

const TEST_USER_ID = "test-user-saving-goals";
const OTHER_USER_ID = "test-user-saving-goals-other";
const ACCOUNT_ID = "acc_saving_goals_main";
const SECOND_ACCOUNT_ID = "acc_saving_goals_second";
const OTHER_ACCOUNT_ID = "acc_saving_goals_other";
const ACCOUNT_IDS = [ACCOUNT_ID, SECOND_ACCOUNT_ID];
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

/** 19 Nov 2047, 11:00 in Berlin. */
const NOW = new Date("2047-11-19T10:00:00.000Z");
const OCTOBER = new Date("2047-10-15T10:00:00.000Z");

type Payment = { id: string; amountCents: number; occurredAt: string; note: string | null };
type GoalDto = {
  id: string;
  title: string;
  categoryId: string | null;
  month: number | null;
  year: number | null;
  amountCents: number | null;
  monthlyRateCents: number | null;
  suggestedMonthlyRateCents: number | null;
  transactionSpentCents: number;
  savingsPaidCents: number;
  savingsPayments: Payment[];
  completedAt: string | null;
  spentCents: number | null;
};
type Plan = {
  goals: GoalDto[];
  undatedGoals: GoalDto[];
  completedGoals: GoalDto[];
  totals: Record<string, number>;
};

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let savingsId: string;
let sparenId: string;
let foodId: string;

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

async function goalDto(id: string): Promise<GoalDto> {
  const data = await plan();
  const found = [...data.goals, ...data.undatedGoals, ...data.completedGoals].find((goal) => goal.id === id);
  if (!found) throw new Error(`goal ${id} not in the plan`);
  return found;
}

async function createGoal(body: Record<string, unknown>): Promise<Response> {
  const { POST } = await import("../app/api/saving-plan/route");
  return POST(jsonReq("http://localhost/api/saving-plan", "POST", { accountId: ACCOUNT_ID, ...body }));
}

async function patchGoal(id: string, body: unknown): Promise<Response> {
  const { PATCH } = await import("../app/api/saving-plan/[id]/route");
  return PATCH(jsonReq(`http://localhost/api/saving-plan/${id}`, "PATCH", body), ctx(id));
}

async function addPayment(id: string, body: unknown): Promise<Response> {
  const { POST } = await import("../app/api/saving-plan/[id]/payments/route");
  return POST(jsonReq(`http://localhost/api/saving-plan/${id}/payments`, "POST", body), ctx(id));
}

async function removePayment(id: string, paymentId: string): Promise<Response> {
  const { DELETE } = await import("../app/api/saving-plan/[id]/payments/[paymentId]/route");
  return DELETE(jsonReq(`http://localhost/api/saving-plan/${id}/payments/${paymentId}`, "DELETE"), {
    params: Promise.resolve({ id, paymentId })
  });
}

async function complete(id: string, body?: unknown): Promise<Response> {
  const { POST } = await import("../app/api/saving-plan/[id]/complete/route");
  return POST(jsonReq(`http://localhost/api/saving-plan/${id}/complete`, "POST", body), ctx(id));
}

async function reopen(id: string): Promise<Response> {
  const { DELETE } = await import("../app/api/saving-plan/[id]/complete/route");
  return DELETE(jsonReq(`http://localhost/api/saving-plan/${id}/complete`, "DELETE"), ctx(id));
}

async function goal(title: string, amountCents: number | null, extra: Record<string, unknown> = {}): Promise<string> {
  const row = await prisma.budget.create({
    data: { accountId: ACCOUNT_ID, categoryId: null, title, month: 12, year: 2047, amountCents, ...extra }
  });
  return row.id;
}

async function booking(
  amountCents: number,
  categoryId: string | null,
  extra: { accountId?: string; savingGoalId?: string; deletedAt?: Date } = {}
): Promise<string> {
  const row = await prisma.transaction.create({
    data: { accountId: ACCOUNT_ID, categoryId, amountCents, description: "SG booking", occurredAt: OCTOBER, ...extra }
  });
  return row.id;
}

async function liveBookingCount(): Promise<number> {
  return prisma.transaction.count({ where: { accountId: { in: ACCOUNT_IDS }, deletedAt: null } });
}

async function clean() {
  await prisma.transaction.deleteMany({ where: { accountId: { in: [...ACCOUNT_IDS, OTHER_ACCOUNT_ID] } } });
  // Payments go with their goal (ON DELETE CASCADE).
  await prisma.budget.deleteMany({ where: { accountId: { in: [...ACCOUNT_IDS, OTHER_ACCOUNT_ID] } } });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "saving-goals-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "saving-goals-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id);
  for (const [id, createdAt] of [
    [ACCOUNT_ID, "2040-01-01T00:00:00.000Z"],
    [SECOND_ACCOUNT_ID, "2040-06-01T00:00:00.000Z"]
  ] as const) {
    await prisma.account.upsert({
      where: { id },
      update: { userId: user.id, householdId, deletedAt: null },
      create: { id, name: id, userId: user.id, householdId, createdAt: new Date(createdAt) }
    });
  }

  const other = await prisma.user.upsert({
    where: { email: "saving-goals-other@example.com" },
    update: {},
    create: { id: OTHER_USER_ID, email: "saving-goals-other@example.com", password: "hashed" }
  });
  const otherHouseholdId = await ensureTestHousehold(prisma, other.id, "Other Household");
  await prisma.account.upsert({
    where: { id: OTHER_ACCOUNT_ID },
    update: { userId: other.id, householdId: otherHouseholdId, deletedAt: null },
    create: { id: OTHER_ACCOUNT_ID, name: OTHER_ACCOUNT_ID, userId: other.id, householdId: otherHouseholdId }
  });

  await clean();
  await prisma.category.deleteMany({ where: { householdId } });
  const mk = async (name: string) => (await prisma.category.create({ data: { name, userId: user.id, householdId } })).id;
  savingsId = await mk("Savings");
  sparenId = await mk(" Sparen ");
  foodId = await mk("SG Food");
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // A test may move the clock: every test starts on NOW again.
  vi.setSystemTime(NOW);
  await clean();
});

afterAll(async () => {
  vi.useRealTimers();
  if (prisma) {
    await clean();
    await prisma.category.deleteMany({ where: { householdId } });
    await prisma.account.deleteMany({ where: { id: { in: [...ACCOUNT_IDS, OTHER_ACCOUNT_ID] } } });
    await cleanupTestHousehold(prisma, TEST_USER_ID);
    await cleanupTestHousehold(prisma, OTHER_USER_ID);
    await prisma.user.deleteMany({ where: { id: { in: [TEST_USER_ID, OTHER_USER_ID] } } });
    await prisma.$disconnect();
  }
});

describe("GET /api/saving-plan", () => {
  it("lists only Budget rows without a category as goals, across all accounts, and no savings balance", async () => {
    await goal("Urlaub", 120_000);
    await goal("Rad", 80_000, { accountId: SECOND_ACCOUNT_ID, month: 3, year: 2048 });
    await goal("Küche", null, { month: null, year: null });
    const categoryBudgetId = (
      await prisma.budget.create({
        data: { accountId: ACCOUNT_ID, categoryId: foodId, title: "", month: 11, year: 2047, amountCents: 50_000 }
      })
    ).id;

    const data = await plan();
    expect(data.goals.map((g) => g.title)).toEqual(["Urlaub", "Rad"]);
    expect(data.undatedGoals.map((g) => g.title)).toEqual(["Küche"]);
    const all = [...data.goals, ...data.undatedGoals];
    expect(all.some((g) => g.id === categoryBudgetId)).toBe(false);
    // Only plan figures: no pool, no "available".
    expect(Object.keys(data.totals).sort()).toEqual(["monthlyRateCents", "totalTargetCents"]);
    expect(data.totals.totalTargetCents).toBe(200_000);
  });

  it("is not moved by savings bookings: saving is money that left the month", async () => {
    const id = await goal("Urlaub", 120_000, { monthlyRateCents: 40_000 });
    const before = await plan();
    await booking(-100_000, savingsId);
    await booking(-30_000, sparenId, { accountId: SECOND_ACCOUNT_ID, savingGoalId: id });
    await booking(20_000, savingsId);

    const after = await plan();
    expect(after.totals).toEqual(before.totals);
    // A linked savings booking is a transfer, not spending on the goal.
    expect(after.goals[0].transactionSpentCents).toBe(0);
  });

  it("counts linked expenses minus linked refunds, without deleted bookings, never below 0", async () => {
    const id = await goal("Urlaub", 120_000);
    await booking(-30_000, foodId, { savingGoalId: id });
    await booking(-5_000, null, { savingGoalId: id, accountId: SECOND_ACCOUNT_ID });
    await booking(2_000, foodId, { savingGoalId: id });
    await booking(-99_900, foodId, { savingGoalId: id, deletedAt: NOW });
    expect((await goalDto(id)).transactionSpentCents).toBe(33_000);

    const refundOnly = await goal("Erstattung", 10_000);
    await booking(5_000, foodId, { savingGoalId: refundOnly });
    expect((await goalDto(refundOnly)).transactionSpentCents).toBe(0);
  });

  it("rejects a title consisting only of whitespace with 400", async () => {
    expect((await createGoal({ title: "   " })).status).toBe(400);
  });
});

describe("monthly rate", () => {
  it("is stored with a dated goal (0 allowed), never with an undated one", async () => {
    const dated = await createGoal({ title: "Urlaub", targetMonth: 7, targetYear: 2048, amountCents: 160_000, monthlyRateCents: 20_000 });
    expect(dated.status).toBe(201);
    expect(((await dated.json()) as { monthlyRateCents: number | null }).monthlyRateCents).toBe(20_000);

    const zero = await createGoal({ title: "Schon da", targetMonth: 7, targetYear: 2048, amountCents: 50_000, monthlyRateCents: 0 });
    expect(((await zero.json()) as { monthlyRateCents: number | null }).monthlyRateCents).toBe(0);

    const undated = await createGoal({ title: "Idee", monthlyRateCents: 5_000 });
    expect(((await undated.json()) as { monthlyRateCents: number | null }).monthlyRateCents).toBeNull();

    expect((await createGoal({ title: "Minus", targetMonth: 7, targetYear: 2048, monthlyRateCents: -1 })).status).toBe(400);
    expect((await createGoal({ title: "Bruch", targetMonth: 7, targetYear: 2048, monthlyRateCents: 1.5 })).status).toBe(400);
  });

  it("is changed and cleared by PATCH, and cleared when the date is removed", async () => {
    const id = await goal("Urlaub", 120_000);
    expect((await patchGoal(id, { monthlyRateCents: 30_000 })).status).toBe(200);
    expect((await goalDto(id)).monthlyRateCents).toBe(30_000);

    // Editing something else leaves the rate alone.
    await patchGoal(id, { title: "Sommerurlaub" });
    expect((await goalDto(id)).monthlyRateCents).toBe(30_000);

    await patchGoal(id, { monthlyRateCents: null });
    expect((await goalDto(id)).monthlyRateCents).toBeNull();

    await patchGoal(id, { monthlyRateCents: 30_000 });
    await patchGoal(id, { targetMonth: null, targetYear: null });
    const row = await prisma.budget.findUnique({ where: { id } });
    expect(row?.monthlyRateCents).toBeNull();

    // An undated goal does not take a rate.
    await patchGoal(id, { monthlyRateCents: 10_000 });
    expect((await prisma.budget.findUnique({ where: { id } }))?.monthlyRateCents).toBeNull();
  });

  it("sums the rates of open dated goals whose date is this Berlin month or later", async () => {
    await goal("Dezember", 120_000, { monthlyRateCents: 40_000 });
    await goal("November", 10_000, { month: 11, monthlyRateCents: 10_000 });
    await goal("Oktober vorbei", 50_000, { month: 10, monthlyRateCents: 25_000 });
    await goal("Erledigt", 60_000, { monthlyRateCents: 7_000, completedAt: OCTOBER, spentCents: 60_000 });
    await goal("Ohne Rate", 30_000);
    await goal("Idee", 5_000, { month: null, year: null, monthlyRateCents: 999 });

    const { totals } = await plan();
    // 400 + 100; October is over, completed and undated goals are out.
    expect(totals.monthlyRateCents).toBe(50_000);
    // Targets of the open dated goals, the past one included.
    expect(totals.totalTargetCents).toBe(210_000);
  });

  it("suggests the target spread over the months left, the current month included", async () => {
    const december = await goal("Dezember", 120_000);
    const january = await goal("Januar", 100_000, { month: 1, year: 2048 });
    const past = await goal("Vorbei", 50_000, { month: 9 });
    const noAmount = await goal("Ohne Betrag", null);

    // A December deadline leaves November only: the money is needed by December.
    expect((await goalDto(december)).suggestedMonthlyRateCents).toBe(120_000);
    // A January deadline leaves November and December: 1000 / 2.
    expect((await goalDto(january)).suggestedMonthlyRateCents).toBe(50_000);
    expect((await goalDto(past)).suggestedMonthlyRateCents).toBe(50_000);
    expect((await goalDto(noAmount)).suggestedMonthlyRateCents).toBeNull();

    const odd = await goal("Ungerade", 100_001, { month: 1, year: 2048 });
    expect((await goalDto(odd)).suggestedMonthlyRateCents).toBe(50_001);
  });

  it("switches the month at midnight in Berlin", async () => {
    const id = await goal("Dezember", 120_000, { monthlyRateCents: 40_000 });
    await goal("Oktober", 30_000, { month: 10, monthlyRateCents: 5_000 });

    // 31 Oct 23:30 in Berlin: still October — October and November are left.
    vi.setSystemTime(new Date("2047-10-31T22:30:00.000Z"));
    expect((await goalDto(id)).suggestedMonthlyRateCents).toBe(60_000);
    expect((await plan()).totals.monthlyRateCents).toBe(45_000);

    // 1 Nov 00:30 in Berlin (31 Oct 23:30 UTC): November — one month, October is over.
    vi.setSystemTime(new Date("2047-10-31T23:30:00.000Z"));
    expect((await goalDto(id)).suggestedMonthlyRateCents).toBe(120_000);
    expect((await plan()).totals.monthlyRateCents).toBe(40_000);
  });
});

describe("payments from savings", () => {
  it("are recorded on the goal at 12:00 Berlin of their day and book nothing", async () => {
    const id = await goal("Urlaub", 200_000);
    await booking(-10_000, foodId);
    const bookingsBefore = await liveBookingCount();

    const res = await addPayment(id, { amountCents: 50_000, day: "2047-11-03", note: "  Anzahlung Hotel " });
    expect(res.status).toBe(201);
    const created = (await res.json()) as Payment;
    // 3 Nov is winter time (UTC+1): noon Berlin is 11:00 UTC.
    expect(created.occurredAt).toBe("2047-11-03T11:00:00.000Z");
    expect(created.note).toBe("Anzahlung Hotel");

    // Without a day: today in Berlin; an empty note is no note.
    const today = (await (await addPayment(id, { amountCents: 70_000, note: "  " })).json()) as Payment;
    expect(today.occurredAt).toBe("2047-11-19T11:00:00.000Z");
    expect(today.note).toBeNull();

    expect(await liveBookingCount()).toBe(bookingsBefore);
    const dto = await goalDto(id);
    expect(dto.savingsPaidCents).toBe(120_000);
    expect(dto.savingsPayments.map((p) => p.amountCents)).toEqual([70_000, 50_000]);
    expect(dto.transactionSpentCents).toBe(0);
  });

  it("take undated goals too", async () => {
    const id = await goal("Couch", null, { month: null, year: null });
    expect((await addPayment(id, { amountCents: 89_900 })).status).toBe(201);
    expect((await goalDto(id)).savingsPaidCents).toBe(89_900);
  });

  it("reject an invalid body with 400", async () => {
    const id = await goal("Urlaub", 200_000);
    for (const body of [
      { amountCents: 0 },
      { amountCents: -100 },
      { amountCents: 12.5 },
      { amountCents: 2_147_483_648 },
      { amountCents: 100, day: "2047-02-30" },
      { amountCents: 100, day: "19.11.2047" },
      { amountCents: 100, note: "x".repeat(201) },
      null
    ]) {
      expect((await addPayment(id, body)).status).toBe(400);
    }
    expect(await prisma.savingGoalPayment.count({ where: { goalId: id } })).toBe(0);
  });

  it("are refused for a category budget (404), another household's goal (403) and a completed goal (409)", async () => {
    const categoryBudget = await prisma.budget.create({
      data: { accountId: ACCOUNT_ID, categoryId: foodId, title: "", month: 11, year: 2047, amountCents: 1 }
    });
    expect((await addPayment(categoryBudget.id, { amountCents: 100 })).status).toBe(404);
    expect((await addPayment("does-not-exist", { amountCents: 100 })).status).toBe(404);

    const foreign = await prisma.budget.create({
      data: { accountId: OTHER_ACCOUNT_ID, categoryId: null, title: "Fremd", month: 12, year: 2047, amountCents: 1 }
    });
    expect((await addPayment(foreign.id, { amountCents: 100 })).status).toBe(403);

    const done = await goal("Fertig", 100, { completedAt: OCTOBER, spentCents: 100 });
    expect((await addPayment(done, { amountCents: 100 })).status).toBe(409);
  });

  it("can be removed again — only on their own, active goal", async () => {
    const id = await goal("Urlaub", 200_000);
    const otherGoal = await goal("Rad", 80_000);
    const payment = (await (await addPayment(id, { amountCents: 50_000 })).json()) as Payment;

    expect((await removePayment(otherGoal, payment.id)).status).toBe(404);

    await prisma.budget.update({ where: { id }, data: { completedAt: NOW } });
    expect((await removePayment(id, payment.id)).status).toBe(409);
    await prisma.budget.update({ where: { id }, data: { completedAt: null } });

    expect((await removePayment(id, payment.id)).status).toBe(200);
    expect((await goalDto(id)).savingsPaidCents).toBe(0);
    expect((await removePayment(id, payment.id)).status).toBe(404);
  });
});

describe("completing a goal", () => {
  it("books nothing and fixes the cost at linked bookings plus payments plus the last payment", async () => {
    const id = await goal("Urlaub", 200_000, { monthlyRateCents: 40_000 });
    await booking(-30_000, foodId, { savingGoalId: id });
    await addPayment(id, { amountCents: 150_000, day: "2047-07-01" });
    const bookingsBefore = await liveBookingCount();

    const res = await complete(id, { savingsPayment: { amountCents: 25_000, note: "Rest" } });
    expect(res.status).toBe(200);
    const row = (await res.json()) as { completedAt: string | null; spentCents: number };
    expect(row.completedAt).toBe(NOW.toISOString());
    expect(row.spentCents).toBe(205_000);

    expect(await liveBookingCount()).toBe(bookingsBefore);
    const payments = await prisma.savingGoalPayment.findMany({ where: { goalId: id }, orderBy: { occurredAt: "asc" } });
    expect(payments.map((p) => [p.amountCents, p.occurredAt.toISOString(), p.note])).toEqual([
      [150_000, "2047-07-01T10:00:00.000Z", null],
      [25_000, "2047-11-19T11:00:00.000Z", "Rest"]
    ]);

    const data = await plan();
    expect(data.goals).toEqual([]);
    expect(data.completedGoals.map((g) => g.spentCents)).toEqual([205_000]);
    expect(data.totals.monthlyRateCents).toBe(0);
  });

  it("works without a body", async () => {
    const id = await goal("Rad", 80_000);
    await booking(-79_900, foodId, { savingGoalId: id });
    const { POST } = await import("../app/api/saving-plan/[id]/complete/route");
    const res = await POST(new Request(`http://localhost/api/saving-plan/${id}/complete`, { method: "POST" }), ctx(id));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { spentCents: number }).spentCents).toBe(79_900);
  });

  it("answers 400 for an invalid body and changes nothing", async () => {
    const id = await goal("Rad", 80_000);
    expect((await complete(id, { savingsPayment: { amountCents: 0 } })).status).toBe(400);
    expect((await complete(id, "nonsense")).status).toBe(400);
    const row = await prisma.budget.findUnique({ where: { id } });
    expect(row?.completedAt).toBeNull();
    expect(await prisma.savingGoalPayment.count({ where: { goalId: id } })).toBe(0);
  });

  it("answers 409 the second time and lets only one of two simultaneous completions through", async () => {
    const id = await goal("Rad", 80_000);
    expect((await complete(id, {})).status).toBe(200);
    expect((await complete(id, { savingsPayment: { amountCents: 100 } })).status).toBe(409);
    expect(await prisma.savingGoalPayment.count({ where: { goalId: id } })).toBe(0);

    const both = await goal("Doppelklick", 50_000);
    const statuses = (
      await Promise.all([
        complete(both, { savingsPayment: { amountCents: 50_000 } }),
        complete(both, { savingsPayment: { amountCents: 50_000 } })
      ])
    )
      .map((res) => res.status)
      .sort();
    expect(statuses).toEqual([200, 409]);
    expect(await prisma.savingGoalPayment.count({ where: { goalId: both } })).toBe(1);
    expect((await prisma.budget.findUnique({ where: { id: both } }))?.spentCents).toBe(50_000);
  });
});

describe("reopening a goal", () => {
  it("clears completedAt and spentCents and keeps the payments", async () => {
    const id = await goal("Urlaub", 200_000);
    await complete(id, { savingsPayment: { amountCents: 180_000 } });

    const res = await reopen(id);
    expect(res.status).toBe(200);
    const row = await prisma.budget.findUnique({ where: { id } });
    expect(row?.completedAt).toBeNull();
    expect(row?.spentCents).toBeNull();
    expect((await goalDto(id)).savingsPaidCents).toBe(180_000);
  });

  it("deletes the withdrawal a legacy completion booked, and copes with one already deleted", async () => {
    const withdrawalId = await booking(60_000, savingsId);
    const legacy = await goal("Alt", 60_000, {
      completedAt: OCTOBER,
      spentCents: 60_000,
      withdrawalTransactionId: withdrawalId
    });
    await reopen(legacy);
    expect((await prisma.transaction.findUnique({ where: { id: withdrawalId } }))?.deletedAt).not.toBeNull();
    expect((await prisma.budget.findUnique({ where: { id: legacy } }))?.withdrawalTransactionId).toBeNull();

    const gone = await booking(10_000, savingsId, { deletedAt: OCTOBER });
    const older = await goal("Älter", 10_000, {
      completedAt: OCTOBER,
      spentCents: 10_000,
      withdrawalTransactionId: gone,
      reservedCents: 10_000
    });
    expect((await reopen(older)).status).toBe(200);
    const row = await prisma.budget.findUnique({ where: { id: older } });
    expect(row?.reservedCents).toBeNull();
    expect(row?.completedAt).toBeNull();
  });
});

describe("a deleted goal", () => {
  it("is 404 for reading, editing, deleting, payments, completing and reopening", async () => {
    const id = await goal("Weg", 10_000, { deletedAt: OCTOBER });
    const routes = await import("../app/api/saving-plan/[id]/route");
    const url = `http://localhost/api/saving-plan/${id}`;
    expect((await routes.GET(jsonReq(url, "GET"), ctx(id))).status).toBe(404);
    expect((await patchGoal(id, { title: "Neu" })).status).toBe(404);
    expect((await routes.DELETE(jsonReq(url, "DELETE"), ctx(id))).status).toBe(404);
    expect((await addPayment(id, { amountCents: 100 })).status).toBe(404);
    expect((await complete(id, {})).status).toBe(404);
    expect((await reopen(id)).status).toBe(404);
  });
});
