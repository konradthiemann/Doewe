// Regression tests for the findings of the independent review of the
// calculation fix: each case failed against the code as first written.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

const TEST_USER_ID = "test-user-review-findings";
const ACCOUNT_A = "acc_review_findings_a";
const ACCOUNT_B = "acc_review_findings_b";
const ACCOUNTS = [ACCOUNT_A, ACCOUNT_B];
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

/** 19 Nov 2031, 11:00 in Berlin. */
const NOW = new Date("2031-11-19T10:00:00.000Z");
const nov = (day: number) => new Date(Date.UTC(2031, 10, day, 11));
const oct = (day: number) => new Date(Date.UTC(2031, 9, day, 10));

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let foodId: string;
let sparenId: string;

async function clean() {
  const budgets = await prisma.budget.findMany({ where: { accountId: { in: ACCOUNTS } }, select: { id: true } });
  await prisma.budgetAlertLog.deleteMany({ where: { budgetId: { in: budgets.map((b) => b.id) } } });
  await prisma.transaction.deleteMany({ where: { accountId: { in: ACCOUNTS } } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: { in: ACCOUNTS } } });
  await prisma.budget.deleteMany({ where: { accountId: { in: ACCOUNTS } } });
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  const user = await prisma.user.upsert({
    where: { email: "review-findings@example.com" },
    update: { notifyBudgetAlerts: true },
    create: { id: TEST_USER_ID, email: "review-findings@example.com", password: "hashed", notifyBudgetAlerts: true }
  });
  householdId = await ensureTestHousehold(prisma, user.id);
  for (const [id, createdAt] of [
    [ACCOUNT_A, "2025-01-01T00:00:00.000Z"],
    [ACCOUNT_B, "2025-06-01T00:00:00.000Z"]
  ] as const) {
    await prisma.account.upsert({
      where: { id },
      update: { userId: user.id, householdId, deletedAt: null },
      create: { id, name: id, userId: user.id, householdId, createdAt: new Date(createdAt) }
    });
  }
  const mk = async (name: string) =>
    (
      await prisma.category.upsert({
        where: { householdId_name: { householdId, name } },
        update: { deletedAt: null },
        create: { name, userId: user.id, householdId }
      })
    ).id;
  foodId = await mk("RF Food");
  sparenId = await mk("Sparen");
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

beforeEach(clean);

afterAll(async () => {
  vi.useRealTimers();
  await clean();
  await prisma.category.deleteMany({ where: { householdId } });
  await prisma.account.deleteMany({ where: { id: { in: ACCOUNTS } } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.$disconnect();
});

async function summary() {
  const { GET } = await import("../app/api/analytics/summary/route");
  const res = await GET();
  expect(res.status).toBe(200);
  return (await res.json()) as {
    categoryBudgets: Array<{ categoryId: string; budget: number; spent: number }>;
  };
}

async function alertThresholds(budgetId: string): Promise<number[]> {
  const { checkBudgetAlerts } = await import("../lib/budgetAlerts");
  await checkBudgetAlerts({ accountId: ACCOUNT_A, userId: TEST_USER_ID, categoryId: foodId, occurredAt: nov(10) });
  const rows = await prisma.budgetAlertLog.findMany({ where: { budgetId }, orderBy: { threshold: "asc" } });
  return rows.map((r) => r.threshold);
}

describe("budget alert vs dashboard budget", () => {
  it("does not warn at 50 % of the budget the dashboard shows (plan 500, stale legacy row 300, spent 250)", async () => {
    const legacy = await prisma.budget.create({
      data: { accountId: ACCOUNT_A, categoryId: foodId, month: 11, year: 2031, amountCents: 30_000 }
    });
    await prisma.categoryBudgetPlan.create({
      data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 50_000 }
    });
    await prisma.transaction.create({
      data: { accountId: ACCOUNT_A, categoryId: foodId, amountCents: -25_000, description: "food", occurredAt: nov(10) }
    });

    const dash = (await summary()).categoryBudgets.find((b) => b.categoryId === foodId);
    expect(dash).toMatchObject({ budget: 500, spent: 250 }); // dashboard: 50 %

    expect(await alertThresholds(legacy.id)).toEqual([]); // alert: 250 / 300 = 83 %
  });

  it("does not warn at 42 % of the household budget (legacy rows 300 + 300 on two accounts, spent 250)", async () => {
    const onA = await prisma.budget.create({
      data: { accountId: ACCOUNT_A, categoryId: foodId, month: 11, year: 2031, amountCents: 30_000 }
    });
    await prisma.budget.create({
      data: { accountId: ACCOUNT_B, categoryId: foodId, month: 11, year: 2031, amountCents: 30_000 }
    });
    await prisma.transaction.create({
      data: { accountId: ACCOUNT_B, categoryId: foodId, amountCents: -25_000, description: "food", occurredAt: nov(10) }
    });

    const dash = (await summary()).categoryBudgets.find((b) => b.categoryId === foodId);
    expect(dash).toMatchObject({ budget: 600, spent: 250 }); // dashboard: 42 %

    expect(await alertThresholds(onA.id)).toEqual([]); // alert: 250 / 300 = 83 %
  });
});

describe("percent rounding (Grundregeln §5: kaufmännisch)", () => {
  it("rounds a savings rate of exactly 14.5 % up to 15", async () => {
    await prisma.transaction.createMany({
      data: [
        { accountId: ACCOUNT_A, amountCents: 300_000, description: "salary", occurredAt: oct(1) },
        { accountId: ACCOUNT_A, categoryId: sparenId, amountCents: -43_500, description: "save", occurredAt: oct(2) }
      ]
    });
    const { GET } = await import("../app/api/analytics/monthly-review/route");
    const res = await GET(new Request("http://localhost/api/analytics/monthly-review?month=10&year=2031"));
    const data = (await res.json()) as { incomeCents: number; savingsCents: number; savingsRatePct: number };
    expect(data).toMatchObject({ incomeCents: 300_000, savingsCents: 43_500 });
    expect(data.savingsRatePct).toBe(15);
  });
});

describe("occurredAt input", () => {
  async function post(occurredAt: string) {
    const { POST } = await import("../app/api/transactions/route");
    const res = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: ACCOUNT_A, amountCents: -100, description: "probe", occurredAt })
      })
    );
    return { status: res.status, body: (await res.json()) as { occurredAt?: string } };
  }

  it("rejects a day typed with a two-digit year instead of storing 19xx", async () => {
    expect((await post("0026-11-19")).status).toBe(400);
    expect((await post("0026-11-19T10:00:00.000Z")).status).toBe(400);
  });

  it("rejects strings that are not ISO dates", async () => {
    expect((await post("31.10.2031")).status).toBe(400);
    expect((await post("Oct 31 2031")).status).toBe(400);
    expect((await post("2031-10-31T25:00:00")).status).toBe(400);
  });

  it("a date-time without zone is read in Berlin, not in the process time zone", async () => {
    // 31 Oct 2031 23:30 wall clock. Read as Berlin time this is still October.
    const { status, body } = await post("2031-10-31T23:30:00");
    expect(status).toBe(201);
    expect(body.occurredAt).toBe("2031-10-31T22:30:00.000Z");
  });
});

describe("nested counts and tombstones (Grundregeln §3)", () => {
  it("category usage count ignores deleted bookings", async () => {
    await prisma.transaction.createMany({
      data: [
        { accountId: ACCOUNT_A, categoryId: foodId, amountCents: -100, description: "live", occurredAt: nov(3) },
        { accountId: ACCOUNT_A, categoryId: foodId, amountCents: -100, description: "gone", occurredAt: nov(4), deletedAt: NOW }
      ]
    });
    const { GET } = await import("../app/api/categories/route");
    const res = await (GET as (req: Request) => Promise<Response>)(new Request("http://localhost/api/categories?sortByUsage=true"));
    const rows = (await res.json()) as Array<{ id: string; usageCount: number }>;
    expect(rows.find((r) => r.id === foodId)?.usageCount).toBe(1);
  });
});

describe("budget alert", () => {
  it("fires at 80 % of the household budget, for the Berlin month of the booking", async () => {
    const legacy = await prisma.budget.create({
      data: { accountId: ACCOUNT_A, categoryId: foodId, month: 11, year: 2031, amountCents: 30_000 }
    });
    // 1 Nov 2031, 00:30 in Berlin — still 31 October in UTC.
    const occurredAt = new Date("2031-10-31T23:30:00.000Z");
    await prisma.transaction.create({
      data: { accountId: ACCOUNT_A, categoryId: foodId, amountCents: -24_000, description: "food", occurredAt }
    });

    const { checkBudgetAlerts } = await import("../lib/budgetAlerts");
    await checkBudgetAlerts({ accountId: ACCOUNT_A, userId: TEST_USER_ID, categoryId: foodId, occurredAt });

    const rows = await prisma.budgetAlertLog.findMany({ where: { budgetId: legacy.id } });
    expect(rows.map((r) => [r.year, r.month, r.threshold])).toEqual([[2031, 11, 80]]);
  });
});

describe("editing only the day of a recurring template", () => {
  it("keeps the Berlin month of an anchor stored at Berlin midnight", async () => {
    const template = await prisma.recurringTransaction.create({
      data: {
        accountId: ACCOUNT_A,
        amountCents: -9_900,
        description: "quarterly insurance",
        frequency: "MONTHLY",
        intervalMonths: 3,
        dayOfMonth: 1,
        // 1 Aug 2031, 00:00 in Berlin — 31 July in UTC
        nextOccurrence: new Date("2031-07-31T22:00:00.000Z")
      }
    });
    const { PATCH } = await import("../app/api/recurring-transactions/[id]/route");
    const res = await PATCH(
      new Request(`http://localhost/api/recurring-transactions/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayOfMonth: 15 })
      }),
      { params: { id: template.id } }
    );
    expect(res.status).toBe(200);
    const updated = await prisma.recurringTransaction.findUniqueOrThrow({ where: { id: template.id } });
    expect(updated.nextOccurrence.toISOString()).toBe("2031-08-15T10:00:00.000Z");
  });

  it("removes the category when null is sent", async () => {
    const template = await prisma.recurringTransaction.create({
      data: {
        accountId: ACCOUNT_A,
        categoryId: foodId,
        amountCents: -1_000,
        description: "with category",
        frequency: "MONTHLY",
        intervalMonths: 1,
        dayOfMonth: 5,
        nextOccurrence: new Date("2031-12-05T11:00:00.000Z")
      }
    });
    const { PATCH } = await import("../app/api/recurring-transactions/[id]/route");
    const res = await PATCH(
      new Request(`http://localhost/api/recurring-transactions/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: null })
      }),
      { params: { id: template.id } }
    );
    expect(res.status).toBe(200);
    const updated = await prisma.recurringTransaction.findUniqueOrThrow({ where: { id: template.id } });
    expect(updated.categoryId).toBeNull();
  });
});

describe("withdrawing from the savings pool", () => {
  it("caps the amount at the pool minus what completed goals reserved", async () => {
    await prisma.transaction.create({
      data: { accountId: ACCOUNT_A, categoryId: sparenId, amountCents: -100_000, description: "deposit", occurredAt: oct(5) }
    });
    await prisma.budget.create({
      data: {
        accountId: ACCOUNT_A,
        categoryId: null,
        title: "done goal",
        amountCents: 60_000,
        month: 10,
        year: 2031,
        completedAt: oct(20),
        spentCents: 60_000
      }
    });
    const { POST } = await import("../app/api/saving-plan/withdraw/route");
    const withdraw = (amountCents: number) =>
      POST(
        new Request("http://localhost/api/saving-plan/withdraw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amountCents })
        })
      );

    const tooMuch = await withdraw(40_001);
    expect(tooMuch.status).toBe(409);
    expect(((await tooMuch.json()) as { availableCents: number }).availableCents).toBe(40_000);
    expect((await withdraw(40_000)).status).toBe(201);
  });
});
