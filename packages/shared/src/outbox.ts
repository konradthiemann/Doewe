/**
 * Outbox-Entscheidungslogik (Phase 3a „Offline erfassen") — pure functions,
 * damit die Flush-Semantik ohne Browser/IndexedDB testbar ist.
 *
 * Grundsätze:
 * - Die Queue ist FIFO. Bei Netz-/Server-/Auth-Problemen wird ANGEHALTEN
 *   (nicht übersprungen), damit die Reihenfolge erhalten bleibt.
 * - Endgültige Ablehnungen (4xx außer 401) werden verworfen und dem Nutzer
 *   gemeldet — endloses Wiederholen würde die Queue für immer blockieren.
 */
export type FlushOutcome =
  | { action: "remove" } // erfolgreich synchronisiert → Eintrag entfernen
  | { action: "halt" } // Netz weg / Server 5xx → anhalten, später erneut
  | { action: "halt-auth" } // 401: Session abgelaufen → anhalten, Re-Login nötig
  | { action: "drop" }; // 4xx: endgültig abgelehnt → verwerfen + informieren

export function decideFlushStep(status: number | "network-error"): FlushOutcome {
  if (status === "network-error") return { action: "halt" };
  if (status === 401) return { action: "halt-auth" };
  if (status >= 200 && status < 300) return { action: "remove" };
  if (status >= 500) return { action: "halt" };
  return { action: "drop" };
}
