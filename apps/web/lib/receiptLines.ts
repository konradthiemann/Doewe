/**
 * Logic of the receipt review mask — no React, no I/O, integer cents.
 */
import { parseDayKey, zonedDayKey } from "@doewe/shared";

/**
 * The receipt day for the date field: the scanned date if it is a real
 * calendar day (`yyyy-mm-dd`), otherwise today in the app's time zone. The
 * scan result is free text from a model; the batch endpoint answers 400 for
 * anything that is not a calendar day.
 */
export function receiptDayOrToday(scannedDate: unknown, now: Date = new Date()): string {
  return typeof scannedDate === "string" && parseDayKey(scannedDate) ? scannedDate : zonedDayKey(now);
}

/**
 * What the bookings get when the tax switch is left alone: each booking
 * inherits the flag of its category (like a manual booking). `mixed` = some
 * categories are tax-relevant, some are not.
 */
export type InheritedTaxRelevance = "all" | "none" | "mixed";

export function inheritedTaxRelevance(
  groups: ReadonlyArray<{ category: { isTaxRelevant?: boolean } }>
): InheritedTaxRelevance {
  const relevant = groups.filter((group) => group.category.isTaxRelevant === true).length;
  if (relevant === 0) return "none";
  return relevant === groups.length ? "all" : "mixed";
}

export type BatchRequestInput<Line> = {
  receiptDate: string;
  merchant: string;
  accountId: string;
  /** The user's explicit choice; null while the switch is untouched. */
  taxOverride: boolean | null;
  groups: ReadonlyArray<{ category: { id: string }; items: readonly Line[] }>;
};

/**
 * Body of POST /api/transactions/batch. `taxRelevant` is only sent once the
 * user has decided: without the field the server lets every booking inherit
 * its category's flag, a `false` sent by default would switch that off.
 */
export function buildBatchRequest<
  Line extends { name: string; quantity: number; unitPriceCents: number; totalCents: number; position: number }
>(input: BatchRequestInput<Line>) {
  return {
    receiptDate: input.receiptDate,
    receiptMerchant: input.merchant || undefined,
    accountId: input.accountId,
    ...(input.taxOverride === null ? {} : { taxRelevant: input.taxOverride }),
    groups: input.groups.map((group) => ({
      categoryId: group.category.id,
      items: group.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        totalCents: item.totalCents,
        position: item.position
      }))
    }))
  };
}

/**
 * Total of a receipt line in whole cents. Quantities may be fractional
 * (0.345 kg × 12.99 €/kg): the product is rounded commercially to the cent,
 * because the API only accepts integer cents. The quantity is taken to three
 * decimals (the precision of the input field) so the rounding is done on
 * integers, not on a binary fraction.
 */
export function lineTotalCents(quantity: number, unitPriceCents: number): number {
  const thousandths = Math.round(quantity * 1000);
  return Math.round((thousandths * unitPriceCents) / 1000);
}

export type ReceiptLine = { name: string; categoryId: string; totalCents: number };

export type ReceiptGroup<Line extends ReceiptLine, Category extends { id: string }> = {
  category: Category;
  items: Line[];
  totalCents: number;
};

/**
 * The lines that will be booked, grouped by category — one transaction per
 * group. A line without a name or with an unknown category is not booked.
 */
export function groupBookableLines<Line extends ReceiptLine, Category extends { id: string }>(
  lines: readonly Line[],
  categories: readonly Category[]
): Array<ReceiptGroup<Line, Category>> {
  const groups = new Map<string, ReceiptGroup<Line, Category>>();
  for (const line of lines) {
    if (!line.name.trim()) continue;
    const category = categories.find((c) => c.id === line.categoryId);
    if (!category) continue;
    const existing = groups.get(line.categoryId);
    if (existing) {
      existing.items.push(line);
      existing.totalCents += line.totalCents;
    } else {
      groups.set(line.categoryId, { category, items: [line], totalCents: line.totalCents });
    }
  }
  return Array.from(groups.values());
}

/**
 * What confirming the review books in total: each group becomes one expense of
 * the absolute amount of its lines (POST /api/transactions/batch). Lines that
 * are not booked are not part of it.
 */
export function bookedTotalCents(groups: ReadonlyArray<{ totalCents: number }>): number {
  return groups.reduce((sum, group) => sum + Math.abs(group.totalCents), 0);
}
