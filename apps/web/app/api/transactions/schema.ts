import { ensureNonEmpty } from "@doewe/shared";
import { z } from "zod";

export const TransactionInput = z.object({
  // Optional: vom Client vergebene ID (cuid2) für die Offline-Erfassung —
  // die optimistische Zeile und die Server-Zeile tragen so dieselbe ID.
  id: z.string().cuid2().optional(),
  accountId: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  savingGoalId: z.string().min(1).optional(),
  amountCents: z.number().int(),
  description: z.string().transform((s) => ensureNonEmpty(s)),
  occurredAt: z.union([z.string(), z.date()]),
  taxRelevant: z.boolean().optional()
});
