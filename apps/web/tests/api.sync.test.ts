import { createId } from "@paralleldrive/cuid2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// pretest runs: prisma generate && prisma db push && db:seed
const TEST_USER_ID = "test-user-sync";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

let prisma: import("@prisma/client").PrismaClient;
let testUserId: string;
let testHouseholdId: string;
let testAccountId: string;

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "sync-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "sync-test@example.com", password: "hashed" }
  });
  testUserId = user.id;
  testHouseholdId = await ensureTestHousehold(prisma, user.id);

  const account = await prisma.account.upsert({
    where: { id: "acc_sync_test" },
    update: { userId: user.id, householdId: testHouseholdId },
    create: { id: "acc_sync_test", name: "Sync Test Account", userId: user.id, householdId: testHouseholdId }
  });
  testAccountId = account.id;

  await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
  await prisma.mutationLog.deleteMany({ where: { userId: testUserId } });
  await prisma.conflictLog.deleteMany({ where: { householdId: testHouseholdId } });
});

afterAll(async () => {
  if (prisma) {
    await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
    await prisma.mutationLog.deleteMany({ where: { userId: testUserId } });
    await prisma.conflictLog.deleteMany({ where: { householdId: testHouseholdId } });
    await prisma.account.deleteMany({ where: { id: testAccountId } });
    await cleanupTestHousehold(prisma, testUserId);
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
  }
});

function pushRequest(ops: unknown[]) {
  return new Request("http://localhost/api/sync/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ops })
  });
}

type PushResult = {
  mutationId: string;
  status: "applied" | "duplicate" | "conflict";
  row?: { id: string; amountCents: number; description: string; deletedAt: string | null };
  conflicts?: { field: string; serverValue: unknown; clientValue: unknown }[];
};

async function push(ops: unknown[]): Promise<PushResult[]> {
  const routes = await import("../app/api/sync/push/route");
  const res = await routes.POST(pushRequest(ops));
  expect(res.status).toBe(200);
  const json: { results: PushResult[] } = await res.json();
  return json.results;
}

describe("/api/sync/push — Zwei-Wege-Sync", () => {
  it("create ist idempotent: Doppel-Push bucht nur einmal (duplicate beim Replay)", async () => {
    const id = createId();
    const op = {
      mutationId: createId(),
      entity: "transaction",
      op: "create",
      id,
      patch: {
        accountId: testAccountId,
        amountCents: -1000,
        description: "Rewe",
        occurredAt: new Date().toISOString()
      }
    };

    const [first] = await push([op]);
    expect(first.status).toBe("applied");
    expect(first.row?.id).toBe(id);

    const [second] = await push([op]);
    expect(second.status).toBe("duplicate");
    expect(second.row?.id).toBe(id);

    expect(await prisma.transaction.count({ where: { id } })).toBe(1);
    expect(await prisma.mutationLog.count({ where: { mutationId: op.mutationId } })).toBe(1);
  });

  it("update ohne nebenläufige Änderung wird angewandt", async () => {
    const id = createId();
    await push([
      {
        mutationId: createId(),
        entity: "transaction",
        op: "create",
        id,
        patch: { accountId: testAccountId, amountCents: -500, description: "Alt", occurredAt: new Date().toISOString() }
      }
    ]);
    const base = await prisma.transaction.findUniqueOrThrow({ where: { id } });

    const [res] = await push([
      {
        mutationId: createId(),
        entity: "transaction",
        op: "update",
        id,
        patch: { description: "Neu" },
        baseUpdatedAt: base.updatedAt.getTime()
      }
    ]);
    expect(res.status).toBe("applied");
    expect(res.row?.description).toBe("Neu");
    expect(await prisma.conflictLog.count({ where: { entityId: id } })).toBe(0);
  });

  it("nebenläufiger Same-Field-Edit: LWW gewinnt, Verlierer landet im ConflictLog", async () => {
    const id = createId();
    await push([
      {
        mutationId: createId(),
        entity: "transaction",
        op: "create",
        id,
        patch: { accountId: testAccountId, amountCents: -500, description: "Basis", occurredAt: new Date().toISOString() }
      }
    ]);
    const base = await prisma.transaction.findUniqueOrThrow({ where: { id } });

    // Anderes Gerät ändert denselben Betrag zwischenzeitlich (bumpt updatedAt).
    await new Promise((r) => setTimeout(r, 5));
    await prisma.transaction.update({ where: { id }, data: { amountCents: -700 } });

    const [res] = await push([
      {
        mutationId: createId(),
        entity: "transaction",
        op: "update",
        id,
        patch: { amountCents: -900 },
        baseUpdatedAt: base.updatedAt.getTime()
      }
    ]);
    expect(res.status).toBe("conflict");
    expect(res.row?.amountCents).toBe(-900); // LWW: dieser Push gewinnt
    expect(res.conflicts).toEqual([{ field: "amountCents", serverValue: -700, clientValue: -900 }]);
    expect(await prisma.conflictLog.count({ where: { entityId: id, field: "amountCents" } })).toBe(1);
  });

  it("Edit-vs-Delete: Delete gewinnt — Update auf Tombstone wird verworfen", async () => {
    const id = createId();
    await push([
      {
        mutationId: createId(),
        entity: "transaction",
        op: "create",
        id,
        patch: { accountId: testAccountId, amountCents: -500, description: "ZuLöschen", occurredAt: new Date().toISOString() }
      }
    ]);
    await prisma.transaction.update({ where: { id }, data: { deletedAt: new Date() } });

    const [res] = await push([
      {
        mutationId: createId(),
        entity: "transaction",
        op: "update",
        id,
        patch: { description: "Wiederbelebt" },
        baseUpdatedAt: Date.now()
      }
    ]);
    expect(res.status).toBe("conflict");

    const row = await prisma.transaction.findUniqueOrThrow({ where: { id } });
    expect(row.deletedAt).not.toBeNull(); // bleibt gelöscht
    expect(row.description).toBe("ZuLöschen"); // Edit nicht angewandt
  });

  it("delete ist idempotent: zweiter Push meldet duplicate", async () => {
    const id = createId();
    await push([
      {
        mutationId: createId(),
        entity: "transaction",
        op: "create",
        id,
        patch: { accountId: testAccountId, amountCents: -500, description: "Weg", occurredAt: new Date().toISOString() }
      }
    ]);

    const [first] = await push([{ mutationId: createId(), entity: "transaction", op: "delete", id }]);
    expect(first.status).toBe("applied");
    const [second] = await push([{ mutationId: createId(), entity: "transaction", op: "delete", id }]);
    expect(second.status).toBe("duplicate");
  });
});

describe("/api/sync/pull — Haushalts-Snapshot", () => {
  it("liefert lebende Zeilen und blendet Tombstones aus; ETag → 304", async () => {
    const routes = await import("../app/api/sync/pull/route");
    const live = createId();
    const dead = createId();
    await push([
      {
        mutationId: createId(),
        entity: "transaction",
        op: "create",
        id: live,
        patch: { accountId: testAccountId, amountCents: -100, description: "Lebt", occurredAt: new Date().toISOString() }
      },
      {
        mutationId: createId(),
        entity: "transaction",
        op: "create",
        id: dead,
        patch: { accountId: testAccountId, amountCents: -200, description: "Tot", occurredAt: new Date().toISOString() }
      }
    ]);
    await prisma.transaction.update({ where: { id: dead }, data: { deletedAt: new Date() } });

    const res = await routes.GET(new Request("http://localhost/api/sync/pull"));
    expect(res.status).toBe(200);
    const etag = res.headers.get("etag");
    expect(etag).toBeTruthy();
    const snapshot: { transactions: { id: string }[] } = await res.json();
    const ids = snapshot.transactions.map((t) => t.id);
    expect(ids).toContain(live);
    expect(ids).not.toContain(dead);

    const cached = await routes.GET(
      new Request("http://localhost/api/sync/pull", { headers: { "If-None-Match": etag as string } })
    );
    expect(cached.status).toBe(304);
  });
});
