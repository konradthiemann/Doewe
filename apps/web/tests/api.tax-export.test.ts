import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Integrationstests für GET /api/tax/export?year=YYYY&includeReceipts=0|1
// pretest hat Schema + Seed bereits gepusht; echte Postgres nötig.

const TEST_USER_ID = "test-user-tax-export";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2,
  0, 0, 0, 0x90, 0x77, 0x53, 0xde, 0, 0, 0, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xfa, 0xcf, 0xc0, 0, 0, 0,
  3, 0, 1, 0x6d, 0x25, 0x2c, 0xec, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
]);
const WEBP_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3, 4]);
const CORRUPT_PNG_BYTES = new Uint8Array([1, 2, 3, 4]);

let prisma: import("@prisma/client").PrismaClient;
let testUserId: string;
let testHouseholdId: string;
let testAccountId: string;
let testCategoryId: string;
let otherUserId: string;
let otherHouseholdId: string;
let otherAccountId: string;

function req(query: string): Request {
  return new Request(`http://localhost/api/tax/export?${query}`);
}

async function loadPdf(res: Response) {
  const buffer = new Uint8Array(await res.arrayBuffer());
  const doc = await PDFDocument.load(buffer);
  return { buffer, doc };
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "tax-export-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "tax-export-test@example.com", password: "hashed" }
  });
  testUserId = user.id;
  testHouseholdId = await ensureTestHousehold(prisma, user.id, "Tax Export Household");

  const account = await prisma.account.upsert({
    where: { id: "acc_tax_export_test" },
    update: { userId: user.id, householdId: testHouseholdId },
    create: { id: "acc_tax_export_test", name: "Tax Export Test Account", userId: user.id, householdId: testHouseholdId }
  });
  testAccountId = account.id;

  const category = await prisma.category.upsert({
    where: { householdId_name: { householdId: testHouseholdId, name: "Tax Export Category" } },
    update: { isTaxRelevant: true },
    create: { name: "Tax Export Category", userId: user.id, householdId: testHouseholdId, isTaxRelevant: true }
  });
  testCategoryId = category.id;

  await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });

  const withPng = await prisma.transaction.create({
    data: {
      accountId: testAccountId,
      categoryId: testCategoryId,
      amountCents: -18900,
      description: "Fachbuch mit Beleg",
      occurredAt: new Date(Date.UTC(2025, 2, 15)),
      taxRelevant: true
    }
  });
  await prisma.attachment.create({
    data: { transactionId: withPng.id, fileName: "receipt.png", mimeType: "image/png", sizeBytes: PNG_BYTES.byteLength, data: Buffer.from(PNG_BYTES) }
  });

  const withWebp = await prisma.transaction.create({
    data: {
      accountId: testAccountId,
      categoryId: testCategoryId,
      amountCents: -5000,
      description: "Beleg als WebP",
      occurredAt: new Date(Date.UTC(2025, 5, 1)),
      taxRelevant: true
    }
  });
  await prisma.attachment.create({
    data: { transactionId: withWebp.id, fileName: "receipt.webp", mimeType: "image/webp", sizeBytes: WEBP_BYTES.byteLength, data: Buffer.from(WEBP_BYTES) }
  });

  await prisma.transaction.create({
    data: {
      accountId: testAccountId,
      amountCents: -2500,
      description: "Ohne Beleg",
      occurredAt: new Date(Date.UTC(2025, 6, 1)),
      taxRelevant: true
    }
  });

  // Nicht steuerrelevant → darf nicht auftauchen
  await prisma.transaction.create({
    data: {
      accountId: testAccountId,
      amountCents: -9999,
      description: "Privat 2025",
      occurredAt: new Date(Date.UTC(2025, 6, 2)),
      taxRelevant: false
    }
  });

  // Fremder Haushalt — darf im Export von testUser nicht auftauchen
  const otherUser = await prisma.user.upsert({
    where: { email: "tax-export-other@example.com" },
    update: {},
    create: { id: "test-user-tax-export-other", email: "tax-export-other@example.com", password: "hashed" }
  });
  otherUserId = otherUser.id;
  otherHouseholdId = await ensureTestHousehold(prisma, otherUser.id, "Other Tax Export Household");
  const otherAccount = await prisma.account.upsert({
    where: { id: "acc_tax_export_other" },
    update: { userId: otherUser.id, householdId: otherHouseholdId },
    create: { id: "acc_tax_export_other", name: "Other Account", userId: otherUser.id, householdId: otherHouseholdId }
  });
  otherAccountId = otherAccount.id;
  const otherTx = await prisma.transaction.create({
    data: {
      accountId: otherAccountId,
      amountCents: -12345,
      description: "Fremde Transaktion",
      occurredAt: new Date(Date.UTC(2025, 3, 1)),
      taxRelevant: true
    }
  });
  await prisma.attachment.create({
    data: { transactionId: otherTx.id, fileName: "foreign.pdf", mimeType: "application/pdf", sizeBytes: 10, data: Buffer.from([1, 2, 3]) }
  });
});

afterAll(async () => {
  if (prisma) {
    await prisma.transaction.deleteMany({ where: { accountId: { in: [testAccountId, otherAccountId] } } });
    await prisma.category.deleteMany({ where: { id: testCategoryId } });
    await prisma.account.deleteMany({ where: { id: { in: [testAccountId, otherAccountId] } } });
    await cleanupTestHousehold(prisma, testUserId);
    await cleanupTestHousehold(prisma, otherUserId);
    await prisma.user.deleteMany({ where: { id: { in: [testUserId, otherUserId] } } });
    await prisma.$disconnect();
  }
});

describe("/api/tax/export", () => {
  it("renders a PDF with cover page, table and receipt appendix (F1)", async () => {
    const { GET } = await import("../app/api/tax/export/route");

    const res = await GET(req("year=2025&includeReceipts=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain('filename="steuer-2025.pdf"');
    expect(res.headers.get("Cache-Control")).toContain("no-store");

    const { buffer, doc } = await loadPdf(res);
    expect(new TextDecoder().decode(buffer.slice(0, 5))).toBe("%PDF-");

    // Cover (1) + table (1) + png receipt (1) + webp placeholder (1) = 4.
    // The foreign household's attachment must NOT add a 5th page (household scoping).
    expect(doc.getPageCount()).toBe(4);
  }, 20000);

  it("omits the receipt appendix when includeReceipts=0", async () => {
    const { GET } = await import("../app/api/tax/export/route");

    const withReceipts = await GET(req("year=2025&includeReceipts=1"));
    const withoutReceipts = await GET(req("year=2025&includeReceipts=0"));
    expect(withoutReceipts.status).toBe(200);

    const withBuffer = new Uint8Array(await withReceipts.arrayBuffer());
    const withoutBuffer = new Uint8Array(await withoutReceipts.arrayBuffer());
    const withoutDoc = await PDFDocument.load(withoutBuffer);

    expect(withoutDoc.getPageCount()).toBe(2); // cover + table, no appendix
    expect(withoutBuffer.byteLength).toBeLessThan(withBuffer.byteLength);
  }, 20000);

  it("renders a cover-page-only PDF for a year with no tax-relevant transactions", async () => {
    const { GET } = await import("../app/api/tax/export/route");

    const res = await GET(req("year=2019"));
    expect(res.status).toBe(200);
    const { doc } = await loadPdf(res);
    expect(doc.getPageCount()).toBe(1);
  }, 20000);

  it("validates the year parameter", async () => {
    const { GET } = await import("../app/api/tax/export/route");

    const badYear = await GET(req("year=abc"));
    expect(badYear.status).toBe(400);
    const outOfRange = await GET(req("year=1999"));
    expect(outOfRange.status).toBe(400);
  }, 20000);

  it("rejects unauthenticated requests", async () => {
    // Same convention as api.receipt-scan.test.ts: a bypass user id without a
    // household membership exercises the `if (!user) return 401` guard, since
    // the real getServerSession() throws outside a Next.js request context.
    process.env.TEST_USER_ID_BYPASS = "test-user-tax-export-no-household";
    vi.resetModules();
    const { GET } = await import("../app/api/tax/export/route");
    const res = await GET(req("year=2025"));
    expect(res.status).toBe(401);
    process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;
    vi.resetModules();
  }, 20000);

  it("returns 413 with size details when the receipt budget is exceeded (F2)", async () => {
    const { GET } = await import("../app/api/tax/export/route");

    // Only `sizeBytes` (the metadata the budget check sums) needs to exceed
    // the limit — the real bytes stay tiny so the test doesn't write 50MB+
    // into Postgres. This matches the route: it sums sizeBytes BEFORE loading
    // any bytes.
    const oversizedTx = await prisma.transaction.create({
      data: {
        accountId: testAccountId,
        amountCents: -100,
        description: "Riesenbeleg",
        occurredAt: new Date(Date.UTC(2025, 7, 1)),
        taxRelevant: true
      }
    });
    await prisma.attachment.create({
      data: {
        transactionId: oversizedTx.id,
        fileName: "big.png",
        mimeType: "image/png",
        sizeBytes: 60 * 1024 * 1024,
        data: Buffer.from(PNG_BYTES)
      }
    });

    const res = await GET(req("year=2025&includeReceipts=1"));
    expect(res.status).toBe(413);
    const body: { error: string; totalBytes: number; limitBytes: number } = await res.json();
    expect(body.limitBytes).toBe(50 * 1024 * 1024);
    expect(body.totalBytes).toBeGreaterThan(body.limitBytes);

    // Without receipts, the same year still exports fine (budget only applies to includeReceipts=1).
    const withoutReceipts = await GET(req("year=2025&includeReceipts=0"));
    expect(withoutReceipts.status).toBe(200);

    await prisma.transaction.delete({ where: { id: oversizedTx.id } });
  }, 20000);

  it("falls back to a placeholder page for a corrupt receipt instead of failing the export", async () => {
    const { GET } = await import("../app/api/tax/export/route");

    const corruptTx = await prisma.transaction.create({
      data: {
        accountId: testAccountId,
        amountCents: -100,
        description: "Kaputter Beleg",
        occurredAt: new Date(Date.UTC(2025, 8, 1)),
        taxRelevant: true
      }
    });
    await prisma.attachment.create({
      data: {
        transactionId: corruptTx.id,
        fileName: "corrupt.png",
        mimeType: "image/png",
        sizeBytes: CORRUPT_PNG_BYTES.byteLength,
        data: Buffer.from(CORRUPT_PNG_BYTES)
      }
    });

    const res = await GET(req("year=2025&includeReceipts=1"));
    expect(res.status).toBe(200);
    const { doc } = await loadPdf(res);
    // Previous 4 pages + 1 placeholder page for the corrupt receipt.
    expect(doc.getPageCount()).toBe(5);

    await prisma.transaction.delete({ where: { id: corruptTx.id } });
  }, 20000);
});
