/**
 * Pure CSV export of booked transactions — no React, no I/O.
 *
 * One row per transaction, in the order given (the caller passes the list as
 * the user sees it: filtered and sorted). Amounts keep their stored sign, so
 * the rows line up with a bank statement: negative = money left the account.
 *
 * The day is the calendar day in Europe/Berlin (`zonedDayKey`), the same day
 * the list, the filters and the analytics assign the booking to. The type
 * column comes from `classifyFlow` — savings category first, then the sign —
 * so the file classifies exactly like the totals bar above the list.
 *
 * Format: `;` separator, decimal comma, CRLF, see `csv.ts`. Header and type
 * names come from the caller so the file follows the UI language.
 */
import { APP_TIME_ZONE, zonedDayKey } from "./calendar";
import { classifyFlow, type FlowKind, type FlowRow } from "./cashflow";
import { csvDocument, csvLine, escapeCsvField, formatCsvCents } from "./csv";

export type TransactionExportRow = FlowRow & {
  occurredAt: string | Date;
  description: string;
  recurringTransactionId?: string | null;
  taxRelevant?: boolean;
};

export type TransactionCsvLabels = {
  date: string;
  description: string;
  category: string;
  type: string;
  amount: string;
  recurring: string;
  taxRelevant: string;
  kinds: Record<FlowKind, string>;
  yes: string;
  no: string;
};

export type TransactionCsvOptions = {
  /** Category id → display name. A missing or unknown id leaves the cell empty. */
  categoryNames: Readonly<Record<string, string>>;
  savingsIds: ReadonlySet<string>;
  labels: TransactionCsvLabels;
  timeZone?: string;
};

export function buildTransactionsCsv(rows: readonly TransactionExportRow[], options: TransactionCsvOptions): string {
  const { categoryNames, savingsIds, labels } = options;
  const timeZone = options.timeZone ?? APP_TIME_ZONE;
  const flag = (value: boolean) => (value ? labels.yes : labels.no);

  const header = csvLine(
    [labels.date, labels.description, labels.category, labels.type, labels.amount, labels.recurring, labels.taxRelevant].map(
      escapeCsvField
    )
  );
  const lines = rows.map((row) => {
    const occurredAt = typeof row.occurredAt === "string" ? new Date(row.occurredAt) : row.occurredAt;
    const category = row.categoryId ? (categoryNames[row.categoryId] ?? "") : "";
    return csvLine([
      zonedDayKey(occurredAt, timeZone),
      escapeCsvField(row.description),
      escapeCsvField(category),
      escapeCsvField(labels.kinds[classifyFlow(row, savingsIds)]),
      formatCsvCents(row.amountCents),
      escapeCsvField(flag(Boolean(row.recurringTransactionId))),
      escapeCsvField(flag(Boolean(row.taxRelevant)))
    ]);
  });
  return csvDocument([header, ...lines]);
}
