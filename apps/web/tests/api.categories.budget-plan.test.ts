import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Budget plans follow their category when it is merged (PATCH mergeIntoCategoryId)
// or deleted with a fallback (DELETE fallbackCategoryId / fallbackName):
// - source has a plan, target has none  -> the plan (same id/period/amount) moves to the target
// - both have a plan                    -> the target's plan stays untouched, the source's plan is gone
// - source has no plan                  -> nothing changes
// Requests must not fail with 409 (P2002 unique categoryId) or 500.

const TEST_USER_ID = "test-user-cat-budget-plan";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

let prisma: import("@prisma/client").PrismaClient;
let userId: string;
let householdId: string;
let sourceId: string;
let targetId: string;

const NAMES = ["CBP Source", "CBP Target", "CBP Fallback New"];

async function resetCategories(): Promise<void> {
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
  await prisma.category.deleteMany({ where: { householdId, name: { in: NAMES } } });
  sourceId = (await prisma.category.create({ data: { name: NAMES[0]!, userId, householdId } })).id;
  targetId = (await prisma.category.create({ data: { name: NAMES[1]!, userId, householdId } })).id;
}

const jsonReq = (method: string, id: string, body: unknown) =>
  new Request(`http://localhost/api/categories/${id}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

async function merge(fromId: string, intoId: string): Promise<Response> {
  const { PATCH } = await import("../app/api/categories/[id]/route");
  return PATCH(jsonReq("PATCH", fromId, { mergeIntoCategoryId: intoId }), { params: { id: fromId } });
}

async function remove(id: string, body: { fallbackCategoryId?: string; fallbackName?: string }): Promise<Response> {
  const { DELETE } = await import("../app/api/categories/[id]/route");
  return DELETE(jsonReq("DELETE", id, body), { params: { id } });
}

const activePlans = (categoryId: string) =>
  prisma.categoryBudgetPlan.findMany({ where: { categoryId, deletedAt: null } });

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  const user = await prisma.user.upsert({
    where: { email: "cat-budget-plan-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "cat-budget-plan-test@example.com", password: "hashed" }
  });
  userId = user.id;
  householdId = await ensureTestHousehold(prisma, user.id, "Category Budget Plan Household");
});

beforeEach(async () => {
  await resetCategories();
});

afterAll(async () => {
  if (!prisma) return;
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
  await prisma.category.deleteMany({ where: { householdId } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.$disconnect();
});

describe("PATCH /api/categories/[id] mergeIntoCategoryId - budget plan", () => {
  it("moves the plan of the source to the target when the target has none", async () => {
    const plan = await prisma.categoryBudgetPlan.create({
      data: { householdId, categoryId: sourceId, period: "YEARLY", amountCents: 120000 }
    });

    const res = await merge(sourceId, targetId);
    expect(res.status).toBe(200);

    const moved = await activePlans(targetId);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ id: plan.id, categoryId: targetId, period: "YEARLY", amountCents: 120000 });
    expect(await activePlans(sourceId)).toHaveLength(0);
  });

  it("keeps the plan of the target and drops the plan of the source when both have one", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: sourceId, period: "YEARLY", amountCents: 999 } });
    const targetPlan = await prisma.categoryBudgetPlan.create({
      data: { householdId, categoryId: targetId, period: "MONTHLY", amountCents: 25000 }
    });

    const res = await merge(sourceId, targetId);
    expect(res.status).toBe(200);

    const plans = await activePlans(targetId);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ id: targetPlan.id, period: "MONTHLY", amountCents: 25000 });
    expect(await activePlans(sourceId)).toHaveLength(0);
  });

  it("changes nothing when the source has no plan", async () => {
    const targetPlan = await prisma.categoryBudgetPlan.create({
      data: { householdId, categoryId: targetId, period: "MONTHLY", amountCents: 25000 }
    });

    const res = await merge(sourceId, targetId);
    expect(res.status).toBe(200);

    const plans = await activePlans(targetId);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ id: targetPlan.id, period: "MONTHLY", amountCents: 25000 });
  });

  it("leaves a target without plan without plan when the source has none", async () => {
    const res = await merge(sourceId, targetId);
    expect(res.status).toBe(200);
    expect(await activePlans(targetId)).toHaveLength(0);
  });
});

describe("DELETE /api/categories/[id] fallbackCategoryId - budget plan", () => {
  it("moves the plan of the deleted category to the fallback when it has none", async () => {
    const plan = await prisma.categoryBudgetPlan.create({
      data: { householdId, categoryId: sourceId, period: "MONTHLY", amountCents: 4200 }
    });

    const res = await remove(sourceId, { fallbackCategoryId: targetId });
    expect(res.status).toBe(200);

    const moved = await activePlans(targetId);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ id: plan.id, categoryId: targetId, period: "MONTHLY", amountCents: 4200 });
    expect(await activePlans(sourceId)).toHaveLength(0);
  });

  it("keeps the fallback's plan and drops the deleted category's plan on conflict", async () => {
    await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: sourceId, period: "YEARLY", amountCents: 999 } });
    const targetPlan = await prisma.categoryBudgetPlan.create({
      data: { householdId, categoryId: targetId, period: "MONTHLY", amountCents: 25000 }
    });

    const res = await remove(sourceId, { fallbackCategoryId: targetId });
    expect(res.status).toBe(200);

    const plans = await activePlans(targetId);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ id: targetPlan.id, period: "MONTHLY", amountCents: 25000 });
    expect(await activePlans(sourceId)).toHaveLength(0);
  });

  it("changes nothing when the deleted category has no plan", async () => {
    const targetPlan = await prisma.categoryBudgetPlan.create({
      data: { householdId, categoryId: targetId, period: "MONTHLY", amountCents: 25000 }
    });

    const res = await remove(sourceId, { fallbackCategoryId: targetId });
    expect(res.status).toBe(200);

    const plans = await activePlans(targetId);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ id: targetPlan.id, amountCents: 25000 });
  });
});

describe("DELETE /api/categories/[id] fallbackName - budget plan", () => {
  it("moves the plan to the newly created fallback category", async () => {
    const plan = await prisma.categoryBudgetPlan.create({
      data: { householdId, categoryId: sourceId, period: "YEARLY", amountCents: 77700 }
    });

    const res = await remove(sourceId, { fallbackName: NAMES[2]! });
    expect(res.status).toBe(200);
    const { fallbackCategoryId } = (await res.json()) as { fallbackCategoryId: string };

    const created = await prisma.category.findFirst({ where: { householdId, name: NAMES[2]! } });
    expect(created?.id).toBe(fallbackCategoryId);

    const moved = await activePlans(fallbackCategoryId);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ id: plan.id, categoryId: fallbackCategoryId, period: "YEARLY", amountCents: 77700 });
    expect(await activePlans(sourceId)).toHaveLength(0);
  });
});

describe("target with a soft-deleted plan (occupies the unique categoryId)", () => {
  const tombstone = () =>
    prisma.categoryBudgetPlan.create({
      data: { householdId, categoryId: targetId, period: "MONTHLY", amountCents: 1, deletedAt: new Date() }
    });

  it("merge: the source plan moves to the target without a 409/500", async () => {
    const plan = await prisma.categoryBudgetPlan.create({
      data: { householdId, categoryId: sourceId, period: "YEARLY", amountCents: 120000 }
    });
    await tombstone();

    const res = await merge(sourceId, targetId);
    expect(res.status).toBe(200);

    const moved = await activePlans(targetId);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ id: plan.id, period: "YEARLY", amountCents: 120000 });
  });

  it("delete with fallback: the source plan moves to the fallback without a 409/500", async () => {
    const plan = await prisma.categoryBudgetPlan.create({
      data: { householdId, categoryId: sourceId, period: "MONTHLY", amountCents: 4200 }
    });
    await tombstone();

    const res = await remove(sourceId, { fallbackCategoryId: targetId });
    expect(res.status).toBe(200);

    const moved = await activePlans(targetId);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ id: plan.id, period: "MONTHLY", amountCents: 4200 });
  });
});
