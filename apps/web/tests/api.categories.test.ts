import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integrationstests für den Steuer-Backfill in PATCH /api/categories/[id]:
// Kategorie steuerrelevant markieren → alle bestehenden Transaktionen der
// Kategorie werden rückwirkend vorgemerkt; Abwählen lässt die Flags stehen.

const TEST_USER_ID = "test-user-cat";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

let prisma: import("@prisma/client").PrismaClient;
let testUserId: string;
let testAccountId: string;
let testCategoryId: string;

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "cat-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "cat-test@example.com", password: "hashed" }
  });
  testUserId = user.id;

  const account = await prisma.account.upsert({
    where: { id: "acc_cat_test" },
    update: { userId: user.id },
    create: { id: "acc_cat_test", name: "Cat Test Account", userId: user.id }
  });
  testAccountId = account.id;

  const category = await prisma.category.upsert({
    where: { userId_name: { userId: user.id, name: "Cat Backfill Category" } },
    update: { isTaxRelevant: false },
    create: { name: "Cat Backfill Category", userId: user.id }
  });
  testCategoryId = category.id;

  await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
  await prisma.transaction.createMany({
    data: [
      {
        accountId: testAccountId,
        categoryId: testCategoryId,
        amountCents: -1000,
        description: "Backfill A",
        occurredAt: new Date(Date.UTC(2026, 1, 1))
      },
      {
        accountId: testAccountId,
        categoryId: testCategoryId,
        amountCents: -2000,
        description: "Backfill B",
        occurredAt: new Date(Date.UTC(2026, 2, 1))
      },
      // Ohne Kategorie — darf vom Backfill nicht berührt werden
      {
        accountId: testAccountId,
        amountCents: -3000,
        description: "Uncategorized",
        occurredAt: new Date(Date.UTC(2026, 3, 1))
      }
    ]
  });
});

afterAll(async () => {
  if (prisma) {
    await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
    await prisma.category.deleteMany({ where: { id: testCategoryId } });
    await prisma.account.deleteMany({ where: { id: testAccountId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
  }
});

describe("PATCH /api/categories/[id] — taxRelevant backfill", () => {
  it("marks all existing transactions of the category when isTaxRelevant is enabled", async () => {
    const routes = await import("../app/api/categories/[id]/route");

    const res = await routes.PATCH(
      new Request(`http://localhost/api/categories/${testCategoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTaxRelevant: true })
      }),
      { params: { id: testCategoryId } }
    );
    expect(res.status).toBe(200);
    const updated: { isTaxRelevant: boolean } = await res.json();
    expect(updated.isTaxRelevant).toBe(true);

    const flagged = await prisma.transaction.count({
      where: { categoryId: testCategoryId, taxRelevant: true }
    });
    expect(flagged).toBe(2);

    const untouched = await prisma.transaction.findFirst({
      where: { accountId: testAccountId, description: "Uncategorized" }
    });
    expect(untouched?.taxRelevant).toBe(false);
  }, 20000);

  it("keeps transaction flags when the category is unmarked", async () => {
    const routes = await import("../app/api/categories/[id]/route");

    const res = await routes.PATCH(
      new Request(`http://localhost/api/categories/${testCategoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTaxRelevant: false })
      }),
      { params: { id: testCategoryId } }
    );
    expect(res.status).toBe(200);

    const stillFlagged = await prisma.transaction.count({
      where: { categoryId: testCategoryId, taxRelevant: true }
    });
    expect(stillFlagged).toBe(2);
  }, 20000);
});
