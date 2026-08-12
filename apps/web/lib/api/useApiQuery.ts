"use client";

import { useQuery } from "@tanstack/react-query";

import { getJson } from "./http";

import type { QueryKey } from "@tanstack/react-query";

/**
 * Einheitlicher GET-Hook (Phase 2 „Offline lesen").
 *
 * - `queryKey` stabil pro Ressource halten — Mutationen invalidieren darüber
 *   (z. B. `queryClient.invalidateQueries({ queryKey: ["analytics"] })`).
 * - Antworten landen im persistierten Query-Cache (IndexedDB, siehe
 *   app/providers.tsx) und sind offline als letzter Stand verfügbar.
 * - `isPending` ist nur true, wenn noch KEINE Daten (auch keine persistierten)
 *   vorliegen — perfekt für Skeleton-Zustände.
 */
export function useApiQuery<T>(queryKey: QueryKey, url: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey,
    queryFn: () => getJson<T>(url),
    enabled: options?.enabled
  });
}
