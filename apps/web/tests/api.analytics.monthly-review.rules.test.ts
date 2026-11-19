import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// GET /api/analytics/monthly-review against docs/calculations/00-grundregeln.md:
// query validation, the Berlin calendar for "current month", `availableMonths`
// and completed goals, household scope and the savings rate. Fixed UTC instants
// and a pinned "now": same result in any process time zone.

const TEST_USER_ID = "test-user-monthly-review-rules";
const ACCOUNT_ID = "acc_monthly_review_rules";
const SECOND_ACCOUNT_ID = "acc_monthly_review_rules_second";
const ACCOUNT_IDS = [ACCOUNT_ID, SECOND_ACCOUNT_ID];
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

/** 19 Nov 2026, 11:00 in Berlin. */
const NOW = new Date("2026-11-19T10:00:00.000Z");

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let foodId: string;

type Review = {
  month: number;
  year: number;
  incomeCents: number;
  outcomeCents: number;
  savingsCents: number;
  balanceAtStartCents: number;
  balanceAtEndCents: number;
  savingsRatePct: number;
  categories: Array<{ id: string; spentCents: number; budgetCents: number | null }>;
  topExpenses: Array<{ description: string; amountCents: number }>;
  completedGoals: Array<{ title: string }>;
  completedGoalsSpentCents: number;
  prevMonth: { month: number; year: number; incomeCents: number; outcomeCents: number; savingsCents: number } | null;
  availableMonths: Array<{ month: number; year: number }>;
};

async function review(query = ""): Promise<Review> {
  const { GET } = await import("../app/api/analytics/monthly-review/route");
  const res = await GET(new Request(`http://localhost/api/analytics/monthly-review${query}`));
  expect(res.status).toBe(200);
  return (await res.json()) as Review;
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "monthly-review-rules-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "monthly-review-rules-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id);
  for (const id of ACCOUNT_IDS) {
    await prisma.account.upsert({
      where: { id },
      update: { userId: user.id, householdId, deletedAt: null },
      create: { id, name: id, userId: user.id, householdId }
    });
    await prisma.transaction.deleteMany({ where: { accountId: id } });
    await prisma.budget.deleteMany({ where: { accountId: id } });
  }
  const mk = async (name: string) =>
    (
      await prisma.category.upsert({
        where: { householdId_name: { householdId, name } },
        update: { deletedAt: null },
        create: { name, userId: user.id, householdId }
      })
    ).id;
  foodId = await mk("MRR Food");
  const savingsId = await mk("Savings");
  const sparenId = await mk(" Sparen ");

  const t = (
    amountCents: number,
    description: string,
    occurredAt: string,
    categoryId: string | null,
    accountId = ACCOUNT_ID
  ) => ({ accountId, amountCents, description, occurredAt: new Date(occurredAt), categoryId });

  await prisma.transaction.createMany({
    data: [
      // ── August 2026: earliest booking, 1 Aug 00:30 in Berlin — still 31 July in UTC
      t(100_000, "aug income, first minutes", "2026-07-31T22:30:00.000Z", null),

      // ── September 2026: more withdrawn from savings than deposited
      t(200_000, "sep income", "2026-09-05T10:00:00.000Z", null),
      t(-10_000, "sep deposit", "2026-09-10T10:00:00.000Z", savingsId),
      t(40_000, "sep withdrawal", "2026-09-12T10:00:00.000Z", sparenId),
      t(-30_000, "sep food", "2026-09-15T10:00:00.000Z", foodId),

      // ── October 2026
      t(50_000, "oct income", "2026-10-05T10:00:00.000Z", null),
      t(-60_000, "oct deposit, more than the income", "2026-10-06T10:00:00.000Z", savingsId),
      t(-8_000, "oct food", "2026-10-07T10:00:00.000Z", foodId),
      t(-9_000, "oct food, second account", "2026-10-08T10:00:00.000Z", foodId, SECOND_ACCOUNT_ID),
      t(4_000, "oct refund", "2026-10-09T10:00:00.000Z", foodId)
    ]
  });

  await prisma.budget.createMany({
    data: [
      // legacy category budget held by the second account
      { accountId: SECOND_ACCOUNT_ID, categoryId: foodId, month: 10, year: 2026, amountCents: 15_000 },
      // 30 Sep 23:30 in Berlin: September
      { accountId: ACCOUNT_ID, categoryId: null, title: "September goal", completedAt: new Date("2026-09-30T21:30:00.000Z"), spentCents: 1_000 },
      // 1 Oct 00:30 in Berlin — still 30 Sep in UTC
      { accountId: ACCOUNT_ID, categoryId: null, title: "First minutes", completedAt: new Date("2026-09-30T22:30:00.000Z"), spentCents: 2_000 },
      // 31 Oct 23:30 in Berlin, on the second account
      { accountId: SECOND_ACCOUNT_ID, categoryId: null, title: "Last minutes", completedAt: new Date("2026-10-31T22:30:00.000Z"), spentCents: 4_000 },
      // 1 Nov 00:30 in Berlin — still 31 Oct in UTC
      { accountId: ACCOUNT_ID, categoryId: null, title: "November goal", completedAt: new Date("2026-10-31T23:30:00.000Z"), spentCents: 8_000 }
    ]
  });

  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterEach(() => {
  vi.setSystemTime(NOW);
});

afterAll(async () => {
  vi.useRealTimers();
  for (const id of ACCOUNT_IDS) {
    await prisma.transaction.deleteMany({ where: { accountId: id } });
    await prisma.budget.deleteMany({ where: { accountId: id } });
  }
  await prisma.category.deleteMany({ where: { householdId } });
  await prisma.account.deleteMany({ where: { id: { in: ACCOUNT_IDS } } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.$disconnect();
});

describe("query validation", () => {
  it("defaults to the last completed month", async () => {
    const r = await review();
    expect([r.month, r.year]).toEqual([10, 2026]);
  });

  it.each([
    ["an out-of-range month", "?month=23&year=2026"],
    ["month 0", "?month=0&year=2026"],
    ["a negative month", "?month=-3&year=2026"],
    ["a fractional month", "?month=9.5&year=2026"],
    ["a non-numeric month", "?month=abc&year=2026"],
    ["a non-numeric year", "?month=9&year=abc"],
    ["a year out of range", "?month=9&year=1999"],
    ["the current month", "?month=11&year=2026"],
    ["a future month", "?month=12&year=2026"],
    ["a future year", "?month=1&year=2027"]
  ])("falls back to the default month for %s", async (_label, query) => {
    const r = await review(query);
    expect([r.month, r.year]).toEqual([10, 2026]);
    expect(r.outcomeCents).toBe(17_000);
  });

  it("opens a valid past month and labels it as requested", async () => {
    const r = await review("?month=9&year=2026");
    expect([r.month, r.year]).toEqual([9, 2026]);
    expect(r.outcomeCents).toBe(30_000);
  });

  it("uses the default year when only the month is given", async () => {
    const r = await review("?month=9");
    expect([r.month, r.year]).toEqual([9, 2026]);
  });
});

describe("figures", () => {
  it("covers all accounts and classifies savings first, then by sign", async () => {
    const r = await review("?month=10&year=2026");
    expect(r.incomeCents).toBe(54_000); // income + refund
    expect(r.outcomeCents).toBe(17_000); // both accounts, gross
    expect(r.savingsCents).toBe(60_000);
    expect(r.balanceAtStartCents).toBe(300_000); // 100,000 + 200,000 − 10,000 + 40,000 − 30,000
    expect(r.balanceAtEndCents).toBe(277_000);
    expect(r.categories).toEqual([
      expect.objectContaining({ id: foodId, spentCents: 17_000, budgetCents: 15_000 })
    ]);
    expect(r.topExpenses.map((e) => e.description)).toEqual(["oct food, second account", "oct food"]);
    expect(r.prevMonth).toEqual({
      month: 9,
      year: 2026,
      incomeCents: 200_000,
      outcomeCents: 30_000,
      savingsCents: -30_000
    });
  });

  it("caps the savings rate at 100 %", async () => {
    const r = await review("?month=10&year=2026");
    expect(r.savingsRatePct).toBe(100);
  });

  it("never reports a negative savings rate when more was withdrawn than deposited", async () => {
    const r = await review("?month=9&year=2026");
    expect(r.savingsCents).toBe(-30_000);
    expect(r.savingsRatePct).toBe(0);
  });
});

describe("Berlin calendar", () => {
  it("lists the months from the Berlin month of the earliest booking up to the previous month", async () => {
    const r = await review();
    expect(r.availableMonths).toEqual([
      { month: 10, year: 2026 },
      { month: 9, year: 2026 },
      { month: 8, year: 2026 }
    ]);
  });

  it("at 00:30 on 1 December in Berlin (23:30 UTC on 30 November) November is completed and listed", async () => {
    vi.setSystemTime(new Date("2026-11-30T23:30:00.000Z"));
    const r = await review();
    expect([r.month, r.year]).toEqual([11, 2026]);
    expect(r.availableMonths[0]).toEqual({ month: 11, year: 2026 });
    expect(r.availableMonths).toHaveLength(4);
    // one hour earlier November is still running
    vi.setSystemTime(new Date("2026-11-30T22:30:00.000Z"));
    const earlier = await review("?month=11&year=2026");
    expect([earlier.month, earlier.year]).toEqual([10, 2026]);
    expect(earlier.availableMonths[0]).toEqual({ month: 10, year: 2026 });
  });

  it("counts saving goals completed in the Berlin month, on any account", async () => {
    const r = await review("?month=10&year=2026");
    expect(r.completedGoals.map((g) => g.title)).toEqual(["First minutes", "Last minutes"]);
    expect(r.completedGoalsSpentCents).toBe(6_000);
  });
});
