import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// GET /api/accounts lists the oldest account first. The forms preselect
// `accounts[0]`, and everything on the server that needs "the" account takes
// the oldest one — both have to mean the same account.

const TEST_USER_ID = "test-user-accounts-order";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

const OLDEST = "acc_order_oldest";
const MIDDLE = "acc_order_middle";
const NEWEST = "acc_order_newest";
const DELETED = "acc_order_deleted";

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "accounts-order-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "accounts-order-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id);
  await wipeBookings();

  // Inserted newest first, so insertion order cannot pass for creation order.
  for (const [id, createdAt, deletedAt] of [
    [NEWEST, "2026-06-01T00:00:00.000Z", null],
    [DELETED, "2024-01-01T00:00:00.000Z", "2024-02-01T00:00:00.000Z"],
    [MIDDLE, "2025-06-01T00:00:00.000Z", null],
    [OLDEST, "2025-01-01T00:00:00.000Z", null]
  ] as const) {
    const data = {
      name: id,
      userId: user.id,
      householdId,
      createdAt: new Date(createdAt),
      deletedAt: deletedAt ? new Date(deletedAt) : null
    };
    await prisma.account.upsert({ where: { id }, update: data, create: { id, ...data } });
  }
});

async function wipeBookings() {
  await prisma.transaction.deleteMany({ where: { accountId: { in: [OLDEST, MIDDLE, NEWEST, DELETED] } } });
  await prisma.category.deleteMany({ where: { householdId } });
}

afterAll(async () => {
  if (prisma) {
    await wipeBookings();
    await prisma.account.deleteMany({ where: { id: { in: [OLDEST, MIDDLE, NEWEST, DELETED] } } });
    await cleanupTestHousehold(prisma, TEST_USER_ID);
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.$disconnect();
  }
});

describe("GET /api/accounts", () => {
  it("lists the household's accounts oldest first, without deleted ones", async () => {
    const { GET } = await import("../app/api/accounts/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const accounts = (await res.json()) as Array<{ id: string }>;
    expect(accounts.map((a) => a.id)).toEqual([OLDEST, MIDDLE, NEWEST]);
  });

  it("puts first the account the server-side defaults use", async () => {
    const { GET } = await import("../app/api/accounts/route");
    const accounts = (await (await GET()).json()) as Array<{ id: string }>;

    // The lookup the routes use for "the" account of a household.
    const { prisma: appPrisma } = await import("../lib/prisma");
    const serverDefault = await appPrisma.account.findFirst({ where: { householdId }, orderBy: { createdAt: "asc" } });
    expect(accounts[0].id).toBe(serverDefault?.id);

    // e.g. a savings withdrawal without an accountId is booked on that account.
    const savings = await prisma.category.create({ data: { name: "Savings", userId: TEST_USER_ID, householdId } });
    await prisma.transaction.create({
      data: {
        accountId: NEWEST,
        categoryId: savings.id,
        amountCents: -10_000,
        description: "deposit",
        occurredAt: new Date("2026-11-05T10:00:00.000Z")
      }
    });
    const { POST } = await import("../app/api/saving-plan/withdraw/route");
    const res = await POST(
      new Request("http://localhost/api/saving-plan/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: 2_500 })
      })
    );
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const booked = await prisma.transaction.findUnique({ where: { id } });
    expect(booked?.accountId).toBe(accounts[0].id);

  });
});
