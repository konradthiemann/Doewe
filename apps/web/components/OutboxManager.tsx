"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { useI18n } from "../lib/i18n";
import { flushOutbox } from "../lib/offline/outbox";
import { countNewConflicts, pullSnapshot } from "../lib/offline/pull";

import { useToast } from "./ui/Toast";

/**
 * Flusht die Offline-Outbox bei App-Start, Reconnect und Tab-Fokus
 * (iOS kennt keine Background Sync API — deshalb Vordergrund-Trigger).
 * Web Locks verhindert Doppel-Flush über mehrere Tabs; als Fallback schützt
 * serverseitig ohnehin die Idempotenz (MutationLog).
 *
 * Nach dem Push zieht derselbe Trigger den Server-Snapshot (Zwei-Wege-Sync,
 * Pull) und meldet neue Konflikte dezent — so bleibt der Cache auch mit den
 * Änderungen anderer Haushaltsgeräte aktuell.
 */
export default function OutboxManager() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const flushing = useRef(false);
  const authToastShown = useRef(false);

  const runFlush = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.onLine) return;

    const doFlush = async () => {
      if (flushing.current) return;
      flushing.current = true;
      try {
        const result = await flushOutbox();
        if (result.synced > 0) {
          void queryClient.invalidateQueries({ queryKey: ["transactions"] });
          void queryClient.invalidateQueries({ queryKey: ["analytics"] });
          void queryClient.invalidateQueries({ queryKey: ["saving-plan"] });
          void queryClient.invalidateQueries({ queryKey: ["tax"] });
          void queryClient.invalidateQueries({ queryKey: ["categories", "byUsage"] });
          authToastShown.current = false;
          toast.success(t("outbox.synced", { count: String(result.synced) }));
        }
        result.droppedLabels.forEach((label) => {
          toast.error(t("outbox.dropped", { description: label }));
        });
        if (result.authRequired && !authToastShown.current) {
          authToastShown.current = true;
          toast.error(t("outbox.authRequired"));
        }
      } finally {
        flushing.current = false;
      }
    };

    if (typeof navigator.locks?.request === "function") {
      await navigator.locks.request("doewe-outbox-flush", { ifAvailable: true }, async (lock) => {
        if (lock) await doFlush();
      });
    } else {
      await doFlush();
    }

    // Pull (Zwei-Wege-Sync): Server-Snapshot ziehen und Cache hydratisieren,
    // dann abgeleitete Queries invalidieren. Läuft auch ohne Pending-Push, um
    // Änderungen anderer Geräte zu übernehmen.
    await pullSnapshot(queryClient);
    void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    void queryClient.invalidateQueries({ queryKey: ["saving-plan"] });

    const conflicts = await countNewConflicts();
    if (conflicts > 0) {
      toast.info(t("sync.conflictNotice", { count: String(conflicts) }));
    }
  }, [queryClient, t, toast]);

  useEffect(() => {
    void runFlush();
    const onOnline = () => void runFlush();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void runFlush();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [runFlush]);

  return null;
}
