import { z } from "zod";

/**
 * Zwei-Wege-Sync Push (Phase 3b): der Client schickt eine FIFO-Batch lokal
 * entstandener Mutationen. v1 synct genau die offline erfassbare Entität —
 * Transaktionen (Create/Update/Delete). Kategorien, Budgets etc. bleiben
 * online-only über ihre REST-Routen; Reads aller Entitäten kommen über
 * `GET /api/sync/pull`.
 */
export const PushOp = z.object({
  // Idempotency-Key je Operation (cuid2 vom Client) — Replays werden über den
  // MutationLog dedupliziert (Doppel-Push nach Netzabbruch ist ungefährlich).
  mutationId: z.string().min(1),
  entity: z.literal("transaction"),
  op: z.enum(["create", "update", "delete"]),
  // Ziel-Datensatz. Bei create ist das die vom Client vergebene Zeilen-ID.
  id: z.string().min(1),
  // Teilmenge geänderter Felder (Feld-Merge + LWW). Bei delete leer.
  patch: z.record(z.unknown()).optional(),
  // updatedAt (ms) auf dem der Client seine Änderung basiert hat. Weicht der
  // Server-Stand ab, liegt eine nebenläufige Änderung vor → Konfliktprüfung.
  baseUpdatedAt: z.number().int().nullable().optional()
});

export const PushBody = z.object({
  ops: z.array(PushOp).min(1).max(100)
});

/** Erlaubte Transaktions-Felder in einem Patch (Whitelist gegen Overposting). */
export const TransactionPatch = z.object({
  accountId: z.string().min(1).optional(),
  categoryId: z.string().min(1).nullable().optional(),
  savingGoalId: z.string().min(1).nullable().optional(),
  amountCents: z.number().int().optional(),
  description: z.string().min(1).optional(),
  occurredAt: z.string().optional(),
  taxRelevant: z.boolean().optional()
});

/** Create braucht die Pflichtfelder — sonst identisch zur Patch-Whitelist. */
export const TransactionCreate = TransactionPatch.extend({
  accountId: z.string().min(1),
  amountCents: z.number().int(),
  description: z.string().min(1),
  occurredAt: z.string()
});

export type PushOpInput = z.infer<typeof PushOp>;
