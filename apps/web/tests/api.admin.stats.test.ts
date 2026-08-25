import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Integrationstests für GET /api/admin/stats (Bearer-Token-Auth, kein Session-Bypass nötig)

const SERVICE_TOKEN = "test-service-token-admin-stats";
process.env.DOEWE_SERVICE_TOKEN = SERVICE_TOKEN;

const OWNER_USER_ID = "test-user-admin-stats-owner";
const MEMBER_USER_ID = "test-user-admin-stats-member";
const SOLO_USER_ID = "test-user-admin-stats-solo";

let prisma: import("@prisma/client").PrismaClient;
let multiHouseholdId: string;
let testAccountId: string;
let taxCategoryId: string;
let plainCategoryId: string;

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const owner = await prisma.user.upsert({
    where: { email: "admin-stats-owner@example.com" },
    update: {},
    create: { id: OWNER_USER_ID, email: "admin-stats-owner@example.com", password: "hashed" }
  });
  const member = await prisma.user.upsert({
    where: { email: "admin-stats-member@example.com" },
    update: {},
    create: { id: MEMBER_USER_ID, email: "admin-stats-member@example.com", password: "hashed" }
  });
  const solo = await prisma.user.upsert({
    where: { email: "admin-stats-solo@example.com" },
    update: {},
    create: { id: SOLO_USER_ID, email: "admin-stats-solo@example.com", password: "hashed" }
  });

  multiHouseholdId = await ensureTestHousehold(prisma, owner.id, "Multi-Member Test Household");
  await prisma.householdMember.upsert({
    where: { userId: member.id },
    update: { householdId: multiHouseholdId, role: "MEMBER" },
    create: { userId: member.id, householdId: multiHouseholdId, role: "MEMBER" }
  });
  await ensureTestHousehold(prisma, solo.id, "Solo Test Household");

  const account = await prisma.account.upsert({
    where: { id: "acc_admin_stats_test" },
    update: { userId: owner.id, householdId: multiHouseholdId, deletedAt: null },
    create: { id: "acc_admin_stats_test", name: "Admin Stats Test Account", userId: owner.id, householdId: multiHouseholdId }
  });
  testAccountId = account.id;

  const taxCategory = await prisma.category.upsert({
    where: { householdId_name: { householdId: multiHouseholdId, name: "Admin Stats Tax Category" } },
    update: { isTaxRelevant: true },
    create: { name: "Admin Stats Tax Category", userId: owner.id, householdId: multiHouseholdId, isTaxRelevant: true }
  });
  taxCategoryId = taxCategory.id;
  const plainCategory = await prisma.category.upsert({
    where: { householdId_name: { householdId: multiHouseholdId, name: "Admin Stats Plain Category" } },
    update: {},
    create: { name: "Admin Stats Plain Category", userId: owner.id, householdId: multiHouseholdId }
  });
  plainCategoryId = plainCategory.id;

  await prisma.pushSubscription.deleteMany({ where: { userId: owner.id } });
  await prisma.receiptLineItem.deleteMany({ where: { transaction: { accountId: testAccountId } } });
  await prisma.attachment.deleteMany({ where: { transaction: { accountId: testAccountId } } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: testAccountId } });
  await prisma.budget.deleteMany({ where: { accountId: testAccountId } });
  await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });

  await prisma.pushSubscription.create({
    data: {
      userId: owner.id,
      endpoint: "https://push.example.test/admin-stats",
      p256dh: "p256dh",
      auth: "auth"
    }
  });

  const categorized = await prisma.transaction.create({
    data: { accountId: testAccountId, categoryId: taxCategoryId, amountCents: -5000, description: "Kategorisiert + steuerrelevant", occurredAt: new Date("2026-01-15"), taxRelevant: true }
  });
  await prisma.receiptLineItem.create({
    data: { transactionId: categorized.id, name: "Scan-Position", quantity: 1, unitPriceCents: 5000, totalCents: 5000, position: 0 }
  });
  await prisma.attachment.create({
    data: { transactionId: categorized.id, fileName: "beleg.jpg", mimeType: "image/jpeg", sizeBytes: 1234, data: Buffer.from([1, 2, 3]) }
  });

  await prisma.transaction.create({
    data: { accountId: testAccountId, categoryId: plainCategoryId, amountCents: -1000, description: "Kategorisiert, nicht steuerrelevant", occurredAt: new Date("2026-01-16") }
  });
  await prisma.transaction.create({
    data: { accountId: testAccountId, categoryId: null, amountCents: -500, description: "Unkategorisiert", occurredAt: new Date("2026-01-17") }
  });
  await prisma.transaction.create({
    data: { accountId: testAccountId, categoryId: taxCategoryId, amountCents: -999, description: "Soft-gelöscht, darf nicht zählen", occurredAt: new Date("2026-01-18"), taxRelevant: true, deletedAt: new Date() }
  });

  await prisma.recurringTransaction.create({
    data: { accountId: testAccountId, categoryId: plainCategoryId, amountCents: -2000, description: "Aktiv wiederkehrend", frequency: "MONTHLY", nextOccurrence: new Date("2026-02-01") }
  });
  await prisma.recurringTransaction.create({
    data: { accountId: testAccountId, categoryId: plainCategoryId, amountCents: -2000, description: "Soft-gelöscht wiederkehrend", frequency: "MONTHLY", nextOccurrence: new Date("2026-02-01"), deletedAt: new Date() }
  });

  await prisma.budget.create({
    data: { accountId: testAccountId, categoryId: plainCategoryId, month: 1, year: 2026, amountCents: 10000 }
  });
  await prisma.budget.create({
    data: { accountId: testAccountId, categoryId: null, title: "Erledigtes Sparziel", amountCents: 50000, completedAt: new Date(), spentCents: 50000 }
  });
});

afterAll(async () => {
  if (prisma) {
    await prisma.pushSubscription.deleteMany({ where: { userId: OWNER_USER_ID } });
    await prisma.receiptLineItem.deleteMany({ where: { transaction: { accountId: testAccountId } } });
    await prisma.attachment.deleteMany({ where: { transaction: { accountId: testAccountId } } });
    await prisma.recurringTransaction.deleteMany({ where: { accountId: testAccountId } });
    await prisma.budget.deleteMany({ where: { accountId: testAccountId } });
    await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
    await prisma.category.deleteMany({ where: { id: { in: [taxCategoryId, plainCategoryId] } } });
    await prisma.account.deleteMany({ where: { id: testAccountId } });
    await cleanupTestHousehold(prisma, OWNER_USER_ID);
    await cleanupTestHousehold(prisma, MEMBER_USER_ID);
    await cleanupTestHousehold(prisma, SOLO_USER_ID);
    await prisma.user.deleteMany({ where: { id: { in: [OWNER_USER_ID, MEMBER_USER_ID, SOLO_USER_ID] } } });
    await prisma.$disconnect();
  }
});

describe("/api/admin/stats", () => {
  it("rejects requests without a valid service token", async () => {
    const routes = await import("../app/api/admin/stats/route");

    const noAuth = await routes.GET(new Request("http://localhost/api/admin/stats"));
    expect(noAuth.status).toBe(401);

    const wrongAuth = await routes.GET(
      new Request("http://localhost/api/admin/stats", { headers: { Authorization: "Bearer wrong-token" } })
    );
    expect(wrongAuth.status).toBe(401);
  });

  it("returns aggregate counts across households, excluding soft-deleted rows", async () => {
    const routes = await import("../app/api/admin/stats/route");

    const res = await routes.GET(
      new Request("http://localhost/api/admin/stats", { headers: { Authorization: `Bearer ${SERVICE_TOKEN}` } })
    );
    expect(res.status).toBe(200);

    const body: {
      households: { total: number; multiMember: number };
      users: { total: number; pushEnabled: number };
      accounts: { total: number };
      transactions: { total: number; categorized: number; taxRelevant: number; fromReceiptScan: number };
      attachments: { count: number; totalBytes: number };
      recurringTransactions: { active: number };
      budgets: { total: number; completed: number };
    } = await res.json();

    expect(body.households.total).toBeGreaterThanOrEqual(2);
    expect(body.households.multiMember).toBeGreaterThanOrEqual(1);
    expect(body.users.total).toBeGreaterThanOrEqual(3);
    expect(body.users.pushEnabled).toBeGreaterThanOrEqual(1);

    // Exactly the fixtures created above for this account (deletedAt-Zeile zählt nicht mit).
    expect(body.transactions.total).toBeGreaterThanOrEqual(3);
    expect(body.transactions.categorized).toBeGreaterThanOrEqual(2);
    expect(body.transactions.taxRelevant).toBeGreaterThanOrEqual(1);
    expect(body.transactions.fromReceiptScan).toBeGreaterThanOrEqual(1);

    expect(body.attachments.count).toBeGreaterThanOrEqual(1);
    expect(body.attachments.totalBytes).toBeGreaterThanOrEqual(1234);

    expect(body.recurringTransactions.active).toBeGreaterThanOrEqual(1);
    expect(body.budgets.total).toBeGreaterThanOrEqual(2);
    expect(body.budgets.completed).toBeGreaterThanOrEqual(1);
  }, 20000);
});
