import { describe, expect, it } from "vitest";

import { buildRecurringCsv, type RecurringExportItem } from "./recurringExport";

const base: RecurringExportItem = {
  description: "Miete",
  categoryName: "Wohnen",
  kind: "expense",
  amountCents: -80000,
  intervalMonths: 1,
  skippedMonths: [],
  nextYear: 2026,
  nextMonth: 1
};

describe("buildRecurringCsv", () => {
  it("writes header, one row per item and 12 month columns plus sum", () => {
    const csv = buildRecurringCsv([base], 2026);
    const [header, row, ...rest] = csv.split("\r\n");
    expect(header).toBe("Beschreibung;Kategorie;Typ;Jan;Feb;Mär;Apr;Mai;Jun;Jul;Aug;Sep;Okt;Nov;Dez;Summe");
    expect(row).toBe("Miete;Wohnen;Ausgabe;800,00;800,00;800,00;800,00;800,00;800,00;800,00;800,00;800,00;800,00;800,00;800,00;9600,00");
    expect(rest.filter(Boolean)).toHaveLength(3); // sums: Ausgaben, Sparen, Gesamt
  });

  it("respects intervalMonths and anchor month", () => {
    const quarterly = { ...base, description: "Versicherung", amountCents: -30000, intervalMonths: 3, nextMonth: 2 };
    const row = buildRecurringCsv([quarterly], 2026).split("\r\n")[1].split(";");
    expect(row.slice(3, 15)).toEqual(["0,00", "300,00", "0,00", "0,00", "300,00", "0,00", "0,00", "300,00", "0,00", "0,00", "300,00", "0,00"]);
    expect(row[15]).toBe("1200,00");
  });

  it("does not list months before the anchor", () => {
    const row = buildRecurringCsv([{ ...base, nextYear: 2026, nextMonth: 11 }], 2026).split("\r\n")[1].split(";");
    expect(row.slice(3, 13).every((c) => c === "0,00")).toBe(true);
    expect(row[15]).toBe("1600,00");
  });

  it("skips skipped months", () => {
    const row = buildRecurringCsv([{ ...base, skippedMonths: [3] }], 2026).split("\r\n")[1].split(";");
    expect(row[5]).toBe("0,00");
    expect(row[15]).toBe("8800,00");
  });

  it("marks savings separately and keeps them out of the expense sum", () => {
    const saving: RecurringExportItem = { ...base, description: "ETF", categoryName: "Sparen", kind: "savings", amountCents: -20000 };
    const lines = buildRecurringCsv([base, saving], 2026).split("\r\n").filter(Boolean);
    expect(lines[2].split(";")[2]).toBe("Sparen");
    const sumExpenses = lines.find((l) => l.startsWith("Summe Ausgaben"))!.split(";");
    const sumSavings = lines.find((l) => l.startsWith("Summe Sparen"))!.split(";");
    const total = lines.find((l) => l.startsWith("Gesamt"))!.split(";");
    expect(sumExpenses[15]).toBe("9600,00");
    expect(sumSavings[15]).toBe("2400,00");
    expect(total[15]).toBe("12000,00");
  });

  it("excludes income items", () => {
    const income: RecurringExportItem = { ...base, description: "Gehalt", kind: "income", amountCents: 300000 };
    const csv = buildRecurringCsv([income], 2026);
    expect(csv).not.toContain("Gehalt");
  });

  it("writes an item without a category with an empty category column", () => {
    const row = buildRecurringCsv([{ ...base, categoryName: null }], 2026).split("\r\n")[1].split(";");
    expect(row.slice(0, 3)).toEqual(["Miete", "", "Ausgabe"]);
  });

  it("subtracts a recurring withdrawal from savings instead of adding it", () => {
    const deposit: RecurringExportItem = { ...base, description: "ETF", categoryName: "Sparen", kind: "savings", amountCents: -20000 };
    // A withdrawal is stored positive; it stays in the savings group whatever its sign.
    const withdrawal: RecurringExportItem = { ...deposit, description: "Entnahme", amountCents: 5000 };
    const lines = buildRecurringCsv([deposit, withdrawal], 2026).split("\r\n").filter(Boolean);
    expect(lines[2].split(";").slice(0, 4)).toEqual(["Entnahme", "Sparen", "Sparen", "-50,00"]);
    expect(lines.find((l) => l.startsWith("Summe Sparen"))!.split(";")[15]).toBe("1800,00");
    expect(lines.find((l) => l.startsWith("Summe Ausgaben"))!.split(";")[15]).toBe("0,00");
  });

  it("escapes fields containing semicolons, quotes or newlines", () => {
    const tricky = { ...base, description: 'Foo; "Bar"\nBaz' };
    expect(buildRecurringCsv([tricky], 2026)).toContain('"Foo; ""Bar""\nBaz"');
  });

  it("neutralises spreadsheet formula injection", () => {
    const evil = { ...base, description: "=HYPERLINK(\"x\")" };
    expect(buildRecurringCsv([evil], 2026)).toContain("'=HYPERLINK");
  });
});
