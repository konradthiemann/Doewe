import { decideFlushStep } from "@doewe/shared";
import { createId } from "@paralleldrive/cuid2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// POST /api/transactions must answer every input that cannot be stored with a
// 400, never a 500: the offline outbox halts on any 5xx (to keep the order),
// so one such entry would block every later offline booking forever.

const TEST_USER_ID = "test-user-tx-validation";
const ACCOUNT_ID = "acc_tx_validation";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

let prisma: import("@prisma/client").PrismaClient;

const valid = {
  accountId: ACCOUNT_ID,
  amountCents: -1_250,
  description: "Bäcker",
  occurredAt: "2026-11-19T10:00:00.000Z"
};

async function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const { POST } = await import("../app/api/transactions/route");
  return POST(
    new Request("http://localhost/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body)
    })
  );
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "tx-validation-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "tx-validation-test@example.com", password: "hashed" }
  });
  const householdId = await ensureTestHousehold(prisma, user.id);
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: user.id, householdId, deletedAt: null },
    create: { id: ACCOUNT_ID, name: "TX Validation Account", userId: user.id, householdId }
  });
  await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.mutationLog.deleteMany({ where: { userId: TEST_USER_ID } });
});

afterAll(async () => {
  if (prisma) {
    await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
    await prisma.mutationLog.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.account.deleteMany({ where: { id: ACCOUNT_ID } });
    await cleanupTestHousehold(prisma, TEST_USER_ID);
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.$disconnect();
  }
});

describe("POST /api/transactions — input that cannot be stored is a 400", () => {
  it.each([
    ["only spaces", "   "],
    ["only tabs and line breaks", "\t\n "],
    ["empty", ""],
    ["a NUL character", "Bäcker\u0000"],
    ["half a surrogate pair", "Bäcker \ud83d"]
  ])("rejects a description that is %s", async (_label, description) => {
    const res = await post({ ...valid, description });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { fieldErrors: Record<string, string[]> } };
    expect(body.error.fieldErrors.description).toBeDefined();
  });

  it("trims the description and keeps emoji", async () => {
    const res = await post({ ...valid, description: "  Eis 🍦  " });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { description: string }).description).toBe("Eis 🍦");
  });

  it.each([
    ["above the int4 range", 2_147_483_648],
    ["below the int4 range", -2_147_483_649],
    ["far beyond", 99_999_999_999_999],
    ["not an integer", -12.5]
  ])("rejects an amount %s", async (_label, amountCents) => {
    const res = await post({ ...valid, amountCents });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { fieldErrors: Record<string, string[]> } };
    expect(body.error.fieldErrors.amountCents).toBeDefined();
  });

  it.each([
    ["the largest", 2_147_483_647],
    ["the smallest", -2_147_483_648]
  ])("accepts %s int4 amount", async (_label, amountCents) => {
    const res = await post({ ...valid, amountCents });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { amountCents: number }).amountCents).toBe(amountCents);
  });

  it.each([
    ["not a date", "gestern"],
    ["empty", ""],
    ["a day that does not exist", "2026-02-30"],
    ["month 13", "2026-13-01"],
    ["a year Prisma cannot pass on", "+020261-11-19T10:00:00.000Z"],
    ["a negative year", "-000001-01-01T00:00:00.000Z"],
    ["a number", 1_795_000_000_000],
    ["null", null]
  ])("rejects an occurredAt that is %s", async (_label, occurredAt) => {
    const res = await post({ ...valid, occurredAt });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { fieldErrors: Record<string, string[]> } };
    expect(body.error.fieldErrors.occurredAt).toBeDefined();
  });

  it("stores an ISO instant unchanged", async () => {
    // 31 Oct 2026, 23:45 in Berlin
    const res = await post({ ...valid, occurredAt: "2026-10-31T22:45:00.000Z" });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { occurredAt: string }).occurredAt).toBe("2026-10-31T22:45:00.000Z");
  });

  it.each([
    ["in winter (CET)", "2026-01-15", "2026-01-15T11:00:00.000Z"],
    ["in summer (CEST)", "2026-07-01", "2026-07-01T10:00:00.000Z"],
    ["on the day the clocks go forward", "2026-03-29", "2026-03-29T10:00:00.000Z"],
    ["on the day the clocks go back", "2026-10-25", "2026-10-25T11:00:00.000Z"],
    ["on a leap day", "2028-02-29", "2028-02-29T11:00:00.000Z"]
  ])("stores a bare calendar day %s as noon in Berlin", async (_label, occurredAt, expected) => {
    const res = await post({ ...valid, occurredAt });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { occurredAt: string }).occurredAt).toBe(expected);
  });

  it.each([
    ["a body that is not JSON", "{not json"],
    ["an empty body", ""],
    ["a JSON array", []],
    ["JSON null", null]
  ])("rejects %s", async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/transactions — a rejected outbox entry does not block the queue", () => {
  it("drops the bad entry (4xx) and books the one queued after it", async () => {
    const before = await prisma.transaction.count({ where: { accountId: ACCOUNT_ID } });

    const badEntries = [
      { ...valid, id: createId(), description: "   " },
      { ...valid, id: createId(), amountCents: 5_000_000_000 },
      { ...valid, id: createId(), occurredAt: "kein Datum" }
    ];
    for (const entry of badEntries) {
      const res = await post(entry, { "Idempotency-Key": createId() });
      expect(res.status).toBe(400);
      // The outbox drops the entry and goes on; a 5xx would halt it.
      expect(decideFlushStep(res.status)).toEqual({ action: "drop" });
    }

    const goodId = createId();
    const good = await post({ ...valid, id: goodId, description: "Danach gebucht" }, { "Idempotency-Key": createId() });
    expect(good.status).toBe(201);
    expect(decideFlushStep(good.status)).toEqual({ action: "remove" });

    // Nothing of the rejected entries reached the database.
    const rows = await prisma.transaction.findMany({
      where: { id: { in: [...badEntries.map((e) => e.id), goodId] } },
      select: { id: true }
    });
    expect(rows.map((r) => r.id)).toEqual([goodId]);
    expect(await prisma.transaction.count({ where: { accountId: ACCOUNT_ID } })).toBe(before + 1);
  });
});
