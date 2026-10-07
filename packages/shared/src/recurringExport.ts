/**
 * Pure CSV export of recurring transactions — no Prisma, no I/O.
 *
 * One row per recurring item with the amount due in each month of the given
 * year (anchor month + interval, minus skipped months), plus separate sum rows
 * for expenses and savings. Income items are left out. Format is German
 * spreadsheet-friendly: `;` separator, `,` decimal comma, CRLF line breaks.
 */
import { isRecurringDueInMonth } from "./recurringSchedule";

export type RecurringExportItem = {
  description: string;
  category: string;
  isIncome: boolean;
  isSavings: boolean;
  amountCents: number;
  intervalMonths: number;
  /** Months (1-12) of the exported year that were explicitly skipped. */
  skippedMonths: number[];
  nextYear: number;
  nextMonth: number; // 1-12
};

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
  const amount = Math.abs(item.amountCents);
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
    .filter((item) => !item.isIncome)
    .map((item) => ({ item, months: monthlyCents(item, year) }));
  const expenses = rows.filter((r) => !r.item.isSavings);
  const savings = rows.filter((r) => r.item.isSavings);

  const line = (cells: string[]) => cells.join(";");
  const itemLine = ({ item, months }: (typeof rows)[number]) =>
    line([
      escapeField(item.description),
      escapeField(item.category),
      item.isSavings ? "Sparen" : "Ausgabe",
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
