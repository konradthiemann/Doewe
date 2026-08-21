/**
 * Grouping and summing of tax-earmarked transactions by category.
 *
 * Extracted from `apps/web/app/api/tax/route.ts` so the PDF export (which
 * needs the same category grouping, sorted the same way) and the JSON
 * endpoint share a single implementation. Pure — no HTTP, no Prisma.
 */

export type TaxTransactionInput = {
  id: string;
  amountCents: number;
  description: string;
  occurredAt: Date | string;
  category: { id: string; name: string } | null;
  attachments: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number }>;
};

export type CategorySum = {
  categoryId: string | null;
  categoryName: string | null;
  totalCents: number;
  count: number;
  withReceiptCount: number;
};

export type TaxGrouping = {
  categorySums: CategorySum[];
  /** Sum of all positive amounts (income) across all transactions, in cents. */
  totalIncomeCents: number;
  /** Sum of all negative amounts (expenses) across all transactions, in cents. */
  totalExpenseCents: number;
  /** `totalIncomeCents + totalExpenseCents`. */
  totalCents: number;
};

/**
 * Groups tax-relevant transactions by category (`categoryId: null` for
 * uncategorized) and computes per-category + overall sums.
 *
 * `categorySums` is sorted by `|totalCents|` descending, matching the
 * existing `/api/tax` response shape.
 */
export function groupTaxTransactionsByCategory(transactions: TaxTransactionInput[]): TaxGrouping {
  const sums = new Map<string | null, CategorySum>();
  let totalIncomeCents = 0;
  let totalExpenseCents = 0;

  for (const tx of transactions) {
    const key = tx.category?.id ?? null;
    const entry = sums.get(key) ?? {
      categoryId: tx.category?.id ?? null,
      categoryName: tx.category?.name ?? null,
      totalCents: 0,
      count: 0,
      withReceiptCount: 0
    };
    entry.totalCents += tx.amountCents;
    entry.count += 1;
    if (tx.attachments.length > 0) entry.withReceiptCount += 1;
    sums.set(key, entry);

    if (tx.amountCents >= 0) {
      totalIncomeCents += tx.amountCents;
    } else {
      totalExpenseCents += tx.amountCents;
    }
  }

  const categorySums = Array.from(sums.values()).sort(
    (a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents)
  );

  return {
    categorySums,
    totalIncomeCents,
    totalExpenseCents,
    totalCents: totalIncomeCents + totalExpenseCents
  };
}
