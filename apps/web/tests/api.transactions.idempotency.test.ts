import { createId } from "@paralleldrive/cuid2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Use the same DATABASE_URL as the main app (set by pretest or .env)
// pretest already runs: prisma generate && prisma db push && db:seed

const TEST_USER_ID = "test-user-idem";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

let prisma: import("@prisma/client").PrismaClient;
let testUserId: string;
let testHouseholdId: string;
let testAccountId: string;

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "idem-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "idem-test@example.com", password: "hashed" }
  });
  testUserId = user.id;
  testHouseholdId = await ensureTestHousehold(prisma, user.id);

  const account = await prisma.account.upsert({
    where: { id: "acc_idem_test" },
    update: { userId: user.id, householdId: testHouseholdId },
    create: { id: "acc_idem_test", name: "Idempotency Test Account", userId: user.id, householdId: testHouseholdId }
  });
  testAccountId = account.id;

  await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
  await prisma.mutationLog.deleteMany({ where: { userId: testUserId } });
});

afterAll(async () => {
  if (prisma) {
    await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
    await prisma.mutationLog.deleteMany({ where: { userId: testUserId } });
    await prisma.account.deleteMany({ where: { id: testAccountId } });
    await cleanupTestHousehold(prisma, testUserId);
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
  }
});

function makeRequest(body: unknown, idempotencyKey?: string) {
  return new Request("http://localhost/api/transactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
    },
    body: JSON.stringify(body)
  });
}

describe("/api/transactions Idempotenz (Offline-Outbox)", () => {
  it("bucht denselben Idempotency-Key nur einmal und replayed die Antwort", async () => {
    const routes = await import("../app/api/transactions/route");
    const clientId = createId();
    const mutationId = crypto.randomUUID();
    const body = {
      id: clientId,
      accountId: testAccountId,
      amountCents: -1234,
      description: "Offline-Einkauf",
      occurredAt: new Date().toISOString()
    };

    const first = await routes.POST(makeRequest(body, mutationId));
    expect(first.status).toBe(201);
    const firstJson: { id: string } = await first.json();
    expect(firstJson.id).toBe(clientId);

    // Replay: gleicher Batch nochmal (z. B. Netzabbruch nach Commit)
    const second = await routes.POST(makeRequest(body, mutationId));
    expect(second.status).toBe(201);
    const secondJson: { id: string } = await second.json();
    expect(secondJson.id).toBe(clientId);

    // Exakt EINE Transaktion und EIN Log-Eintrag
    const txCount = await prisma.transaction.count({ where: { id: clientId } });
    expect(txCount).toBe(1);
    const logCount = await prisma.mutationLog.count({ where: { mutationId } });
    expect(logCount).toBe(1);
  });

  it("akzeptiert client-seitige cuid2-IDs und lehnt Kollisionen mit 409 ab", async () => {
    const routes = await import("../app/api/transactions/route");
    const clientId = createId();
    const body = {
      id: clientId,
      accountId: testAccountId,
      amountCents: -500,
      description: "Erste Buchung",
      occurredAt: new Date().toISOString()
    };

    const first = await routes.POST(makeRequest(body, crypto.randomUUID()));
    expect(first.status).toBe(201);

    // Gleiche Client-ID, ANDERER Idempotency-Key → echte Kollision
    const collision = await routes.POST(
      makeRequest({ ...body, description: "Zweite Buchung" }, crypto.randomUUID())
    );
    expect(collision.status).toBe(409);
  });

  it("lehnt ungültige Client-IDs ab (kein cuid2)", async () => {
    const routes = await import("../app/api/transactions/route");
    const res = await routes.POST(
      makeRequest({
        id: "not-a-cuid2!",
        accountId: testAccountId,
        amountCents: -100,
        description: "Ungültige ID",
        occurredAt: new Date().toISOString()
      })
    );
    expect(res.status).toBe(400);
  });
});
