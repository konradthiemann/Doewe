import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// pretest already runs: prisma generate && prisma db push && db:seed

const TEST_USER_ID = "test-user-monthly-review";
const ACCOUNT_ID = "acc_monthly_review_test";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

type ReviewTx = { id: string; description: string; amountCents: number; occurredAt: string };
type ReviewCategory = {
  id: string;
  name: string;
  spentCents: number;
  budgetCents: number | null;
  transactionCount: number;
  transactions: ReviewTx[];
};
type ReviewResponse = { categories: ReviewCategory[]; outcomeCents: number };

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let foodId: string;
let hobbyId: string;
let budgetOnlyId: string;
let salaryId: string;
let savingsId: string;

// Fixed past month: March 2025 (local time, as the route uses local boundaries)
const day = (d: number, h = 12) => new Date(2025, 2, d, h, 0, 0);

async function fetchReview(): Promise<ReviewResponse> {
  const { GET } = await import("../app/api/analytics/monthly-review/route");
  const res = await GET(new Request("http://localhost/api/analytics/monthly-review?month=3&year=2025"));
  expect(res.status).toBe(200);
  return (await res.json()) as ReviewResponse;
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "monthly-review-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "monthly-review-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id);
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: user.id, householdId },
    create: { id: ACCOUNT_ID, name: "Monthly Review Test", userId: user.id, householdId }
  });

  const mk = async (name: string) =>
    (
      await prisma.category.upsert({
        where: { householdId_name: { householdId, name } },
        update: {},
        create: { name, userId: user.id, householdId }
      })
    ).id;
  foodId = await mk("MR Food");
  hobbyId = await mk("MR Hobby");
  budgetOnlyId = await mk("MR BudgetOnly");
  salaryId = await mk("MR Salary");
  savingsId = await mk("Savings");

  await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.budget.deleteMany({ where: { accountId: ACCOUNT_ID } });

  const t = (
    amountCents: number,
    description: string,
    occurredAt: Date,
    categoryId: string | null,
    extra: { deletedAt?: Date } = {}
  ) => ({ accountId: ACCOUNT_ID, amountCents, description, occurredAt, categoryId, ...extra });

  await prisma.transaction.createMany({
    data: [
      // Food: sorted by amount desc; tie (2000) -> occurredAt asc
      t(-1000, "food small", day(2), foodId),
      t(-5000, "food big", day(10), foodId),
      t(-2000, "food tie late", day(20), foodId),
      t(-2000, "food tie early", day(5), foodId),
      // Soft-deleted expense must not appear and not count
      t(-9999, "food deleted", day(7), foodId, { deletedAt: new Date(2025, 2, 8) }),
      // Outside month
      t(-7777, "food february", new Date(2025, 1, 27, 12), foodId),
      t(-7777, "food april", new Date(2025, 3, 1, 12), foodId),
      // Hobby
      t(-3000, "hobby one", day(12), hobbyId),
      // Uncategorized
      t(-400, "uncat one", day(14), null),
      // Savings must be excluded
      t(-15000, "savings deposit", day(15), savingsId),
      // Income must not appear in categories
      t(200000, "salary", day(1), salaryId)
    ]
  });

  await prisma.budget.create({
    data: { accountId: ACCOUNT_ID, categoryId: budgetOnlyId, month: 3, year: 2025, amountCents: 5000 }
  });
});

afterAll(async () => {
  if (prisma) {
    await prisma.budget.deleteMany({ where: { accountId: ACCOUNT_ID } });
    await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
    await prisma.category.deleteMany({ where: { householdId } });
    await prisma.account.deleteMany({ where: { id: ACCOUNT_ID } });
    await cleanupTestHousehold(prisma, TEST_USER_ID);
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.$disconnect();
  }
});

describe("GET /api/analytics/monthly-review - category transactions", () => {
  it("adds transactions to each category as positive amounts with ISO dates", async () => {
    const body = await fetchReview();
    const food = body.categories.find((c) => c.id === foodId);
    expect(food).toBeDefined();
    const first = food!.transactions[0];
    expect(typeof first.id).toBe("string");
    expect(first.description).toBe("food big");
    expect(first.amountCents).toBe(5000);
    expect(new Date(first.occurredAt).toISOString()).toBe(first.occurredAt);
    expect(new Date(first.occurredAt).getTime()).toBe(day(10).getTime());
  });

  it("sorts by amount descending, ties by occurredAt ascending", async () => {
    const body = await fetchReview();
    const food = body.categories.find((c) => c.id === foodId)!;
    expect(food.transactions.map((x) => x.description)).toEqual([
      "food big",
      "food tie early",
      "food tie late",
      "food small"
    ]);
  });

  it("excludes soft-deleted transactions and keeps spent/count consistent", async () => {
    const body = await fetchReview();
    const food = body.categories.find((c) => c.id === foodId)!;
    expect(food.transactions.some((x) => x.description === "food deleted")).toBe(false);
    expect(food.spentCents).toBe(10000);
    expect(food.transactionCount).toBe(4);
    expect(food.transactions).toHaveLength(food.transactionCount);
  });

  it("only includes transactions of the selected month", async () => {
    const body = await fetchReview();
    const all = body.categories.flatMap((c) => c.transactions.map((x) => x.description));
    expect(all).not.toContain("food february");
    expect(all).not.toContain("food april");
  });

  it("excludes the savings category and income from transactions", async () => {
    const body = await fetchReview();
    const all = body.categories.flatMap((c) => c.transactions.map((x) => x.description));
    expect(all).not.toContain("savings deposit");
    expect(all).not.toContain("salary");
    expect(body.categories.find((c) => c.id === salaryId)).toBeUndefined();
    expect(body.categories.find((c) => c.id === savingsId)).toBeUndefined();
  });

  it("gives the uncategorized entry its transactions", async () => {
    const body = await fetchReview();
    const uncat = body.categories.find((c) => c.id === "uncategorized");
    expect(uncat).toBeDefined();
    expect(uncat!.transactions).toEqual([
      expect.objectContaining({ description: "uncat one", amountCents: 400 })
    ]);
    expect(uncat!.transactionCount).toBe(uncat!.transactions.length);
  });

  it("returns an empty transactions array for budget-only categories", async () => {
    const body = await fetchReview();
    const budgetOnly = body.categories.find((c) => c.id === budgetOnlyId);
    expect(budgetOnly).toBeDefined();
    expect(budgetOnly!.budgetCents).toBe(5000);
    expect(budgetOnly!.transactions).toEqual([]);
    expect(budgetOnly!.transactionCount).toBe(0);
  });

  it("keeps transactionCount equal to transactions.length for every category", async () => {
    const body = await fetchReview();
    for (const c of body.categories) {
      expect(c.transactions).toHaveLength(c.transactionCount);
    }
  });

  it("returns 401 for a user without a household", async () => {
    process.env.TEST_USER_ID_BYPASS = "test-user-monthly-review-no-household";
    vi.resetModules();
    const { GET } = await import("../app/api/analytics/monthly-review/route");
    const res = await GET(new Request("http://localhost/api/analytics/monthly-review?month=3&year=2025"));
    expect(res.status).toBe(401);
    process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;
    vi.resetModules();
  });
});
