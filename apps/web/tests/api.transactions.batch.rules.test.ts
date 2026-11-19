import { classifyFlow, sumFlows, zonedDayKey } from "@doewe/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Receipt bookings (POST /api/transactions/batch): the rows of one receipt add
// up to the receipt total, the tax flag falls back to the category, and the
// receipt day is stored as noon in Berlin. Fixtures are fixed strings, so the
// suite gives the same answer in any process time zone.

const TEST_USER_ID = "test-user-batch-rules";
const ACCOUNT_ID = "acc_batch_rules";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

type Booked = { id: string; categoryId: string; amountCents: number; description: string; lineItemCount: number };

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let groceriesId: string;
let couponsId: string;
let officeId: string;

const item = (name: string, totalCents: number, position: number, extra: Record<string, unknown> = {}) => ({
  name,
  quantity: 1,
  unitPriceCents: totalCents,
  totalCents,
  position,
  ...extra
});

async function post(body: unknown): Promise<Response> {
  const { POST } = await import("../app/api/transactions/batch/route");
  return POST(
    new Request("http://localhost/api/transactions/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body)
    })
  );
}

async function wipeBookings() {
  await prisma.receiptLineItem.deleteMany({ where: { transaction: { accountId: ACCOUNT_ID } } });
  await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "batch-rules-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "batch-rules-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id);
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: user.id, householdId, deletedAt: null },
    create: { id: ACCOUNT_ID, name: "Batch Rules Account", userId: user.id, householdId }
  });

  const mk = async (name: string, isTaxRelevant = false) =>
    (
      await prisma.category.upsert({
        where: { householdId_name: { householdId, name } },
        update: { isTaxRelevant, deletedAt: null },
        create: { name, userId: user.id, householdId, isTaxRelevant }
      })
    ).id;
  groceriesId = await mk("BR Groceries");
  couponsId = await mk("BR Coupons");
  officeId = await mk("BR Office", true);
});

beforeEach(async () => {
  await wipeBookings();
});

afterAll(async () => {
  if (prisma) {
    await wipeBookings();
    await prisma.category.deleteMany({ where: { householdId } });
    await prisma.account.deleteMany({ where: { id: ACCOUNT_ID } });
    await cleanupTestHousehold(prisma, TEST_USER_ID);
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.$disconnect();
  }
});

describe("POST /api/transactions/batch — amounts", () => {
  it("books a coupon that sits alone in a category as money back, not as an expense", async () => {
    // Receipt: groceries 10.00, coupon −2.00 → the customer paid 8.00.
    const res = await post({
      receiptDate: "2026-11-19",
      accountId: ACCOUNT_ID,
      groups: [
        { categoryId: groceriesId, items: [item("Einkauf", 1_000, 0)] },
        { categoryId: couponsId, items: [item("Coupon", -200, 1)] }
      ]
    });
    expect(res.status).toBe(201);
    const { transactions } = (await res.json()) as { transactions: Booked[] };

    const groceries = transactions.find((t) => t.categoryId === groceriesId);
    const coupon = transactions.find((t) => t.categoryId === couponsId);
    expect(groceries?.amountCents).toBe(-1_000);
    expect(coupon?.amountCents).toBe(200);

    // The rows of the receipt add up to what was paid; outcome is 10.00, not 12.00.
    const rows = await prisma.transaction.findMany({
      where: { accountId: ACCOUNT_ID },
      select: { amountCents: true, categoryId: true }
    });
    const totals = sumFlows(rows, new Set());
    expect(totals.netCents).toBe(-800);
    expect(totals.outcomeCents).toBe(1_000);
    expect(totals.incomeCents).toBe(200);
    expect(classifyFlow({ amountCents: coupon?.amountCents ?? 0, categoryId: couponsId }, new Set())).toBe("income");

    // The line item keeps its sign.
    const couponItems = await prisma.receiptLineItem.findMany({ where: { transactionId: coupon?.id } });
    expect(couponItems.map((i) => i.totalCents)).toEqual([-200]);
  });

  it("nets a discount inside its category", async () => {
    const res = await post({
      receiptDate: "2026-11-19",
      accountId: ACCOUNT_ID,
      groups: [{ categoryId: groceriesId, items: [item("Einkauf", 1_000, 0), item("Rabatt", -200, 1)] }]
    });
    expect(res.status).toBe(201);
    const { transactions } = (await res.json()) as { transactions: Booked[] };
    expect(transactions).toHaveLength(1);
    expect(transactions[0].amountCents).toBe(-800);
    expect(transactions[0].lineItemCount).toBe(2);
  });

  it("skips a group that nets to zero and books the rest", async () => {
    const res = await post({
      receiptDate: "2026-11-19",
      accountId: ACCOUNT_ID,
      groups: [
        { categoryId: groceriesId, items: [item("Einkauf", 1_000, 0)] },
        { categoryId: couponsId, items: [item("Pfand", 25, 1), item("Pfand zurück", -25, 2)] }
      ]
    });
    expect(res.status).toBe(201);
    const { transactions } = (await res.json()) as { transactions: Booked[] };
    expect(transactions.map((t) => t.categoryId)).toEqual([groceriesId]);
    expect(await prisma.transaction.count({ where: { accountId: ACCOUNT_ID } })).toBe(1);
    expect(await prisma.receiptLineItem.count({ where: { transaction: { accountId: ACCOUNT_ID } } })).toBe(1);
  });

  it("answers 400 when every group nets to zero", async () => {
    const res = await post({
      receiptDate: "2026-11-19",
      accountId: ACCOUNT_ID,
      groups: [{ categoryId: couponsId, items: [item("Pfand", 25, 0), item("Pfand zurück", -25, 1)] }]
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("groups");
    expect(await prisma.transaction.count({ where: { accountId: ACCOUNT_ID } })).toBe(0);
  });
});

describe("POST /api/transactions/batch — tax flag", () => {
  const groups = () => [
    { categoryId: officeId, items: [item("Druckerpapier", 599, 0)] },
    { categoryId: groceriesId, items: [item("Kaffee", 499, 1)] }
  ];

  async function flags(body: Record<string, unknown>): Promise<Record<string, boolean>> {
    const res = await post({ receiptDate: "2026-11-19", accountId: ACCOUNT_ID, groups: groups(), ...body });
    expect(res.status).toBe(201);
    const rows = await prisma.transaction.findMany({
      where: { accountId: ACCOUNT_ID },
      select: { categoryId: true, taxRelevant: true }
    });
    return Object.fromEntries(rows.map((row) => [row.categoryId ?? "", row.taxRelevant]));
  }

  it("inherits the category's flag when the request leaves it out", async () => {
    expect(await flags({})).toEqual({ [officeId]: true, [groceriesId]: false });
  });

  it("an explicit false wins over a tax-relevant category", async () => {
    expect(await flags({ taxRelevant: false })).toEqual({ [officeId]: false, [groceriesId]: false });
  });

  it("an explicit true marks every row", async () => {
    expect(await flags({ taxRelevant: true })).toEqual({ [officeId]: true, [groceriesId]: true });
  });
});

describe("POST /api/transactions/batch — receipt date", () => {
  it.each([
    ["in winter (CET)", "2026-01-15", "2026-01-15T11:00:00.000Z"],
    ["in summer (CEST)", "2026-07-01", "2026-07-01T10:00:00.000Z"],
    ["on the first of a month", "2026-11-01", "2026-11-01T11:00:00.000Z"],
    ["on the day the clocks go forward", "2026-03-29", "2026-03-29T10:00:00.000Z"]
  ])("stores a receipt day %s as noon in Berlin", async (_label, receiptDate, expected) => {
    const res = await post({
      receiptDate,
      accountId: ACCOUNT_ID,
      groups: [{ categoryId: groceriesId, items: [item("Einkauf", 1_000, 0)] }]
    });
    expect(res.status).toBe(201);
    const { transactions } = (await res.json()) as { transactions: Booked[] };
    const row = await prisma.transaction.findUnique({ where: { id: transactions[0].id } });
    expect(row?.occurredAt.toISOString()).toBe(expected);
    expect(row ? zonedDayKey(row.occurredAt) : null).toBe(receiptDate);
  });

  it.each([
    ["a day that does not exist", "2026-02-30"],
    ["a German date", "19.11.2026"],
    ["a full ISO instant", "2026-11-19T10:00:00.000Z"],
    ["empty", ""],
    ["text", "heute"]
  ])("rejects a receiptDate that is %s with a 400 naming the field", async (_label, receiptDate) => {
    const res = await post({
      receiptDate,
      accountId: ACCOUNT_ID,
      groups: [{ categoryId: groceriesId, items: [item("Einkauf", 1_000, 0)] }]
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(typeof body.error).toBe("string");
    expect(body.error).toContain("receiptDate");
    expect(await prisma.transaction.count({ where: { accountId: ACCOUNT_ID } })).toBe(0);
  });
});

describe("POST /api/transactions/batch — numbers that cannot be stored are a 400 naming the field", () => {
  it.each([
    ["a fractional totalCents", { totalCents: 149.5 }, "groups.0.items.0.totalCents"],
    ["a fractional unitPriceCents", { unitPriceCents: 0.5 }, "groups.0.items.0.unitPriceCents"],
    ["a totalCents beyond int4", { totalCents: 3_000_000_000 }, "groups.0.items.0.totalCents"],
    ["a unitPriceCents beyond int4", { unitPriceCents: -3_000_000_000 }, "groups.0.items.0.unitPriceCents"],
    ["a totalCents sent as text", { totalCents: "149" }, "groups.0.items.0.totalCents"],
    ["a quantity of zero", { quantity: 0 }, "groups.0.items.0.quantity"],
    ["a fractional position", { position: 1.5 }, "groups.0.items.0.position"]
  ])("rejects %s", async (_label, extra, path) => {
    const res = await post({
      receiptDate: "2026-11-19",
      accountId: ACCOUNT_ID,
      groups: [{ categoryId: groceriesId, items: [item("Milch", 149, 0, extra)] }]
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(typeof body.error).toBe("string");
    expect(body.error).toContain(path);
    expect(await prisma.transaction.count({ where: { accountId: ACCOUNT_ID } })).toBe(0);
  });

  it("rejects a group whose sum overflows int4 although each line fits", async () => {
    const res = await post({
      receiptDate: "2026-11-19",
      accountId: ACCOUNT_ID,
      groups: [{ categoryId: groceriesId, items: [item("A", 2_000_000_000, 0), item("B", 2_000_000_000, 1)] }]
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("groups.0.items");
  });

  it("rejects a body that is not JSON", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect(typeof ((await res.json()) as { error: string }).error).toBe("string");
  });
});
