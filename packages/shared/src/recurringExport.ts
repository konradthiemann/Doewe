/**
 * Pure CSV export of recurring transactions — no Prisma, no I/O.
 *
 * One row per recurring item with the amount due in each month of the given
 * year (anchor month + interval, minus skipped months), plus separate sum rows
 * for expenses and savings. Income items are left out. Format is German
 * spreadsheet-friendly: `;` separator, `,` decimal comma, CRLF line breaks.
 *
 * What is an expense, savings or income is decided by the item's `kind` — the
 * classification the yearly page shows (savings category first, then the
 * sign), not by the category's `isIncome` flag.
 */
import { isRecurringDueInMonth } from "./recurringSchedule";

import type { RecurringYearItem } from "./recurringYear";

/** The fields of a yearly-page item the CSV needs; `kind` decides the group. */
export type RecurringExportItem = Pick<
  RecurringYearItem,
  "description" | "categoryName" | "kind" | "amountCents" | "intervalMonths" | "skippedMonths" | "nextYear" | "nextMonth"
>;

const MONTH_LABELS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

function escapeField(value: string): string {
  const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function monthlyCents(item: RecurringExportItem, year: number): number[] {
  // Money leaving the account is listed positive. Income is filtered out, so
  // this only turns negative for a recurring withdrawal from savings (stored
  // positive), which then reduces "Summe Sparen" instead of adding to it.
  const amount = -item.amountCents || 0;
  return MONTH_LABELS.map((_, index) => {
    const month = index + 1;
    if (item.skippedMonths.includes(month)) return 0;
    const due = isRecurringDueInMonth({
      nextYear: item.nextYear,
      nextMonth: item.nextMonth,
      intervalMonths: item.intervalMonths,
      year,
      month
    });
    return due ? amount : 0;
  });
}

const sumOf = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function buildRecurringCsv(items: RecurringExportItem[], year: number): string {
  const rows = items
    .filter((item) => item.kind !== "income")
    .map((item) => ({ item, months: monthlyCents(item, year) }));
  const expenses = rows.filter((r) => r.item.kind === "expense");
  const savings = rows.filter((r) => r.item.kind === "savings");

  const line = (cells: string[]) => cells.join(";");
  const itemLine = ({ item, months }: (typeof rows)[number]) =>
    line([
      escapeField(item.description),
      escapeField(item.categoryName ?? ""),
      item.kind === "savings" ? "Sparen" : "Ausgabe",
      ...months.map(formatCents),
      formatCents(sumOf(months))
    ]);
  const totalLine = (label: string, list: typeof rows) => {
    const months = MONTH_LABELS.map((_, i) => sumOf(list.map((r) => r.months[i])));
    return line([label, "", "", ...months.map(formatCents), formatCents(sumOf(months))]);
  };

  return [
    line(["Beschreibung", "Kategorie", "Typ", ...MONTH_LABELS, "Summe"]),
    ...expenses.map(itemLine),
    ...savings.map(itemLine),
    totalLine("Summe Ausgaben", expenses),
    totalLine("Summe Sparen", savings),
    totalLine("Gesamt", rows)
  ].join("\r\n") + "\r\n";
}
