/**
 * Cell formatting shared by the CSV exports — no I/O.
 *
 * Format is German spreadsheet-friendly: `;` separator, `,` decimal comma,
 * CRLF line breaks. Callers prepend a UTF-8 BOM so Excel reads umlauts.
 */

/** Cells starting with one of these are read as a formula by spreadsheets. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Integer cents as `-1234,56`: decimal comma, no thousands separator. */
export function formatCsvCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/**
 * A free-text cell: defused against formula injection (leading `'`) and
 * quoted when it contains the separator, a quote or a line break.
 */
export function escapeCsvField(value: string): string {
  const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvLine(cells: readonly string[]): string {
  return cells.join(";");
}

/** Lines joined with CRLF, ending in a line break. */
export function csvDocument(lines: readonly string[]): string {
  return lines.join("\r\n") + "\r\n";
}
