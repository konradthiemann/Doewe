import type { QueryClient } from "@tanstack/react-query";

/**
 * Zwei-Wege-Sync, Pull-Richtung (Phase 3b, Client):
 * Holt den Haushalts-Snapshot von `GET /api/sync/pull` und hydratisiert damit
 * den Query-Cache — so sehen Geräte die Server-Änderungen der anderen (das
 * Lese-Gegenstück zum Outbox-Push) in einem einzigen Roundtrip.
 *
 * ETag-Kurzschluss: Der Server antwortet mit 304, wenn sich seit dem letzten
 * Pull nichts geändert hat. Das ETag lebt bewusst nur im Speicher (nach Reload
 * einmal voll ziehen ist billig und robuster als ein veraltetes persistiertes).
 */
let currentEtag: string | null = null;

type PullSnapshot = {
  transactions: unknown[];
};

export async function pullSnapshot(queryClient: QueryClient): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.onLine) return;

  let res: Response;
  try {
    res = await fetch("/api/sync/pull", {
      headers: currentEtag ? { "If-None-Match": currentEtag } : {}
    });
  } catch {
    return; // offline/Netzfehler — der persistierte Cache bleibt der letzte Stand
  }

  if (res.status === 304 || !res.ok) return;
  currentEtag = res.headers.get("etag");

  const snapshot = (await res.json()) as PullSnapshot;
  // Nur die Liste direkt setzen; abgeleitete Queries (Analytics etc.) werden
  // vom Aufrufer invalidiert.
  queryClient.setQueryData(["transactions"], snapshot.transactions);
}

const CONFLICT_SEEN_KEY = "doewe-conflict-seen";

/**
 * Zählt neue (seit dem letzten Blick ungesehene) Sync-Konflikte. Merkt sich den
 * Zeitstempel des jüngsten Eintrags in localStorage, damit derselbe Konflikt
 * nicht bei jedem Fokuswechsel erneut gemeldet wird.
 */
export async function countNewConflicts(): Promise<number> {
  if (typeof navigator === "undefined" || !navigator.onLine) return 0;

  let res: Response;
  try {
    res = await fetch("/api/sync/conflicts");
  } catch {
    return 0;
  }
  if (!res.ok) return 0;

  const items = (await res.json()) as { id: string; createdAt: string }[];
  if (items.length === 0) return 0;

  const lastSeen = Number(window.localStorage.getItem(CONFLICT_SEEN_KEY) ?? 0);
  const newItems = items.filter((c) => new Date(c.createdAt).getTime() > lastSeen);
  if (newItems.length > 0) {
    // items[0] ist der jüngste (Server sortiert desc).
    window.localStorage.setItem(CONFLICT_SEEN_KEY, String(new Date(items[0].createdAt).getTime()));
  }
  return newItems.length;
}
