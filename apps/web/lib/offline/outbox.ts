import { decideFlushStep } from "@doewe/shared";
import { createStore, del, entries, set } from "idb-keyval";

/**
 * Offline-Outbox (Phase 3a „Offline erfassen"):
 * Mutationen, die ohne Netz entstanden sind, warten hier (IndexedDB,
 * eigener Store neben dem Query-Cache) und werden FIFO nachgespielt.
 * Jeder Eintrag trägt seine mutationId als Idempotency-Key — der Server
 * dedupliziert damit Replays (siehe MutationLog).
 */
export type OutboxEntry = {
  mutationId: string;
  createdAt: number;
  entity: "transaction";
  op: "create";
  url: string;
  method: "POST";
  payload: Record<string, unknown>;
  /** Menschlicher Bezeichner für Nutzer-Feedback (z. B. Beschreibung) */
  label: string;
  attempts: number;
};

const store = typeof indexedDB !== "undefined" ? createStore("doewe-outbox", "mutations") : undefined;

const EMPTY: OutboxEntry[] = [];
let snapshot: OutboxEntry[] = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

async function refreshSnapshot() {
  if (!store) return;
  const all = await entries<string, OutboxEntry>(store);
  snapshot = all.map(([, value]) => value).sort((a, b) => a.createdAt - b.createdAt);
  emit();
}

/** Für useSyncExternalStore: stabile subscribe/getSnapshot-Funktionen. */
export function subscribeOutbox(listener: () => void) {
  listeners.add(listener);
  void refreshSnapshot();
  return () => {
    listeners.delete(listener);
  };
}

export function getOutboxSnapshot(): OutboxEntry[] {
  return snapshot;
}

export function getServerOutboxSnapshot(): OutboxEntry[] {
  return EMPTY;
}

export async function enqueueMutation(entry: OutboxEntry) {
  if (!store) return;
  await set(entry.mutationId, entry, store);
  await refreshSnapshot();
}

export type FlushResult = {
  synced: number;
  droppedLabels: string[];
  authRequired: boolean;
};

/**
 * Spielt die Queue FIFO nach. Hält bei Netz-/Server-/Auth-Problemen an
 * (Reihenfolge wahren); endgültig abgelehnte Einträge werden verworfen
 * und über droppedLabels gemeldet. Entscheidungslogik: @doewe/shared.
 */
export async function flushOutbox(): Promise<FlushResult> {
  const result: FlushResult = { synced: 0, droppedLabels: [], authRequired: false };
  if (!store) return result;

  await refreshSnapshot();
  for (const entry of [...snapshot]) {
    let status: number | "network-error";
    try {
      const res = await fetch(entry.url, {
        method: entry.method,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": entry.mutationId
        },
        body: JSON.stringify(entry.payload)
      });
      status = res.status;
    } catch {
      status = "network-error";
    }

    const outcome = decideFlushStep(status);
    if (outcome.action === "remove") {
      await del(entry.mutationId, store);
      result.synced += 1;
    } else if (outcome.action === "drop") {
      await del(entry.mutationId, store);
      result.droppedLabels.push(entry.label);
    } else {
      if (outcome.action === "halt-auth") result.authRequired = true;
      break;
    }
  }

  await refreshSnapshot();
  return result;
}
