import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Integrationstests für POST /api/receipt-scan (Issue #53).
// pretest hat Schema + Seed bereits gepusht; echte Postgres nötig.
//
// env.ts friert process.env beim ersten Import ein (@t3-oss/env-nextjs), daher
// wird ANTHROPIC_API_KEY pro Testfall über vi.resetModules() + dynamischen
// Import umgeschaltet. lib/receiptParser wird per vi.doMock() ersetzt (nur die
// parse-Funktion — ReceiptParseError bleibt über vi.importActual() echt).

const TEST_USER_ID = "test-user-receipt-scan";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

const FIXED_RESULT = {
  merchant: "REWE",
  date: "2026-08-19",
  items: [{ name: "Milch", quantity: 1, unitPriceCents: 149, totalCents: 149, suggestedCategory: null }],
  subtotalCents: 149,
  taxCents: null,
  totalCents: 149,
  confidence: "high" as const
};

let prisma: import("@prisma/client").PrismaClient;
let testUserId: string;
let testHouseholdId: string;
let testCategoryId: string;

function makeScanRequest(file: File): Request {
  const form = new FormData();
  form.append("file", file);
  return new Request("http://localhost/api/receipt-scan", { method: "POST", body: form });
}

/** Fresh module graph per case so a freshly re-evaluated env.ts picks up the
 * current ANTHROPIC_API_KEY. */
async function loadRoute() {
  vi.resetModules();
  return import("../app/api/receipt-scan/route");
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "receipt-scan-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "receipt-scan-test@example.com", password: "hashed" }
  });
  testUserId = user.id;
  testHouseholdId = await ensureTestHousehold(prisma, user.id);

  const category = await prisma.category.upsert({
    where: { householdId_name: { householdId: testHouseholdId, name: "Receipt Scan Groceries" } },
    update: {},
    create: { name: "Receipt Scan Groceries", userId: user.id, householdId: testHouseholdId }
  });
  testCategoryId = category.id;
});

afterAll(async () => {
  if (prisma) {
    await prisma.category.deleteMany({ where: { id: testCategoryId } });
    await cleanupTestHousehold(prisma, testUserId);
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
  }
});

describe("POST /api/receipt-scan", () => {
  it("returns the parsed result when ANTHROPIC_API_KEY is set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const mockParse = vi.fn().mockResolvedValue(FIXED_RESULT);
    vi.doMock("../lib/receiptParser", () => ({ parseReceiptImage: mockParse }));

    const { POST } = await loadRoute();
    const file = new File([PNG_BYTES], "receipt.png", { type: "image/png" });
    const res = await POST(makeScanRequest(file));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.merchant).toBe("REWE");
    expect(body.items).toHaveLength(1);
    expect(body.totalCents).toBe(149);
    expect(body._stub).toBeUndefined();

    expect(mockParse).toHaveBeenCalledTimes(1);
    const call = mockParse.mock.calls[0][0];
    expect(call.mimeType).toBe("image/png");
    expect(call.categoryNames).toContain("Receipt Scan Groceries");

    vi.doUnmock("../lib/receiptParser");
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("falls back to the stub without calling Claude when ANTHROPIC_API_KEY is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const mockParse = vi.fn();
    vi.doMock("../lib/receiptParser", () => ({ parseReceiptImage: mockParse }));

    const { POST } = await loadRoute();
    const file = new File([PNG_BYTES], "receipt.png", { type: "image/png" });
    const res = await POST(makeScanRequest(file));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._stub).toBe(true);
    expect(body.items).toEqual([]);
    expect(mockParse).not.toHaveBeenCalled();

    vi.doUnmock("../lib/receiptParser");
  });

  it("returns 502 AI_UNAVAILABLE when Claude Vision parsing fails", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    vi.doMock("../lib/receiptParser", async () => {
      const actual = await vi.importActual<typeof import("../lib/receiptParser")>("../lib/receiptParser");
      return {
        ...actual,
        parseReceiptImage: vi.fn().mockRejectedValue(new actual.ReceiptParseError("structured output invalid"))
      };
    });

    const { POST } = await loadRoute();
    const file = new File([PNG_BYTES], "receipt.png", { type: "image/png" });
    const res = await POST(makeScanRequest(file));

    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("AI_UNAVAILABLE");

    vi.doUnmock("../lib/receiptParser");
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("rejects when no file is provided", async () => {
    const { POST } = await loadRoute();
    const res = await POST(new Request("http://localhost/api/receipt-scan", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(400);
  });

  it("rejects unsupported MIME types", async () => {
    const { POST } = await loadRoute();
    const file = new File([PNG_BYTES], "notes.txt", { type: "text/plain" });
    const res = await POST(makeScanRequest(file));
    expect(res.status).toBe(415);
  });

  it("rejects files over the size limit", async () => {
    const { POST } = await loadRoute();
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    const res = await POST(makeScanRequest(big));
    expect(res.status).toBe(413);
  });

  it("rejects unauthenticated requests", async () => {
    // Calling the real getServerSession() outside a Next.js request context
    // throws (no request-scoped headers()), so — same convention as
    // api.auth.password.test.ts — a bypass user id without a household
    // membership exercises the same `if (!user) return 401` guard instead.
    process.env.TEST_USER_ID_BYPASS = "test-user-receipt-scan-no-household";
    const { POST } = await loadRoute();
    const file = new File([PNG_BYTES], "receipt.png", { type: "image/png" });
    const res = await POST(makeScanRequest(file));
    expect(res.status).toBe(401);
    process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;
  });
});
