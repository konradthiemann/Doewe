/**
 * Zwei-Wege-Sync — reine Merge-Logik (Phase 3b).
 *
 * Bewusst DB-/HTTP-frei, damit die Konfliktregeln als pure functions mit
 * Tabellentests abgesichert werden können (siehe sync.test.ts). Der Server ist
 * autoritativ und wendet Ops in Empfangsreihenfolge an; das ist der Tiebreaker
 * für Last-Write-Wins. Zeiten sind Epoch-Millis, Werte sind bereits
 * JSON-normalisiert (ISO-Strings für Datumsfelder), damit Vergleiche stimmen.
 */

export type SyncEntity = "transaction" | "category" | "budget" | "recurring" | "account";
export type SyncOpType = "create" | "update" | "delete";

export type SyncOp = {
  /** Idempotency-Key — Replays derselben mutationId sind No-ops (duplicate). */
  mutationId: string;
  entity: SyncEntity;
  op: SyncOpType;
  id: string;
  /** Nur die vom Client geänderten Felder (Feld-Merge, nicht die ganze Row). */
  patch?: Record<string, unknown>;
  /** updatedAt der Row-Version, die der Client bearbeitet hat (Epoch-Millis). */
  baseUpdatedAt?: number | null;
};

export type FieldConflict = { field: string; serverValue: unknown; clientValue: unknown };

export type SyncOpResult =
  | { status: "applied" }
  | { status: "duplicate" }
  | { status: "conflict"; conflicts: FieldConflict[] };

/** Strukturgleichheit über JSON — deckt null/number/string/boolean sicher ab. */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Feld-Merge mit Last-Write-Wins pro Feld: der eingehende Patch überschreibt
 * feldweise, nicht gepatchte Felder behalten den Serverwert. So bleiben
 * Änderungen an *verschiedenen* Feldern beider Geräte erhalten.
 */
export function mergeFields(
  serverFields: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  return { ...serverFields, ...patch };
}

/**
 * Eine nebenläufige Änderung liegt vor, wenn die Server-Row seit der
 * Basis-Version des Clients weitergewandert ist. Nur dann kann ein feldweises
 * Überschreiben überhaupt eine fremde Änderung verlieren lassen. Ohne Basis
 * (frischer Create) gibt es keine Nebenläufigkeit.
 */
export function isConcurrentChange(
  baseUpdatedAt: number | null | undefined,
  serverUpdatedAt: number
): boolean {
  if (baseUpdatedAt == null) return false;
  return serverUpdatedAt > baseUpdatedAt;
}

/**
 * Die gepatchten Felder, deren Serverwert bei nebenläufiger Änderung vom
 * Clientwert abweicht — genau die Überschreibungen, die ins Konflikt-Journal
 * gehören. Der Patch gewinnt trotzdem (LWW); hier wird nur der verlorene
 * Serverwert festgehalten.
 */
export function detectFieldConflicts(
  serverFields: Record<string, unknown>,
  patch: Record<string, unknown>,
  baseUpdatedAt: number | null | undefined,
  serverUpdatedAt: number
): FieldConflict[] {
  if (!isConcurrentChange(baseUpdatedAt, serverUpdatedAt)) return [];
  const conflicts: FieldConflict[] = [];
  for (const [field, clientValue] of Object.entries(patch)) {
    const serverValue = serverFields[field];
    if (!valuesEqual(serverValue, clientValue)) {
      conflicts.push({ field, serverValue, clientValue });
    }
  }
  return conflicts;
}

/**
 * Edit-vs-Delete: Löschen ist bei Finanzdaten eine bewusste Entscheidung und
 * gewinnt immer. Ein Update auf eine bereits getombstonete Row wird verworfen
 * (die Row nicht wiederbelebt).
 */
export function updateBlockedByDelete(serverDeletedAt: number | null | undefined): boolean {
  return serverDeletedAt != null;
}
