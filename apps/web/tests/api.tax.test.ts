import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integrationstests für GET /api/tax?year=YYYY

const TEST_USER_ID = "test-user-tax";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

let prisma: import("@prisma/client").PrismaClient;
let testUserId: string;
let testAccountId: string;
let testCategoryId: string;

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "tax-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "tax-test@example.com", password: "hashed" }
  });
  testUserId = user.id;

  const account = await prisma.account.upsert({
    where: { id: "acc_tax_test" },
    update: { userId: user.id },
    create: { id: "acc_tax_test", name: "Tax Test Account", userId: user.id }
  });
  testAccountId = account.id;

  const category = await prisma.category.upsert({
    where: { userId_name: { userId: user.id, name: "Tax Test Category" } },
    update: { isTaxRelevant: true },
    create: { name: "Tax Test Category", userId: user.id, isTaxRelevant: true }
  });
  testCategoryId = category.id;

  await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
  await prisma.transaction.createMany({
    data: [
      // 2025: zwei markierte Ausgaben in der Testkategorie
      {
        accountId: testAccountId,
        categoryId: testCategoryId,
        amountCents: -10000,
        description: "Fortbildung 2025",
        occurredAt: new Date(Date.UTC(2025, 2, 15)),
        taxRelevant: true
      },
      {
        accountId: testAccountId,
        categoryId: testCategoryId,
        amountCents: -5000,
        description: "Fachbuch 2025",
        occurredAt: new Date(Date.UTC(2025, 10, 2)),
        taxRelevant: true
      },
      // 2025: markiert, ohne Kategorie
      {
        accountId: testAccountId,
        amountCents: -2500,
        description: "Spende 2025",
        occurredAt: new Date(Date.UTC(2025, 5, 1)),
        taxRelevant: true
      },
      // 2025: NICHT markiert → darf nicht auftauchen
      {
        accountId: testAccountId,
        categoryId: testCategoryId,
        amountCents: -9999,
        description: "Privat 2025",
        occurredAt: new Date(Date.UTC(2025, 6, 1)),
        taxRelevant: false
      },
      // 2026: markiert → nur bei year=2026
      {
        accountId: testAccountId,
        categoryId: testCategoryId,
        amountCents: -7777,
        description: "Fortbildung 2026",
        occurredAt: new Date(Date.UTC(2026, 0, 10)),
        taxRelevant: true
      }
    ]
  });

  // Beleg an eine 2025er-Transaktion hängen (für withReceiptCount)
  const withReceipt = await prisma.transaction.findFirst({
    where: { accountId: testAccountId, description: "Fortbildung 2025" }
  });
  await prisma.attachment.create({
    data: {
      transactionId: withReceipt!.id,
      fileName: "beleg.png",
      mimeType: "image/png",
      sizeBytes: 4,
      data: Buffer.from([1, 2, 3, 4])
    }
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

describe("/api/tax", () => {
  it("returns only tax-relevant transactions of the requested year with category sums", async () => {
    const routes = await import("../app/api/tax/route");

    const res = await routes.GET(new Request("http://localhost/api/tax?year=2025"));
    expect(res.status).toBe(200);
    const body: {
      year: number;
      transactions: Array<{
        id: string;
        description: string;
        amountCents: number;
        attachments: Array<{ id: string; data?: unknown }>;
      }>;
      categorySums: Array<{
        categoryId: string | null;
        categoryName: string | null;
        totalCents: number;
        count: number;
        withReceiptCount: number;
      }>;
    } = await res.json();

    expect(body.year).toBe(2025);
    const descriptions = body.transactions.map((t) => t.description).sort();
    expect(descriptions).toEqual(["Fachbuch 2025", "Fortbildung 2025", "Spende 2025"]);

    // Beleg-Metadaten ohne Bytes
    const withReceipt = body.transactions.find((t) => t.description === "Fortbildung 2025");
    expect(withReceipt?.attachments).toHaveLength(1);
    expect(withReceipt?.attachments[0]?.data).toBeUndefined();

    // Summen: Kategorie (-15000, 2 Stück, 1 mit Beleg) vor "ohne Kategorie" (-2500)
    expect(body.categorySums).toHaveLength(2);
    const categorySum = body.categorySums.find((s) => s.categoryId === testCategoryId);
    expect(categorySum).toMatchObject({
      categoryName: "Tax Test Category",
      totalCents: -15000,
      count: 2,
      withReceiptCount: 1
    });
    const uncategorized = body.categorySums.find((s) => s.categoryId === null);
    expect(uncategorized).toMatchObject({ totalCents: -2500, count: 1, withReceiptCount: 0 });
    // Sortierung nach |totalCents| absteigend
    expect(body.categorySums[0]?.categoryId).toBe(testCategoryId);
  }, 20000);

  it("filters by year and validates the parameter", async () => {
    const routes = await import("../app/api/tax/route");

    const res2026 = await routes.GET(new Request("http://localhost/api/tax?year=2026"));
    expect(res2026.status).toBe(200);
    const body2026: { transactions: Array<{ description: string }> } = await res2026.json();
    expect(body2026.transactions.map((t) => t.description)).toEqual(["Fortbildung 2026"]);

    const badYear = await routes.GET(new Request("http://localhost/api/tax?year=abc"));
    expect(badYear.status).toBe(400);
    const outOfRange = await routes.GET(new Request("http://localhost/api/tax?year=1999"));
    expect(outOfRange.status).toBe(400);
  }, 20000);
});
