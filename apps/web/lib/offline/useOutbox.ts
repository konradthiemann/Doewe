"use client";

import { useSyncExternalStore } from "react";

import { getOutboxSnapshot, getServerOutboxSnapshot, subscribeOutbox } from "./outbox";

import type { OutboxEntry } from "./outbox";

/** Reaktive Sicht auf die Offline-Outbox (z. B. für Pending-Badges). */
export function useOutboxEntries(): OutboxEntry[] {
  return useSyncExternalStore(subscribeOutbox, getOutboxSnapshot, getServerOutboxSnapshot);
}
