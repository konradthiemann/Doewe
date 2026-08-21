import { z } from "zod";

const LineItemInput = z.object({
  name: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  unitPriceCents: z.number().int(),
  totalCents: z.number().int(),
  position: z.number().int().min(0)
});

const GroupInput = z.object({
  categoryId: z.string().min(1),
  items: z.array(LineItemInput).min(1)
});

export const BatchTransactionInput = z.object({
  receiptDate: z.string(),
  receiptMerchant: z.string().optional(),
  accountId: z.string().min(1),
  taxRelevant: z.boolean().default(false),
  groups: z.array(GroupInput).min(1)
});

export type BatchTransactionInputType = z.infer<typeof BatchTransactionInput>;
