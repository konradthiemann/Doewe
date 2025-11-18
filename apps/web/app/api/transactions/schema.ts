import { ensureNonEmpty } from "@doewe/shared";
import { z } from "zod";

export const TransactionInput = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  amountCents: z.number().int(),
  description: z.string().transform((s) => ensureNonEmpty(s)),
  occurredAt: z.union([z.string(), z.date()])
});
