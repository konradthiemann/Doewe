"use client";

import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import { SessionProvider } from "next-auth/react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { useEffect, useState } from "react";

import { ToastProvider } from "../components/ui/Toast";
import { I18nProvider } from "../lib/i18n";
import { ThemeProvider } from "../lib/ThemeContext";

/**
 * Query-Cache-Persistenz (Phase 2 „Offline lesen"):
 * Alle GET-Daten laufen über TanStack Query und werden in IndexedDB
 * persistiert → die App zeigt offline den letzten geladenen Stand.
 *
 * CACHE_BUSTER bei inkompatiblen Änderungen an API-Antwortformen hochzählen —
 * dann wird der persistierte Cache beim nächsten Start verworfen.
 */
const CACHE_BUSTER = "doewe-cache-v1";
const CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 Tage

const idbStorage = {
  getItem: async (key: string) => (await get<string>(key)) ?? null,
  setItem: (key: string, value: string) => set(key, value),
  removeItem: (key: string) => del(key)
};

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // gcTime muss >= maxAge des Persisters sein, sonst werden
            // wiederhergestellte Einträge sofort wieder verworfen.
            gcTime: CACHE_MAX_AGE,
            retry: 1
          }
        }
      })
  );
  const [persister] = useState(() => createAsyncStoragePersister({ storage: idbStorage }));

  // Browser bitten, IndexedDB vor automatischer Räumung zu schützen
  // (installierte PWAs haben ohnehin einen eigenen Storage-Zähler).
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {
      /* Ablehnung ist ok — Cache bleibt Best-Effort */
    });
  }, []);

  return (
    <NuqsAdapter>
      <SessionProvider>
        <ThemeProvider>
          <I18nProvider>
            <PersistQueryClientProvider
              client={queryClient}
              persistOptions={{ persister, maxAge: CACHE_MAX_AGE, buster: CACHE_BUSTER }}
            >
              <ToastProvider>{children}</ToastProvider>
            </PersistQueryClientProvider>
          </I18nProvider>
        </ThemeProvider>
      </SessionProvider>
    </NuqsAdapter>
  );
}
