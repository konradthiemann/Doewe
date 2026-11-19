import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// The suggested monthly rate measured through the route. Completing a goal
// books a withdrawal from the pool; that withdrawal must not cancel this
// month's deposits, or the rate of the remaining goals drops although nothing
// of them was covered when the month began. Also: simultaneous withdrawals
// cannot together take out more than the pool holds. Clock year 2045, own
// fixture ids.

const TEST_USER_ID = "test-user-saving-plan-rate";
const ACCOUNT_ID = "acc_saving_plan_rate";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

/** 19 Nov 2045, 11:00 in Berlin. */
const NOW = new Date("2045-11-19T10:00:00.000Z");

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

type Totals = { rawAvailableCents: number; availableCents: number; suggestedMonthlyCents: number };

async function totals(): Promise<Totals> {
  const { GET } = await import("../app/api/saving-plan/route");
  const res = await GET();
  expect(res.status).toBe(200);
  return ((await res.json()) as { totals: Totals }).totals;
}

/** A savings booking: positive `cents` = deposit, negative = withdrawal. */
async function deposit(cents: number, occurredAt: string) {
  await prisma.transaction.create({
    data: {
      accountId: ACCOUNT_ID,
      categoryId: savingsId,
      amountCents: -cents,
      description: "SPR savings",
      occurredAt: new Date(occurredAt)
    }
  });
}

async function goal(title: string, amountCents: number, month: number, year: number, extra: object = {}) {
  const row = await prisma.budget.create({
    data: { accountId: ACCOUNT_ID, categoryId: null, title, month, year, amountCents, ...extra }
  });
  return row.id;
}

async function clean() {
  await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.budget.deleteMany({ where: { accountId: ACCOUNT_ID } });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  await prisma.user.upsert({
    where: { email: "saving-plan-rate@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "saving-plan-rate@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, TEST_USER_ID);
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: TEST_USER_ID, householdId, deletedAt: null },
    create: { id: ACCOUNT_ID, name: ACCOUNT_ID, userId: TEST_USER_ID, householdId }
  });
  savingsId = (
    await prisma.category.upsert({
      where: { householdId_name: { householdId, name: "Sparen" } },
      update: { deletedAt: null },
      create: { name: "Sparen", userId: TEST_USER_ID, householdId }
    })
  ).id;
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

beforeEach(async () => {
  vi.setSystemTime(NOW);
  await clean();
});

afterAll(async () => {
  vi.useRealTimers();
  await clean();
  await prisma.category.deleteMany({ where: { householdId } });
  await prisma.account.deleteMany({ where: { id: ACCOUNT_ID } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.$disconnect();
});

describe("GET /api/saving-plan — suggested rate in the month a goal is completed", () => {
  // Pool on 1 Nov: 500 € (meant for goal A). In November 300 € are deposited
  // and A is completed for 500 €. Goal B: 1,200 € due February 2046 — Nov, Dec
  // and Jan are open. Nothing of B was covered when November began, so the
  // rate is 1200 / 3 = 400 €.

  it("is 400 € with a legacy completion (reservation instead of a booking)", async () => {
    await deposit(50_000, "2045-10-05T10:00:00.000Z");
    await deposit(30_000, "2045-11-05T11:00:00.000Z");
    await goal("B", 120_000, 2, 2046);
    await goal("A", 50_000, 11, 2045, { completedAt: NOW, spentCents: 50_000, reservedCents: 50_000 });
    expect((await totals()).suggestedMonthlyCents).toBe(40_000);
  });

  it("is the same 400 € when completing A books a withdrawal", async () => {
    await deposit(50_000, "2045-10-05T10:00:00.000Z");
    await deposit(30_000, "2045-11-05T11:00:00.000Z");
    await goal("B", 120_000, 2, 2046);
    const a = await goal("A", 50_000, 11, 2045);

    const { POST } = await import("../app/api/saving-plan/[id]/complete/route");
    const res = await POST(
      jsonReq(`http://localhost/api/saving-plan/${a}/complete`, "POST", { spentCents: 50_000 }),
      ctx(a)
    );
    expect(res.status).toBe(200);

    const t = await totals();
    expect(t.availableCents).toBe(30_000);
    expect(t.suggestedMonthlyCents).toBe(40_000);
  });

  it("keeps the earlier cases: 600 € before and after saving 400 € in November, 800 € in December", async () => {
    // 1,200 € due January 2046, seen in November 2045: two months open.
    await goal("Urlaub", 120_000, 1, 2046);
    expect((await totals()).suggestedMonthlyCents).toBe(60_000);

    await deposit(40_000, "2045-11-05T11:00:00.000Z");
    expect((await totals()).suggestedMonthlyCents).toBe(60_000);

    vi.setSystemTime(new Date("2045-12-10T11:00:00.000Z"));
    expect((await totals()).suggestedMonthlyCents).toBe(80_000);
  });

  it("uses the pool as it is in a month with only a withdrawal", async () => {
    // 500 € saved in October, 200 € withdrawn in November → 300 € left.
    await deposit(50_000, "2045-10-05T10:00:00.000Z");
    await deposit(-20_000, "2045-11-05T11:00:00.000Z");
    await goal("Urlaub", 120_000, 1, 2046);
    // (1200 − 300) / 2
    expect((await totals()).suggestedMonthlyCents).toBe(45_000);
  });
});

describe("POST /api/saving-plan/withdraw — the pool lock", () => {
  it("lets exactly one of several simultaneous withdrawals through when together they exceed the pool", async () => {
    await deposit(50_000, "2045-10-05T10:00:00.000Z");
    const { POST } = await import("../app/api/saving-plan/withdraw/route");
    const withdraw = () =>
      POST(jsonReq("http://localhost/api/saving-plan/withdraw", "POST", { accountId: ACCOUNT_ID, amountCents: 30_000 }));

    // Each one alone fits into the 500 € pool; any two together do not.
    const responses = await Promise.all(Array.from({ length: 8 }, () => withdraw()));
    expect(responses.map((res) => res.status).sort()).toEqual([201, 409, 409, 409, 409, 409, 409, 409]);

    const withdrawals = await prisma.transaction.count({
      where: { accountId: ACCOUNT_ID, categoryId: savingsId, amountCents: { gt: 0 } }
    });
    expect(withdrawals).toBe(1);
    expect((await totals()).availableCents).toBe(20_000);
  });
});
