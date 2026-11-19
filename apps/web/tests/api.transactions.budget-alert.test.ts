import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { sendPushToUser } from "../lib/push";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Every way a booking is created or changed by hand checks the budget alert of
// its category: POST /api/transactions, PATCH /api/transactions/[id] and each
// group of a receipt (POST /api/transactions/batch). (The purchase booked when
// a saving goal is completed: api.saving-plan.complete.test.ts.) The categories
// here only have budget plans. Observed through the push recorder and the
// BudgetAlertLog.
vi.mock("../lib/push", () => ({ sendPushToUser: vi.fn(async () => 1) }));

const TEST_USER_ID = "test-user-tx-budget-alert";
const PARTNER_ID = "test-user-tx-budget-alert-partner";
const ACCOUNT_ID = "acc_tx_budget_alert";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

/** 19 Nov 2033, 11:00 in Berlin. */
const NOW = new Date("2033-11-19T10:00:00.000Z");

const push = vi.mocked(sendPushToUser);

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let foodId: string;
let hobbyId: string;
let plainId: string;

const jsonReq = (url: string, method: string, body: unknown) =>
  new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function logged(categoryId: string, month = 11): Promise<number[]> {
  const rows = await prisma.budgetAlertLog.findMany({
    where: { householdId, categoryId, year: 2033, month },
    orderBy: { threshold: "asc" }
  });
  return rows.map((row) => row.threshold);
}

/** [userId, body] of every push, sorted. */
const sent = () => push.mock.calls.map(([userId, payload]) => `${userId}: ${payload.body}`).sort();

async function create(body: Record<string, unknown>): Promise<Response> {
  const { POST } = await import("../app/api/transactions/route");
  return POST(jsonReq("http://localhost/api/transactions", "POST", { accountId: ACCOUNT_ID, description: "TBA", ...body }));
}

async function edit(id: string, body: Record<string, unknown>): Promise<Response> {
  const { PATCH } = await import("../app/api/transactions/[id]/route");
  return PATCH(
    jsonReq(`http://localhost/api/transactions/${id}`, "PATCH", { accountId: ACCOUNT_ID, description: "TBA", ...body }),
    { params: { id } }
  );
}

async function stored(amountCents: number, categoryId: string | null, occurredAt = "2033-11-05T11:00:00.000Z") {
  const row = await prisma.transaction.create({
    data: { accountId: ACCOUNT_ID, categoryId, amountCents, description: "TBA stored", occurredAt: new Date(occurredAt) }
  });
  return row.id;
}

async function clean() {
  await prisma.budgetAlertLog.deleteMany({ where: { householdId } });
  await prisma.budgetMonthSnapshot.deleteMany({ where: { householdId } });
  await prisma.receiptLineItem.deleteMany({ where: { transaction: { accountId: ACCOUNT_ID } } });
  await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "tx-budget-alert-test@example.com" },
    update: { notifyBudgetAlerts: true, locale: "de" },
    create: { id: TEST_USER_ID, email: "tx-budget-alert-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id);
  // The partner did not book anything in these tests and is notified all the same.
  await prisma.user.upsert({
    where: { email: "tx-budget-alert-partner@example.com" },
    update: { notifyBudgetAlerts: true, locale: "en" },
    create: { id: PARTNER_ID, email: "tx-budget-alert-partner@example.com", password: "hashed", locale: "en" }
  });
  await prisma.householdMember.upsert({
    where: { userId: PARTNER_ID },
    update: { householdId, role: "MEMBER" },
    create: { userId: PARTNER_ID, householdId, role: "MEMBER" }
  });
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: user.id, householdId, deletedAt: null },
    create: { id: ACCOUNT_ID, name: ACCOUNT_ID, userId: user.id, householdId }
  });
  const mk = async (name: string) =>
    (
      await prisma.category.upsert({
        where: { householdId_name: { householdId, name } },
        update: { deletedAt: null },
        create: { name, userId: user.id, householdId }
      })
    ).id;
  foodId = await mk("TBA Food");
  hobbyId = await mk("TBA Hobby");
  plainId = await mk("TBA No Budget");

  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
  await prisma.categoryBudgetPlan.createMany({
    data: [
      { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 10_000 },
      { householdId, categoryId: hobbyId, period: "MONTHLY", amountCents: 5_000 }
    ]
  });

  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

beforeEach(async () => {
  await clean();
  push.mockClear();
});

afterAll(async () => {
  vi.useRealTimers();
  await clean();
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
  await prisma.category.deleteMany({ where: { householdId } });
  await prisma.account.deleteMany({ where: { id: ACCOUNT_ID } });
  await prisma.householdMember.deleteMany({ where: { userId: PARTNER_ID } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await prisma.user.deleteMany({ where: { id: { in: [TEST_USER_ID, PARTNER_ID] } } });
  await prisma.$disconnect();
});

describe("POST /api/transactions", () => {
  it("alerts for a category that only has a budget plan, and tells both partners", async () => {
    expect((await create({ categoryId: foodId, amountCents: -7_000, occurredAt: "2033-11-05" })).status).toBe(201);
    expect(await logged(foodId)).toEqual([]);
    expect(push).not.toHaveBeenCalled();

    expect((await create({ categoryId: foodId, amountCents: -1_500, occurredAt: "2033-11-06" })).status).toBe(201);
    expect(await logged(foodId)).toEqual([80]);
    expect(sent()).toEqual([
      `${PARTNER_ID}: TBA Food: budget 80% used.`,
      `${TEST_USER_ID}: TBA Food: Budget zu 80 % ausgeschöpft.`
    ]);
  });
});

describe("PATCH /api/transactions/[id]", () => {
  it("alerts when an edit raises the amount over a threshold", async () => {
    const id = await stored(-1_000, foodId);
    const res = await edit(id, { categoryId: foodId, amountCents: -8_500, occurredAt: "2033-11-05" });
    expect(res.status).toBe(200);
    expect(await logged(foodId)).toEqual([80]);
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("checks the category the booking is in after the edit", async () => {
    const id = await stored(-12_000, plainId);
    expect((await edit(id, { categoryId: foodId, amountCents: -12_000, occurredAt: "2033-11-05" })).status).toBe(200);
    expect(await logged(foodId)).toEqual([80, 100]);
    expect(await logged(plainId)).toEqual([]);
    expect(sent()).toEqual([
      `${PARTNER_ID}: TBA Food: budget 100% used.`,
      `${TEST_USER_ID}: TBA Food: Budget zu 100 % ausgeschöpft.`
    ]);
  });

  it("checks the month the booking is in after the edit", async () => {
    // Booked in December by mistake, moved into November.
    const id = await stored(-9_000, foodId, "2033-12-05T11:00:00.000Z");
    expect((await edit(id, { categoryId: foodId, amountCents: -9_000, occurredAt: "2033-11-30" })).status).toBe(200);
    expect(await logged(foodId, 11)).toEqual([80]);
    expect(await logged(foodId, 12)).toEqual([]);
  });

  it("does not alert when the edit leaves the category below the threshold or removes the category", async () => {
    const id = await stored(-1_000, foodId);
    expect((await edit(id, { categoryId: foodId, amountCents: -2_000, occurredAt: "2033-11-05" })).status).toBe(200);
    const other = await stored(-9_000, hobbyId);
    expect((await edit(other, { amountCents: -9_000, occurredAt: "2033-11-05" })).status).toBe(200);
    expect(await prisma.budgetAlertLog.count({ where: { householdId } })).toBe(0);
    expect(push).not.toHaveBeenCalled();
  });
});

describe("POST /api/transactions/batch", () => {
  it("checks the alert once for each booked group", async () => {
    const item = (name: string, totalCents: number, position: number) => ({
      name,
      quantity: 1,
      unitPriceCents: totalCents,
      totalCents,
      position
    });
    const { POST } = await import("../app/api/transactions/batch/route");
    const res = await POST(
      jsonReq("http://localhost/api/transactions/batch", "POST", {
        receiptDate: "2033-11-07",
        accountId: ACCOUNT_ID,
        groups: [
          { categoryId: foodId, items: [item("Einkauf", 8_200, 0)] },
          { categoryId: hobbyId, items: [item("Farbe", 5_100, 1)] },
          { categoryId: plainId, items: [item("Sonstiges", 99_000, 2)] }
        ]
      })
    );
    expect(res.status).toBe(201);

    expect(await logged(foodId)).toEqual([80]);
    expect(await logged(hobbyId)).toEqual([80, 100]);
    expect(await logged(plainId)).toEqual([]);
    expect(sent()).toEqual([
      `${PARTNER_ID}: TBA Food: budget 80% used.`,
      `${PARTNER_ID}: TBA Hobby: budget 100% used.`,
      `${TEST_USER_ID}: TBA Food: Budget zu 80 % ausgeschöpft.`,
      `${TEST_USER_ID}: TBA Hobby: Budget zu 100 % ausgeschöpft.`
    ]);
  });
});
