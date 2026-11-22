import { describe, expect, it } from "vitest";

import { buildTransactionsCsv, type TransactionCsvLabels, type TransactionExportRow } from "./transactionExport";

const labels: TransactionCsvLabels = {
  date: "Datum",
  description: "Beschreibung",
  category: "Kategorie",
  type: "Typ",
  amount: "Betrag",
  recurring: "Dauerauftrag",
  taxRelevant: "Steuerrelevant",
  kinds: { income: "Einnahme", outcome: "Ausgabe", savings: "Sparen" },
  yes: "ja",
  no: "nein"
};

const options = {
  categoryNames: { food: "Lebensmittel", save: "Sparen", salary: "Gehalt" },
  savingsIds: new Set(["save"]),
  labels
};

const row = (overrides: Partial<TransactionExportRow>): TransactionExportRow => ({
  occurredAt: "2026-11-17T11:00:00.000Z",
  description: "Edeka",
  amountCents: -1831,
  categoryId: "food",
  ...overrides
});

const lines = (csv: string) => csv.split("\r\n");

describe("buildTransactionsCsv", () => {
  it("writes a header and one row per transaction in the given order, ending in CRLF", () => {
    const csv = buildTransactionsCsv([row({ description: "B" }), row({ description: "A" })], options);
    expect(lines(csv)).toEqual([
      "Datum;Beschreibung;Kategorie;Typ;Betrag;Dauerauftrag;Steuerrelevant",
      "2026-11-17;B;Lebensmittel;Ausgabe;-18,31;nein;nein",
      "2026-11-17;A;Lebensmittel;Ausgabe;-18,31;nein;nein",
      ""
    ]);
  });

  it("keeps the stored sign and writes integer cents with a decimal comma", () => {
    const csv = buildTransactionsCsv(
      [row({ amountCents: -129456 }), row({ amountCents: 5 }), row({ amountCents: 0 })],
      options
    );
    expect(lines(csv).slice(1, 4).map((l) => l.split(";")[4])).toEqual(["-1294,56", "0,05", "0,00"]);
  });

  it("assigns the day in Europe/Berlin, not in UTC", () => {
    // 31 Oct 2026, 23:30 UTC is already 1 Nov in Berlin (UTC+1 in winter).
    const csv = buildTransactionsCsv([row({ occurredAt: new Date("2026-10-31T23:30:00.000Z") })], options);
    expect(lines(csv)[1].startsWith("2026-11-01;")).toBe(true);
  });

  it("classifies savings category first, then the sign — not by the category name alone", () => {
    const csv = buildTransactionsCsv(
      [
        row({ categoryId: "save", amountCents: -6000 }),
        row({ categoryId: "save", amountCents: 100000 }),
        row({ categoryId: "salary", amountCents: 278700 }),
        // A negative amount in an income category is an expense.
        row({ categoryId: "salary", amountCents: -1000 }),
        // A refund in an expense category is income.
        row({ categoryId: "food", amountCents: 179 })
      ],
      options
    );
    expect(lines(csv).slice(1, 6).map((l) => l.split(";")[3])).toEqual([
      "Sparen",
      "Sparen",
      "Einnahme",
      "Ausgabe",
      "Einnahme"
    ]);
  });

  it("leaves the category empty without or with an unknown category", () => {
    const csv = buildTransactionsCsv([row({ categoryId: null }), row({ categoryId: "gone" })], options);
    expect(lines(csv).slice(1, 3).map((l) => l.split(";")[2])).toEqual(["", ""]);
  });

  it("marks bookings of a recurring template and tax-relevant bookings", () => {
    const csv = buildTransactionsCsv([row({ recurringTransactionId: "rec_1", taxRelevant: true })], options);
    expect(lines(csv)[1]).toBe("2026-11-17;Edeka;Lebensmittel;Ausgabe;-18,31;ja;ja");
  });

  it("quotes separators and quotes, and defuses formulas in free text", () => {
    const csv = buildTransactionsCsv(
      [
        row({ description: 'Glocke; Pflaster, "Reh"' }),
        row({ description: "=HYPERLINK(\"x\")" }),
        row({ description: "Zeile1\nZeile2" })
      ],
      options
    );
    const body = csv.split("\r\n").slice(1).join("\r\n");
    expect(body).toContain('"Glocke; Pflaster, ""Reh"""');
    expect(body).toContain(`"'=HYPERLINK(""x"")"`);
    expect(body).toContain('"Zeile1\nZeile2"');
  });

  it("writes only the header for an empty list", () => {
    expect(buildTransactionsCsv([], options)).toBe("Datum;Beschreibung;Kategorie;Typ;Betrag;Dauerauftrag;Steuerrelevant\r\n");
  });
});
