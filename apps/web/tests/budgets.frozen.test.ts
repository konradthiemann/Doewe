import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { sendPushToUser } from "../lib/push";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Months that are over keep the budgets they had (docs/calculations/06-budgets.md):
// - a budget alert concerns the running month only; correcting an old booking
//   neither pushes nor freezes anything,
// - merging a category (or deleting it with a fallback) carries its frozen
//   budgets over to the category that takes its bookings,
// - every write that changes what budgets are computed from first freezes the
//   completed months that have no snapshot yet (freezePastMonths).
// Clock: 19 Nov 2043, 11:00 in Berlin. Own user, household and account; no
// standing orders, so the booking job of other files never touches them.
vi.mock("../lib/push", () => ({ sendPushToUser: vi.fn(async () => 1) }));

const TEST_USER_ID = "test-user-budgets-frozen";
const ACCOUNT_ID = "acc_budgets_frozen";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

const NOW = new Date("2043-11-19T10:00:00.000Z");
const push = vi.mocked(sendPushToUser);

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;

const jsonReq = (url: string, method: string, body: unknown) =>
  new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function category(name: string): Promise<string> {
  const row = await prisma.category.upsert({
    where: { householdId_name: { householdId, name } },
    update: { deletedAt: null },
    create: { name, userId: TEST_USER_ID, householdId }
  });
  return row.id;
}

async function booking(categoryId: string, amountCents: number, occurredAt: string, extra: object = {}) {
  return prisma.transaction.create({
    data: { accountId: ACCOUNT_ID, categoryId, amountCents, description: "BF booking", occurredAt: new Date(occurredAt), ...extra }
  });
}

async function createPlan(categoryId: string, amountCents: number, period: "MONTHLY" | "YEARLY" = "MONTHLY") {
  return prisma.categoryBudgetPlan.create({ data: { householdId, categoryId, period, amountCents } });
}

async function snapshots(): Promise<Array<[string, Record<string, number>]>> {
  const rows = await prisma.budgetMonthSnapshot.findMany({
    where: { householdId },
    orderBy: [{ year: "asc" }, { month: "asc" }]
  });
  return rows.map((row) => [`${row.year}-${String(row.month).padStart(2, "0")}`, row.budgets as Record<string, number>]);
}

async function budgetsOf(year: number, month: number) {
  const { loadEffectiveCategoryBudgets } = await import("../lib/categoryBudgets");
  return loadEffectiveCategoryBudgets({ householdId, year, month });
}

async function clean() {
  await prisma.budgetAlertLog.deleteMany({ where: { householdId } });
  await prisma.budgetMonthSnapshot.deleteMany({ where: { householdId } });
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
  await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.budget.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.category.deleteMany({ where: { householdId } });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  await prisma.user.upsert({
    where: { email: "budgets-frozen@example.com" },
    update: { notifyBudgetAlerts: true, locale: "de" },
    create: { id: TEST_USER_ID, email: "budgets-frozen@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, TEST_USER_ID);
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: TEST_USER_ID, householdId, deletedAt: null },
    create: { id: ACCOUNT_ID, name: ACCOUNT_ID, userId: TEST_USER_ID, householdId }
  });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

beforeEach(async () => {
  vi.setSystemTime(NOW);
  await clean();
  push.mockClear();
});

afterAll(async () => {
  vi.useRealTimers();
  await clean();
  await prisma.account.deleteMany({ where: { id: ACCOUNT_ID } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.$disconnect();
});

describe("budget alerts: a booking in a month long over", () => {
  it("correcting the description of a March 2042 booking pushes nothing and freezes nothing", async () => {
    const foodId = await category("BF Lebensmittel");
    await createPlan(foodId, 40_000);
    const old = await booking(foodId, -45_000, "2042-03-10T11:00:00.000Z", { description: "Wocheneinkuaf" });

    const { PATCH } = await import("../app/api/transactions/[id]/route");
    const res = await PATCH(
      jsonReq(`http://localhost/api/transactions/${old.id}`, "PATCH", {
        accountId: ACCOUNT_ID,
        categoryId: foodId,
        amountCents: -45_000,
        description: "Wocheneinkauf",
        occurredAt: "2042-03-10"
      }),
      { params: { id: old.id } }
    );
    expect(res.status).toBe(200);

    expect(push).not.toHaveBeenCalled();
    expect(await prisma.budgetAlertLog.count({ where: { householdId } })).toBe(0);
    expect(await snapshots()).toEqual([]);
  });
});

describe("frozen budgets: merging a category", () => {
  async function merge(sourceId: string, targetId: string) {
    const { PATCH } = await import("../app/api/categories/[id]/route");
    const res = await PATCH(
      jsonReq(`http://localhost/api/categories/${sourceId}`, "PATCH", { mergeIntoCategoryId: targetId }),
      { params: { id: sourceId } }
    );
    expect(res.status).toBe(200);
  }

  it("moves the source's frozen budget to a target without one", async () => {
    const aId = await category("BF Drogerie");
    const bId = await category("BF Haushalt");
    await createPlan(aId, 10_000);
    await booking(aId, -6_000, "2043-10-10T10:00:00.000Z");
    // October is read (and frozen) while A still exists.
    expect(await budgetsOf(2043, 10)).toEqual({ [aId]: 10_000 });

    await merge(aId, bId);

    // The plan and the 60 € booking now belong to B — in November and in October.
    expect(await budgetsOf(2043, 11)).toEqual({ [bId]: 10_000 });
    expect(await budgetsOf(2043, 10)).toEqual({ [bId]: 10_000 });
    expect((await snapshots()).find(([month]) => month === "2043-10")?.[1]).toEqual({ [bId]: 10_000 });
  });

  it("adds the source's frozen budget to the target's own", async () => {
    const aId = await category("BF Drogerie");
    const bId = await category("BF Haushalt");
    await createPlan(aId, 10_000);
    await createPlan(bId, 5_000);
    await booking(aId, -6_000, "2043-10-10T10:00:00.000Z");
    await booking(bId, -4_000, "2043-10-11T10:00:00.000Z");
    expect(await budgetsOf(2043, 10)).toEqual({ [aId]: 10_000, [bId]: 5_000 });

    await merge(aId, bId);

    // October's 100 € of spend sits under B now, against 100 + 50 €.
    expect(await budgetsOf(2043, 10)).toEqual({ [bId]: 15_000 });
    // Live, B keeps its own plan (the source plan is dropped).
    expect(await budgetsOf(2043, 11)).toEqual({ [bId]: 5_000 });
  });

  it("freezes a month nobody opened before the merge, then carries it over", async () => {
    const aId = await category("BF Drogerie");
    const bId = await category("BF Haushalt");
    await createPlan(aId, 10_000);
    await createPlan(bId, 5_000);
    await booking(aId, -6_000, "2043-09-10T10:00:00.000Z");

    await merge(aId, bId);

    // Without freezing first, September would be computed from B's plan alone.
    expect(await budgetsOf(2043, 9)).toEqual({ [bId]: 15_000 });
    expect(await budgetsOf(2043, 10)).toEqual({ [bId]: 15_000 });
  });

  it("does the same when the category is deleted with a fallback", async () => {
    const aId = await category("BF Drogerie");
    const bId = await category("BF Haushalt");
    await createPlan(aId, 10_000);
    await booking(aId, -6_000, "2043-10-10T10:00:00.000Z");
    expect(await budgetsOf(2043, 10)).toEqual({ [aId]: 10_000 });

    const { DELETE } = await import("../app/api/categories/[id]/route");
    const res = await DELETE(
      jsonReq(`http://localhost/api/categories/${aId}`, "DELETE", { fallbackCategoryId: bId }),
      { params: { id: aId } }
    );
    expect(res.status).toBe(200);
    expect(await budgetsOf(2043, 10)).toEqual({ [bId]: 10_000 });
  });
});

describe("freezePastMonths", () => {
  it("freezes every completed month from the first booking on, with today's figures", async () => {
    const foodId = await category("BF Lebensmittel");
    await createPlan(foodId, 40_000);
    await booking(foodId, -1_000, "2042-11-10T11:00:00.000Z");

    const { freezePastMonths } = await import("../lib/categoryBudgets");
    await freezePastMonths(householdId);

    const rows = await snapshots();
    // November 2042 through October 2043; not the current month.
    expect(rows.map(([month]) => month)).toEqual([
      "2042-11", "2042-12", "2043-01", "2043-02", "2043-03", "2043-04",
      "2043-05", "2043-06", "2043-07", "2043-08", "2043-09", "2043-10"
    ]);
    expect(rows.every(([, budgets]) => budgets[foodId] === 40_000)).toBe(true);
  });

  it("starts at the Berlin month of the earliest booking and ignores deleted ones", async () => {
    const foodId = await category("BF Lebensmittel");
    // 1 Aug 2043 00:30 in Berlin — still 31 Jul in UTC
    await booking(foodId, -1_000, "2043-07-31T22:30:00.000Z");
    // deleted: does not count as the earliest booking
    await booking(foodId, -1_000, "2041-01-10T11:00:00.000Z", { deletedAt: new Date("2041-01-11T11:00:00.000Z") });

    const { freezePastMonths } = await import("../lib/categoryBudgets");
    await freezePastMonths(householdId);

    expect((await snapshots()).map(([month]) => month)).toEqual(["2043-08", "2043-09", "2043-10"]);
  });

  it("keeps a month that already has a snapshot", async () => {
    const foodId = await category("BF Lebensmittel");
    await createPlan(foodId, 40_000);
    await booking(foodId, -1_000, "2043-08-10T10:00:00.000Z");
    await prisma.budgetMonthSnapshot.create({ data: { householdId, year: 2043, month: 9, budgets: { [foodId]: 1 } } });

    const { freezePastMonths } = await import("../lib/categoryBudgets");
    await freezePastMonths(householdId);

    expect(await snapshots()).toEqual([
      ["2043-08", { [foodId]: 40_000 }],
      ["2043-09", { [foodId]: 1 }],
      ["2043-10", { [foodId]: 40_000 }]
    ]);
  });

  it("freezes a YEARLY plan's share per month like the year view does", async () => {
    const foodId = await category("BF Lebensmittel");
    // No standing orders: the yearly amount is spread evenly.
    await createPlan(foodId, 120_000, "YEARLY");
    await booking(foodId, -1_000, "2043-09-10T10:00:00.000Z");

    const { freezePastMonths, loadEffectiveCategoryBudgetsForYear } = await import("../lib/categoryBudgets");
    await freezePastMonths(householdId);

    expect(await snapshots()).toEqual([
      ["2043-09", { [foodId]: 10_000 }],
      ["2043-10", { [foodId]: 10_000 }]
    ]);
    expect((await loadEffectiveCategoryBudgetsForYear({ householdId, year: 2043 }))[foodId].slice(8, 11)).toEqual([
      10_000, 10_000, 10_000
    ]);
  });

  it("does nothing without bookings, or when the first booking is in the current month", async () => {
    const foodId = await category("BF Lebensmittel");
    await createPlan(foodId, 40_000);
    const { freezePastMonths } = await import("../lib/categoryBudgets");

    await freezePastMonths(householdId);
    expect(await snapshots()).toEqual([]);

    await booking(foodId, -1_000, "2043-11-05T10:00:00.000Z");
    await freezePastMonths(householdId);
    expect(await snapshots()).toEqual([]);
  });

  it("freezes several years at once and leaves them alone on the next call", async () => {
    const foodId = await category("BF Lebensmittel");
    await createPlan(foodId, 40_000);
    await booking(foodId, -1_000, "2041-03-10T10:00:00.000Z");

    const { freezePastMonths } = await import("../lib/categoryBudgets");
    await freezePastMonths(householdId);
    // March 2041 through October 2043: 32 months.
    const first = await prisma.budgetMonthSnapshot.findMany({
      where: { householdId },
      select: { id: true, createdAt: true },
      orderBy: { id: "asc" }
    });
    expect(first).toHaveLength(32);

    // A later plan change must not reach them, and the next call writes nothing.
    await prisma.categoryBudgetPlan.updateMany({ where: { householdId }, data: { amountCents: 1 } });
    await freezePastMonths(householdId);
    expect(
      await prisma.budgetMonthSnapshot.findMany({
        where: { householdId },
        select: { id: true, createdAt: true },
        orderBy: { id: "asc" }
      })
    ).toEqual(first);
    expect((await snapshots()).every(([, budgets]) => budgets[foodId] === 40_000)).toBe(true);
  });

  it("is safe when called several times at the same moment", async () => {
    const foodId = await category("BF Lebensmittel");
    await createPlan(foodId, 40_000);
    await booking(foodId, -1_000, "2042-01-10T11:00:00.000Z");

    const { freezePastMonths } = await import("../lib/categoryBudgets");
    await expect(Promise.all([1, 2, 3, 4].map(() => freezePastMonths(householdId)))).resolves.toBeDefined();
    // January 2042 through October 2043, each month once.
    expect(await prisma.budgetMonthSnapshot.count({ where: { householdId } })).toBe(22);
  });
});

describe("writes that change budgets freeze the months that are over first", () => {
  it("editing a plan before anyone opened the new month keeps October's old amount", async () => {
    const foodId = await category("BF Lebensmittel");
    const plan = await createPlan(foodId, 40_000);
    await booking(foodId, -10_000, "2043-03-10T10:00:00.000Z");
    await booking(foodId, -30_000, "2043-10-10T10:00:00.000Z");

    const { PATCH } = await import("../app/api/budget-plans/[id]/route");
    const res = await PATCH(jsonReq(`http://localhost/api/budget-plans/${plan.id}`, "PATCH", { amountCents: 60_000 }), {
      params: { id: plan.id }
    });
    expect(res.status).toBe(200);

    expect(await budgetsOf(2043, 10)).toEqual({ [foodId]: 40_000 });
    expect(await budgetsOf(2043, 11)).toEqual({ [foodId]: 60_000 });
    // A month nobody has opened since it ended is frozen too, with the old amount.
    expect(await budgetsOf(2043, 3)).toEqual({ [foodId]: 40_000 });
  });

  it("deleting a plan keeps it in the months that are over", async () => {
    const foodId = await category("BF Lebensmittel");
    const plan = await createPlan(foodId, 40_000);
    await booking(foodId, -30_000, "2043-06-10T10:00:00.000Z");

    const { DELETE } = await import("../app/api/budget-plans/[id]/route");
    const res = await DELETE(new Request(`http://localhost/api/budget-plans/${plan.id}`, { method: "DELETE" }), {
      params: { id: plan.id }
    });
    expect(res.status).toBe(204);

    expect(await budgetsOf(2043, 6)).toEqual({ [foodId]: 40_000 });
    expect(await budgetsOf(2043, 10)).toEqual({ [foodId]: 40_000 });
    expect(await budgetsOf(2043, 11)).toEqual({});
  });

  it("creating a plan does not give the months that are over a budget", async () => {
    const foodId = await category("BF Lebensmittel");
    await booking(foodId, -30_000, "2043-10-10T10:00:00.000Z");

    const { POST } = await import("../app/api/budget-plans/route");
    const res = await POST(
      jsonReq("http://localhost/api/budget-plans", "POST", { categoryId: foodId, period: "MONTHLY", amountCents: 40_000 })
    );
    expect(res.status).toBe(201);

    expect(await budgetsOf(2043, 10)).toEqual({});
    expect(await budgetsOf(2043, 11)).toEqual({ [foodId]: 40_000 });
  });

  it("creating a per-month budget freezes the months that are over first", async () => {
    const foodId = await category("BF Lebensmittel");
    await booking(foodId, -30_000, "2043-09-10T10:00:00.000Z");

    const { POST } = await import("../app/api/budgets/route");
    const res = await POST(
      jsonReq("http://localhost/api/budgets", "POST", {
        accountId: ACCOUNT_ID,
        categoryId: foodId,
        month: 10,
        year: 2043,
        amountCents: 20_000
      })
    );
    expect(res.status).toBe(201);

    // October was over before the row was written; September as well.
    expect(await budgetsOf(2043, 9)).toEqual({});
    expect(await budgetsOf(2043, 10)).toEqual({});
  });
});
