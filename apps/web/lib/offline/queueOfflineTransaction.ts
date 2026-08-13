import { enqueueMutation } from "./outbox";

import type { QueryClient } from "@tanstack/react-query";

export type OfflineTransactionPayload = {
  id: string;
  accountId: string;
  amountCents: number;
  description: string;
  occurredAt: string;
  categoryId?: string;
  savingGoalId?: string;
  taxRelevant?: boolean;
};

/**
 * Buchung offline einreihen (Outbox) und optimistisch in die gecachte
 * Transaktionsliste schreiben. Client-ID (cuid2) und Server-Zeile tragen
 * dieselbe ID — nach Flush + Invalidate ersetzt die echte Zeile die
 * optimistische nahtlos. Bewusst KEIN Invalidate hier: der Server kennt
 * die Buchung noch nicht.
 */
export async function queueOfflineTransaction(
  queryClient: QueryClient,
  mutationId: string,
  payload: OfflineTransactionPayload
) {
  await enqueueMutation({
    mutationId,
    createdAt: Date.now(),
    entity: "transaction",
    op: "create",
    url: "/api/transactions",
    method: "POST",
    payload: payload as unknown as Record<string, unknown>,
    label: payload.description,
    attempts: 0
  });

  queryClient.setQueryData<OfflineTransactionPayload[]>(["transactions"], (old) =>
    old ? [payload, ...old] : [payload]
  );
}
