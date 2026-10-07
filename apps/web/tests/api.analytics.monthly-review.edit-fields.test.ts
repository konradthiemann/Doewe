import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// pretest already runs: prisma generate && prisma db push && db:seed

const TEST_USER_ID = "test-user-monthly-review-edit-fields";
const ACCOUNT_ID = "acc_monthly_review_edit_fields_test";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

type ReviewTx = {
  id: string;
  description: string;
  amountCents: number;
  occurredAt: string;
  accountId: string;
  categoryId: string | null;
  taxRelevant: boolean;
};
type ReviewCategory = { id: string; transactions: ReviewTx[] };
type ReviewResponse = { categories: ReviewCategory[] };

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let foodId: string;

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
    where: { email: "monthly-review-edit-fields-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "monthly-review-edit-fields-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id);
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: user.id, householdId },
    create: { id: ACCOUNT_ID, name: "Monthly Review Edit Fields Test", userId: user.id, householdId }
  });

  foodId = (
    await prisma.category.upsert({
      where: { householdId_name: { householdId, name: "MREF Food" } },
      update: {},
      create: { name: "MREF Food", userId: user.id, householdId }
    })
  ).id;

  await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.transaction.createMany({
    data: [
      { accountId: ACCOUNT_ID, amountCents: -5000, description: "ref tax food", occurredAt: day(10), categoryId: foodId, taxRelevant: true },
      { accountId: ACCOUNT_ID, amountCents: -1000, description: "ref plain food", occurredAt: day(11), categoryId: foodId, taxRelevant: false },
      { accountId: ACCOUNT_ID, amountCents: -400, description: "ref tax uncat", occurredAt: day(14), categoryId: null, taxRelevant: true },
      { accountId: ACCOUNT_ID, amountCents: -300, description: "ref plain uncat", occurredAt: day(15), categoryId: null, taxRelevant: false }
    ]
  });
});

afterAll(async () => {
  if (prisma) {
    await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
    await prisma.category.deleteMany({ where: { householdId } });
    await prisma.account.deleteMany({ where: { id: ACCOUNT_ID } });
    await cleanupTestHousehold(prisma, TEST_USER_ID);
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.$disconnect();
  }
});

describe("GET /api/analytics/monthly-review - edit fields on category transactions", () => {
  it("returns accountId, categoryId and taxRelevant for categorized bookings", async () => {
    const body = await fetchReview();
    const food = body.categories.find((c) => c.id === foodId)!;
    const byDesc = Object.fromEntries(food.transactions.map((x) => [x.description, x]));

    expect(byDesc["ref tax food"]).toEqual(
      expect.objectContaining({ accountId: ACCOUNT_ID, categoryId: foodId, taxRelevant: true })
    );
    expect(byDesc["ref plain food"]).toEqual(
      expect.objectContaining({ accountId: ACCOUNT_ID, categoryId: foodId, taxRelevant: false })
    );
  });

  it("returns categoryId null (not 'uncategorized') for uncategorized bookings", async () => {
    const body = await fetchReview();
    const uncat = body.categories.find((c) => c.id === "uncategorized")!;
    expect(uncat.transactions).toHaveLength(2);
    for (const tx of uncat.transactions) {
      expect(tx.categoryId).toBeNull();
      expect(tx.accountId).toBe(ACCOUNT_ID);
    }
    const byDesc = Object.fromEntries(uncat.transactions.map((x) => [x.description, x]));
    expect(byDesc["ref tax uncat"].taxRelevant).toBe(true);
    expect(byDesc["ref plain uncat"].taxRelevant).toBe(false);
  });

  it("always delivers a strict boolean taxRelevant and string accountId", async () => {
    const body = await fetchReview();
    for (const tx of body.categories.flatMap((c) => c.transactions)) {
      expect(typeof tx.taxRelevant).toBe("boolean");
      expect(typeof tx.accountId).toBe("string");
    }
  });

  it("keeps the existing fields intact (additive change)", async () => {
    const body = await fetchReview();
    const food = body.categories.find((c) => c.id === foodId)!;
    expect(food.transactions[0]).toEqual(
      expect.objectContaining({ description: "ref tax food", amountCents: 5000 })
    );
    expect(typeof food.transactions[0].id).toBe("string");
  });
});
