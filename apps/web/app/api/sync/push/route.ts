/**
 * POST /api/sync/push — Zwei-Wege-Sync, Push-Richtung (Phase 3b).
 *
 * Authentifizierung: Pflicht (401 sonst).
 * Autorisierung: Alle Zugriffe über `account.householdId` (Teil D).
 *
 * Body: { ops: PushOp[] } — eine FIFO-Batch lokaler Transaktions-Mutationen.
 * Antwort: { results: PushResult[] } — je Operation ein Ergebnis:
 *   applied   — angewandt (row = Server-Stand nach dem Schreiben)
 *   duplicate — bekannter mutationId-Replay oder bereits vorhandener Datensatz
 *   conflict  — nebenläufige Änderung: LWW hat gewonnen (row + conflicts[])
 *               ODER der Server-Datensatz ist getombstoned (delete wins, leer)
 *
 * Konfliktbehandlung (siehe @doewe/shared/sync):
 *   - Feld-Merge + Last-Write-Wins pro Feld; verlorene Werte → ConflictLog.
 *   - Delete gewinnt: ein Update auf einen getombstoneten Datensatz wird verworfen.
 *   - Idempotenz je Operation über MutationLog (mutationId).
 */
import { detectFieldConflicts, updateBlockedByDelete } from "@doewe/shared";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

import { PushBody, TransactionCreate, TransactionPatch } from "./schema";

import type { PushOpInput } from "./schema";
import type { SessionUser } from "../../../../lib/auth";
import type { FieldConflict } from "@doewe/shared";

type PushResult = {
  mutationId: string;
  status: "applied" | "duplicate" | "conflict";
  row?: unknown;
  conflicts?: FieldConflict[];
};

const MUTATION_ENTITY = "sync-transaction";

/** Dates → ISO-Strings, damit Vergleich (Patch) und Speicherung konsistent sind. */
function serialize(row: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(row)) as Prisma.InputJsonValue;
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = PushBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const results: PushResult[] = [];
  for (const op of parsed.data.ops) {
    results.push(await processOp(op, user));
  }
  return NextResponse.json({ results });
}

async function processOp(op: PushOpInput, user: SessionUser): Promise<PushResult> {
  // Idempotenz: ein bekannter mutationId-Replay gibt „duplicate" zurück, ohne
  // erneut zu schreiben — der gespeicherte Server-Stand wird mitgeliefert.
  const replay = await prisma.mutationLog.findUnique({ where: { mutationId: op.mutationId } });
  if (replay && replay.userId === user.id) {
    const body = replay.responseBody as { row?: unknown };
    return { mutationId: op.mutationId, status: "duplicate", row: body?.row };
  }

  if (op.op === "create") return createTransaction(op, user);
  if (op.op === "update") return updateTransaction(op, user);
  return deleteTransaction(op, user);
}

/** Persistiert das Op-Ergebnis idempotent (mutationId) im selben tx-Scope. */
async function logMutation(
  tx: Prisma.TransactionClient,
  op: PushOpInput,
  user: SessionUser,
  row: unknown
) {
  await tx.mutationLog.create({
    data: {
      mutationId: op.mutationId,
      userId: user.id,
      entity: MUTATION_ENTITY,
      responseStatus: 200,
      responseBody: { row: serialize(row) }
    }
  });
}

async function createTransaction(op: PushOpInput, user: SessionUser): Promise<PushResult> {
  const fields = TransactionCreate.safeParse(op.patch ?? {});
  if (!fields.success) {
    return { mutationId: op.mutationId, status: "conflict", conflicts: [] };
  }
  const d = fields.data;

  const account = await prisma.account.findFirst({
    where: { id: d.accountId, householdId: user.householdId }
  });
  if (!account) return { mutationId: op.mutationId, status: "conflict", conflicts: [] };

  if (d.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: d.categoryId, householdId: user.householdId }
    });
    if (!category) return { mutationId: op.mutationId, status: "conflict", conflicts: [] };
  }
  if (d.savingGoalId) {
    const goal = await prisma.budget.findFirst({
      where: { id: d.savingGoalId, account: { householdId: user.householdId } }
    });
    if (!goal) return { mutationId: op.mutationId, status: "conflict", conflicts: [] };
  }

  try {
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          id: op.id,
          accountId: d.accountId,
          categoryId: d.categoryId ?? null,
          savingGoalId: d.savingGoalId ?? null,
          createdByUserId: user.id,
          amountCents: d.amountCents,
          description: d.description,
          occurredAt: new Date(d.occurredAt),
          taxRelevant: d.taxRelevant ?? false
        }
      });
      await logMutation(tx, op, user, created);
      return created;
    });
    return { mutationId: op.mutationId, status: "applied", row: serialize(row) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Parallel-Replay derselben mutationId ODER Re-Create derselben Zeilen-ID:
      // beides bedeutet „schon gebucht" → den bestehenden Stand als duplicate melden.
      const existing = await prisma.transaction.findUnique({ where: { id: op.id } });
      return { mutationId: op.mutationId, status: "duplicate", row: existing ? serialize(existing) : undefined };
    }
    throw error;
  }
}

async function updateTransaction(op: PushOpInput, user: SessionUser): Promise<PushResult> {
  const fields = TransactionPatch.safeParse(op.patch ?? {});
  if (!fields.success) {
    return { mutationId: op.mutationId, status: "conflict", conflicts: [] };
  }
  const patch = fields.data;

  // findUnique umgeht den Soft-Delete-Filter → wir sehen Tombstones (delete wins).
  const server = await prisma.transaction.findUnique({
    where: { id: op.id },
    include: { account: { select: { householdId: true } } }
  });
  if (!server || server.account.householdId !== user.householdId) {
    return { mutationId: op.mutationId, status: "conflict", conflicts: [] };
  }
  if (updateBlockedByDelete(server.deletedAt ? server.deletedAt.getTime() : null)) {
    // Delete gewinnt: der lokale Edit wird verworfen, Client bekommt den Tombstone.
    return { mutationId: op.mutationId, status: "conflict", row: serialize(server), conflicts: [] };
  }

  // Referenz-Checks nur für tatsächlich geänderte FKs.
  if (patch.accountId) {
    const account = await prisma.account.findFirst({
      where: { id: patch.accountId, householdId: user.householdId }
    });
    if (!account) return { mutationId: op.mutationId, status: "conflict", conflicts: [] };
  }
  if (patch.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: patch.categoryId, householdId: user.householdId }
    });
    if (!category) return { mutationId: op.mutationId, status: "conflict", conflicts: [] };
  }

  // Konflikte gegen den serialisierten Server-Stand (ISO-Strings ↔ Patch-Strings).
  const serverFields = serialize(server) as Record<string, unknown>;
  const conflicts = detectFieldConflicts(
    serverFields,
    patch as Record<string, unknown>,
    op.baseUpdatedAt ?? null,
    server.updatedAt.getTime()
  );

  const data: Prisma.TransactionUncheckedUpdateInput = {};
  if (patch.accountId !== undefined) data.accountId = patch.accountId;
  if (patch.categoryId !== undefined) data.categoryId = patch.categoryId;
  if (patch.savingGoalId !== undefined) data.savingGoalId = patch.savingGoalId;
  if (patch.amountCents !== undefined) data.amountCents = patch.amountCents;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.occurredAt !== undefined) data.occurredAt = new Date(patch.occurredAt);
  if (patch.taxRelevant !== undefined) data.taxRelevant = patch.taxRelevant;

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.transaction.update({ where: { id: op.id }, data });
    // Verlorene Werte journalisieren (LWW-Verlierer: der bisherige Server-Wert).
    for (const c of conflicts) {
      await tx.conflictLog.create({
        data: {
          householdId: user.householdId,
          entity: "transaction",
          entityId: op.id,
          field: c.field,
          serverValue: serialize(c.serverValue),
          clientValue: serialize(c.clientValue)
        }
      });
    }
    await logMutation(tx, op, user, updated);
    return updated;
  });

  return {
    mutationId: op.mutationId,
    status: conflicts.length > 0 ? "conflict" : "applied",
    row: serialize(row),
    conflicts: conflicts.length > 0 ? conflicts : undefined
  };
}

async function deleteTransaction(op: PushOpInput, user: SessionUser): Promise<PushResult> {
  const server = await prisma.transaction.findUnique({
    where: { id: op.id },
    include: { account: { select: { householdId: true } } }
  });
  if (!server || server.account.householdId !== user.householdId) {
    // Nichts zu löschen (nie synchronisiert oder fremd) → idempotent duplicate.
    return { mutationId: op.mutationId, status: "duplicate" };
  }
  if (server.deletedAt) {
    return { mutationId: op.mutationId, status: "duplicate", row: serialize(server) };
  }

  const row = await prisma.$transaction(async (tx) => {
    const deleted = await tx.transaction.update({
      where: { id: op.id },
      data: { deletedAt: new Date() }
    });
    await logMutation(tx, op, user, deleted);
    return deleted;
  });
  return { mutationId: op.mutationId, status: "applied", row: serialize(row) };
}
