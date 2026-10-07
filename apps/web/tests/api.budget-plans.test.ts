import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Integration tests for /api/budget-plans (GET, POST) and /api/budget-plans/[id]
// (PATCH, DELETE). Fixtures use year 2037 with anchors in the future so the cron
// test (which books all due recurring items globally) is not disturbed.
const TEST_USER_ID = "test-user-budget-plans";
const OTHER_USER_ID = "test-user-budget-plans-other";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

const YEAR = 2037;
const ACCOUNT_ID = "acc_budget_plans";
const OTHER_ACCOUNT_ID = "acc_budget_plans_other";

type PlanDto = {
  id: string;
  categoryId: string;
  period: "MONTHLY" | "YEARLY";
  amountCents: number;
  createdAt: string;
  updatedAt: string;
};
type PlanListItem = PlanDto & { categoryName: string; monthlyCents: number[] };
type ListResponse = {
  year: number;
  availablePerMonthCents: number[];
  plans: PlanListItem[];
  budgetableCategories: Array<{ id: string; name: string; planId: string | null }>;
};

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let otherHouseholdId: string;
let foodId: string;
let hobbyId: string;
let deletedCatId: string;
let savingsId: string;
let sparenId: string;
let salaryId: string;
let foreignCatId: string;

const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);

const jsonReq = (method: string, body?: unknown, url = "http://localhost/api/budget-plans") =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

async function post(body: unknown): Promise<Response> {
  const { POST } = await import("../app/api/budget-plans/route");
  return POST(jsonReq("POST", body));
}
async function patch(id: string, body: unknown): Promise<Response> {
  const { PATCH } = await import("../app/api/budget-plans/[id]/route");
  return PATCH(jsonReq("PATCH", body, `http://localhost/api/budget-plans/${id}`), { params: { id } });
}
async function del(id: string): Promise<Response> {
  const { DELETE } = await import("../app/api/budget-plans/[id]/route");
  return DELETE(jsonReq("DELETE", undefined, `http://localhost/api/budget-plans/${id}`), { params: { id } });
}
async function list(query = `year=${YEAR}`): Promise<Response> {
  const { GET } = await import("../app/api/budget-plans/route");
  return GET(new Request(`http://localhost/api/budget-plans?${query}`));
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "budget-plans-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "budget-plans-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id, "Budget Plans Household");
  const other = await prisma.user.upsert({
    where: { email: "budget-plans-other@example.com" },
    update: {},
    create: { id: OTHER_USER_ID, email: "budget-plans-other@example.com", password: "hashed" }
  });
  otherHouseholdId = await ensureTestHousehold(prisma, other.id, "Budget Plans Other Household");

  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: user.id, householdId },
    create: { id: ACCOUNT_ID, name: "Budget Plans Account", userId: user.id, householdId }
  });
  await prisma.account.upsert({
    where: { id: OTHER_ACCOUNT_ID },
    update: { userId: other.id, householdId: otherHouseholdId },
    create: { id: OTHER_ACCOUNT_ID, name: "Other Account", userId: other.id, householdId: otherHouseholdId }
  });

  const mk = async (name: string, extra: { isIncome?: boolean; deletedAt?: Date | null } = {}) =>
    (
      await prisma.category.upsert({
        where: { householdId_name: { householdId, name } },
        update: { isIncome: extra.isIncome ?? false, deletedAt: extra.deletedAt ?? null },
        create: { name, userId: user.id, householdId, ...extra }
      })
    ).id;
  foodId = await mk("BP Food");
  hobbyId = await mk("BP Hobby");
  deletedCatId = await mk("BP Deleted", { deletedAt: new Date(2030, 0, 1) });
  savingsId = await mk("Savings");
  sparenId = await mk("Sparen");
  salaryId = await mk("BP Salary", { isIncome: true });
  foreignCatId = (
    await prisma.category.upsert({
      where: { householdId_name: { householdId: otherHouseholdId, name: "BP Foreign" } },
      update: {},
      create: { name: "BP Foreign", userId: other.id, householdId: otherHouseholdId }
    })
  ).id;

  // Recurring fixtures in 2037: salary +3000, rent -1000 monthly, insurance
  // -2000 once a year in January => smoothed available (income 36000 / 12 = 3000
  // per month, only fixed costs vary): Jan 0, Feb-Dec 2000 EUR.
  await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: ACCOUNT_ID } } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  const anchor = new Date(Date.UTC(YEAR, 0, 1, 12));
  await prisma.recurringTransaction.createMany({
    data: [
      { accountId: ACCOUNT_ID, categoryId: salaryId, amountCents: 300000, description: "BP Gehalt", frequency: "MONTHLY", intervalMonths: 1, dayOfMonth: 1, nextOccurrence: anchor },
      { accountId: ACCOUNT_ID, categoryId: foodId, amountCents: -100000, description: "BP Miete", frequency: "MONTHLY", intervalMonths: 1, dayOfMonth: 1, nextOccurrence: anchor },
      { accountId: ACCOUNT_ID, categoryId: hobbyId, amountCents: -200000, description: "BP Versicherung", frequency: "MONTHLY", intervalMonths: 12, dayOfMonth: 1, nextOccurrence: anchor }
    ]
  });
});

beforeEach(async () => {
  process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId: { in: [householdId, otherHouseholdId] } } });
});

afterAll(async () => {
  if (!prisma) return;
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId: { in: [householdId, otherHouseholdId] } } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.category.deleteMany({ where: { householdId: { in: [householdId, otherHouseholdId] } } });
  await prisma.account.deleteMany({ where: { id: { in: [ACCOUNT_ID, OTHER_ACCOUNT_ID] } } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await cleanupTestHousehold(prisma, OTHER_USER_ID);
  await prisma.user.deleteMany({ where: { id: { in: [TEST_USER_ID, OTHER_USER_ID] } } });
  await prisma.$disconnect();
});

describe("POST /api/budget-plans", () => {
  it("creates a MONTHLY plan (201) with the DTO shape", async () => {
    const res = await post({ categoryId: foodId, period: "MONTHLY", amountCents: 25000 });
    expect(res.status).toBe(201);
    const dto = (await res.json()) as PlanDto;
    expect(dto).toMatchObject({ categoryId: foodId, period: "MONTHLY", amountCents: 25000 });
    expect(typeof dto.id).toBe("string");
    expect(Number.isNaN(Date.parse(dto.createdAt))).toBe(false);
    expect(Number.isNaN(Date.parse(dto.updatedAt))).toBe(false);
  });

  it("creates a YEARLY plan (201)", async () => {
    const res = await post({ categoryId: hobbyId, period: "YEARLY", amountCents: 120000 });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ categoryId: hobbyId, period: "YEARLY", amountCents: 120000 });
  });

  it("returns 409 for a second active plan on the same category", async () => {
    expect((await post({ categoryId: foodId, period: "MONTHLY", amountCents: 100 })).status).toBe(201);
    const res = await post({ categoryId: foodId, period: "YEARLY", amountCents: 200 });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Budget plan already exists for category" });
  });

  it("revives a soft-deleted plan with the same id and new values", async () => {
    const created = (await (await post({ categoryId: foodId, period: "MONTHLY", amountCents: 100 })).json()) as PlanDto;
    expect((await del(created.id)).status).toBe(204);

    const res = await post({ categoryId: foodId, period: "YEARLY", amountCents: 5000 });
    expect(res.status).toBe(201);
    const revived = (await res.json()) as PlanDto;
    expect(revived.id).toBe(created.id);
    expect(revived).toMatchObject({ period: "YEARLY", amountCents: 5000 });
    const row = await prisma.categoryBudgetPlan.findUnique({ where: { id: created.id } });
    expect(row?.deletedAt).toBeNull();
  });

  it("returns 404 for a category of another household", async () => {
    const res = await post({ categoryId: foreignCatId, period: "MONTHLY", amountCents: 100 });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Category not found" });
  });

  it("returns 404 for an unknown or soft-deleted category", async () => {
    expect((await post({ categoryId: "does-not-exist", period: "MONTHLY", amountCents: 100 })).status).toBe(404);
    expect((await post({ categoryId: deletedCatId, period: "MONTHLY", amountCents: 100 })).status).toBe(404);
  });

  it.each([
    ["Savings", () => savingsId],
    ["Sparen", () => sparenId],
    ["income category", () => salaryId]
  ])("returns 400 'Category not budgetable' for %s", async (_label, getId) => {
    const res = await post({ categoryId: getId(), period: "MONTHLY", amountCents: 100 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Category not budgetable" });
  });

  it.each([
    ["amountCents 0", { period: "MONTHLY", amountCents: 0 }],
    ["fractional amountCents", { period: "MONTHLY", amountCents: 12.5 }],
    ["negative amountCents", { period: "MONTHLY", amountCents: -5 }],
    ["amountCents above 1_000_000_000", { period: "MONTHLY", amountCents: 1_000_000_001 }],
    ["period WEEKLY", { period: "WEEKLY", amountCents: 100 }],
    ["missing period", { amountCents: 100 }]
  ])("returns 400 for %s", async (_label, partial) => {
    const res = await post({ categoryId: foodId, ...partial });
    expect(res.status).toBe(400);
  });

  it("accepts the upper bound 1_000_000_000", async () => {
    const res = await post({ categoryId: foodId, period: "YEARLY", amountCents: 1_000_000_000 });
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/budget-plans/[id]", () => {
  it("updates period and amount (200)", async () => {
    const created = (await (await post({ categoryId: foodId, period: "MONTHLY", amountCents: 100 })).json()) as PlanDto;
    const res = await patch(created.id, { period: "YEARLY", amountCents: 999 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: created.id, categoryId: foodId, period: "YEARLY", amountCents: 999 });
  });

  it("updates a single field", async () => {
    const created = (await (await post({ categoryId: foodId, period: "MONTHLY", amountCents: 100 })).json()) as PlanDto;
    const res = await patch(created.id, { amountCents: 321 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ period: "MONTHLY", amountCents: 321 });
  });

  it("returns 400 for an empty body", async () => {
    const created = (await (await post({ categoryId: foodId, period: "MONTHLY", amountCents: 100 })).json()) as PlanDto;
    expect((await patch(created.id, {})).status).toBe(400);
  });

  it("returns 400 for invalid values", async () => {
    const created = (await (await post({ categoryId: foodId, period: "MONTHLY", amountCents: 100 })).json()) as PlanDto;
    expect((await patch(created.id, { amountCents: 0 })).status).toBe(400);
    expect((await patch(created.id, { period: "WEEKLY" })).status).toBe(400);
  });

  it("returns 404 for an unknown plan", async () => {
    expect((await patch("does-not-exist", { amountCents: 100 })).status).toBe(404);
  });

  it("returns 404 for a plan of another household", async () => {
    const foreign = await prisma.categoryBudgetPlan.create({
      data: { householdId: otherHouseholdId, categoryId: foreignCatId, period: "MONTHLY", amountCents: 100 }
    });
    expect((await patch(foreign.id, { amountCents: 200 })).status).toBe(404);
    const row = await prisma.categoryBudgetPlan.findUnique({ where: { id: foreign.id } });
    expect(row?.amountCents).toBe(100);
  });

  it("returns 404 for a soft-deleted plan", async () => {
    const created = (await (await post({ categoryId: foodId, period: "MONTHLY", amountCents: 100 })).json()) as PlanDto;
    await del(created.id);
    expect((await patch(created.id, { amountCents: 200 })).status).toBe(404);
  });
});

describe("DELETE /api/budget-plans/[id]", () => {
  it("soft-deletes the plan (204) and hides it from the list", async () => {
    const created = (await (await post({ categoryId: foodId, period: "MONTHLY", amountCents: 100 })).json()) as PlanDto;
    const res = await del(created.id);
    expect(res.status).toBe(204);

    const row = await prisma.categoryBudgetPlan.findUnique({ where: { id: created.id } });
    expect(row).not.toBeNull();
    expect(row?.deletedAt).not.toBeNull();

    const body = (await (await list()).json()) as ListResponse;
    expect(body.plans.find((p) => p.id === created.id)).toBeUndefined();
  });

  it("returns 404 on a second delete and for unknown or foreign plans", async () => {
    const created = (await (await post({ categoryId: foodId, period: "MONTHLY", amountCents: 100 })).json()) as PlanDto;
    expect((await del(created.id)).status).toBe(204);
    expect((await del(created.id)).status).toBe(404);
    expect((await del("does-not-exist")).status).toBe(404);

    const foreign = await prisma.categoryBudgetPlan.create({
      data: { householdId: otherHouseholdId, categoryId: foreignCatId, period: "MONTHLY", amountCents: 100 }
    });
    expect((await del(foreign.id)).status).toBe(404);
    const row = await prisma.categoryBudgetPlan.findUnique({ where: { id: foreign.id } });
    expect(row?.deletedAt).toBeNull();
  });
});

describe("GET /api/budget-plans", () => {
  it("returns the smoothed availability of the recurring year matrix and the plan lists", async () => {
    const monthly = (await (await post({ categoryId: foodId, period: "MONTHLY", amountCents: 25000 })).json()) as PlanDto;
    const res = await list();
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListResponse;

    expect(body.year).toBe(YEAR);
    expect(body.availablePerMonthCents).toEqual([0, ...Array.from({ length: 11 }, () => 200000)]);

    expect(body.plans).toHaveLength(1);
    const plan = body.plans[0]!;
    expect(plan).toMatchObject({ id: monthly.id, categoryId: foodId, categoryName: "BP Food", period: "MONTHLY", amountCents: 25000 });
    expect(plan.monthlyCents).toEqual(Array.from({ length: 12 }, () => 25000));
  });

  it("distributes a YEARLY plan by availability and sums exactly", async () => {
    await post({ categoryId: hobbyId, period: "YEARLY", amountCents: 1200000 });
    const body = (await (await list()).json()) as ListResponse;
    const plan = body.plans.find((p) => p.categoryId === hobbyId)!;

    // January has no net availability -> 0; 1_200_000 / 11 = 109090 r 10 -> remainder to the first heaviest month (Feb)
    expect(plan.monthlyCents).toEqual([0, 109100, ...Array.from({ length: 10 }, () => 109090)]);
    expect(sum(plan.monthlyCents)).toBe(1200000);
  });

  it("lists budgetable categories with their plan id", async () => {
    const created = (await (await post({ categoryId: foodId, period: "MONTHLY", amountCents: 100 })).json()) as PlanDto;
    const body = (await (await list()).json()) as ListResponse;

    const byId = new Map(body.budgetableCategories.map((c) => [c.id, c]));
    expect(byId.get(foodId)).toEqual({ id: foodId, name: "BP Food", planId: created.id });
    expect(byId.get(hobbyId)).toEqual({ id: hobbyId, name: "BP Hobby", planId: null });
    expect(byId.has(savingsId)).toBe(false);
    expect(byId.has(sparenId)).toBe(false);
    expect(byId.has(salaryId)).toBe(false);
    expect(byId.has(deletedCatId)).toBe(false);
    expect(byId.has(foreignCatId)).toBe(false);
  });

  it("does not leak plans of other households", async () => {
    await prisma.categoryBudgetPlan.create({
      data: { householdId: otherHouseholdId, categoryId: foreignCatId, period: "MONTHLY", amountCents: 100 }
    });
    const body = (await (await list()).json()) as ListResponse;
    expect(body.plans).toEqual([]);
  });

  it("returns 400 'Invalid query' for an invalid year", async () => {
    for (const q of ["year=abc", "year=1999", "year=2101"]) {
      const res = await list(q);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid query" });
    }
  });

  it("returns 401 for unauthenticated requests on all handlers", async () => {
    process.env.TEST_USER_ID_BYPASS = "test-user-budget-plans-no-household";
    vi.resetModules();
    expect((await list()).status).toBe(401);
    expect((await post({ categoryId: foodId, period: "MONTHLY", amountCents: 100 })).status).toBe(401);
    expect((await patch("x", { amountCents: 100 })).status).toBe(401);
    expect((await del("x")).status).toBe(401);
    process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;
    vi.resetModules();
  });
});

describe("GET /api/budget-plans - smoothed availability", () => {
  const anchorOf = (month: number) => new Date(Date.UTC(YEAR, month - 1, 1, 12));
  const baseRecurring = () => [
    { amountCents: 300000, description: "BP Gehalt", intervalMonths: 1, month: 1, categoryId: salaryId },
    { amountCents: -100000, description: "BP Miete", intervalMonths: 1, month: 1, categoryId: foodId },
    { amountCents: -200000, description: "BP Versicherung", intervalMonths: 12, month: 1, categoryId: hobbyId }
  ];
  async function replaceRecurring(
    items: Array<{ amountCents: number; description: string; intervalMonths: number; month: number; categoryId: string }>
  ) {
    await prisma.recurringTransactionSkip.deleteMany({ where: { recurring: { accountId: ACCOUNT_ID } } });
    await prisma.recurringTransaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
    await prisma.recurringTransaction.createMany({
      data: items.map((i) => ({
        accountId: ACCOUNT_ID,
        categoryId: i.categoryId,
        amountCents: i.amountCents,
        description: i.description,
        frequency: "MONTHLY",
        intervalMonths: i.intervalMonths,
        dayOfMonth: 1,
        nextOccurrence: anchorOf(i.month)
      }))
    });
  }
  afterEach(async () => {
    await replaceRecurring(baseRecurring());
  });

  it("spreads a yearly-only salary evenly: availablePerMonthCents and YEARLY monthlyCents", async () => {
    // Old (signed net): only June positive. New: 1_200_000 / 12 = 100000, minus rent 100000 = 0 everywhere.
    await replaceRecurring([
      { amountCents: 1200000, description: "BP Jahresgehalt", intervalMonths: 12, month: 6, categoryId: salaryId },
      { amountCents: -100000, description: "BP Miete", intervalMonths: 1, month: 1, categoryId: foodId }
    ]);
    await post({ categoryId: hobbyId, period: "YEARLY", amountCents: 1200000 });
    const body = (await (await list()).json()) as ListResponse;

    expect(body.availablePerMonthCents).toEqual(Array.from({ length: 12 }, () => 0));
    const plan = body.plans.find((p) => p.categoryId === hobbyId)!;
    expect(plan.monthlyCents).toEqual(Array.from({ length: 12 }, () => 100000));
  });

  it("lets only the month of a yearly expense dip (income smoothed)", async () => {
    await replaceRecurring([
      { amountCents: 2400000, description: "BP Jahresgehalt", intervalMonths: 12, month: 6, categoryId: salaryId },
      { amountCents: -100000, description: "BP Miete", intervalMonths: 1, month: 1, categoryId: foodId },
      { amountCents: -600000, description: "BP Jahresausgabe", intervalMonths: 12, month: 3, categoryId: hobbyId }
    ]);
    const body = (await (await list()).json()) as ListResponse;
    const expected = Array.from({ length: 12 }, () => 100000);
    // March: income 2_400_000 / 12 = 200000, rent -100000, yearly expense -600000 -> -500000.
    expected[2] = -500000;
    expect(body.availablePerMonthCents).toEqual(expected);
  });
});

describe("cascade", () => {
  it("removes the plan when its category is hard-deleted", async () => {
    const cat = await prisma.category.create({ data: { name: "BP Cascade", userId: TEST_USER_ID, householdId } });
    const plan = await prisma.categoryBudgetPlan.create({
      data: { householdId, categoryId: cat.id, period: "MONTHLY", amountCents: 100 }
    });
    await prisma.category.delete({ where: { id: cat.id } });
    expect(await prisma.categoryBudgetPlan.findUnique({ where: { id: plan.id } })).toBeNull();
  });
});
