import { describe, expect, it } from "vitest";

import {
  bookedTotalCents,
  buildBatchRequest,
  groupBookableLines,
  inheritedTaxRelevance,
  lineTotalCents,
  receiptDayOrToday
} from "../lib/receiptLines";

describe("lineTotalCents", () => {
  it("is quantity × unit price for whole quantities", () => {
    expect(lineTotalCents(1, 1299)).toBe(1299);
    expect(lineTotalCents(3, 199)).toBe(597);
    expect(lineTotalCents(2, 0)).toBe(0);
  });

  it("rounds a fractional quantity to whole cents", () => {
    // 0.345 kg × 12.99 €/kg = 4.48155 € → 4.48 €; the raw product is not an integer.
    expect(0.345 * 1299).not.toBe(Math.round(0.345 * 1299));
    expect(lineTotalCents(0.345, 1299)).toBe(448);
    expect(Number.isInteger(lineTotalCents(0.345, 1299))).toBe(true);
    expect(lineTotalCents(1.5, 333)).toBe(500); // 499.5 → 500
    expect(lineTotalCents(0.001, 100)).toBe(0);
  });

  it("rounds exact half cents up, independent of binary fractions", () => {
    // 1.005 × 100 is 100.49999999999999 in floating point.
    expect(lineTotalCents(1.005, 100)).toBe(101);
    expect(lineTotalCents(0.125, 100)).toBe(13);
  });
});

describe("groupBookableLines / bookedTotalCents", () => {
  const categories = [
    { id: "food", name: "Lebensmittel" },
    { id: "gifts", name: "Geschenke" }
  ];
  const line = (name: string, categoryId: string, totalCents: number) => ({ name, categoryId, totalCents });

  it("groups named lines by category and sums each group", () => {
    const groups = groupBookableLines(
      [line("Milch", "food", 129), line("Schokolade", "gifts", 249), line("Brot", "food", 350)],
      categories
    );
    expect(groups.map((g) => [g.category.id, g.items.map((i) => i.name), g.totalCents])).toEqual([
      ["food", ["Milch", "Brot"], 479],
      ["gifts", ["Schokolade"], 249]
    ]);
    expect(bookedTotalCents(groups)).toBe(728);
  });

  it("leaves out lines without a name — they are not booked and not part of the total", () => {
    const groups = groupBookableLines([line("Milch", "food", 129), line("   ", "food", 999), line("", "gifts", 500)], categories);
    expect(groups).toHaveLength(1);
    expect(groups[0].totalCents).toBe(129);
    expect(bookedTotalCents(groups)).toBe(129);
  });

  it("leaves out lines in an unknown category", () => {
    const groups = groupBookableLines([line("Milch", "gone", 129)], categories);
    expect(groups).toEqual([]);
    expect(bookedTotalCents(groups)).toBe(0);
  });

  it("totals what the batch endpoint books: one expense of the absolute amount per group", () => {
    // A deposit refund makes the first group smaller; a group of only negative
    // lines is still booked as an expense of its absolute amount.
    const groups = groupBookableLines(
      [line("Wasser", "food", 499), line("Pfand zurück", "food", -100), line("Rabatt", "gifts", -50)],
      categories
    );
    expect(groups.map((g) => g.totalCents)).toEqual([399, -50]);
    expect(bookedTotalCents(groups)).toBe(449);
  });
});

describe("receiptDayOrToday", () => {
  /** 1 Nov 2026, 00:30 in Berlin — still 31 Oct in UTC and in Los Angeles. */
  const now = new Date("2026-10-31T23:30:00.000Z");

  it("keeps a scanned date that is a real calendar day", () => {
    expect(receiptDayOrToday("2026-10-17", now)).toBe("2026-10-17");
    expect(receiptDayOrToday("2028-02-29", now)).toBe("2028-02-29");
  });

  it("falls back to today in Berlin for anything else", () => {
    for (const sloppy of ["", "17.10.2026", "2026-10-17T12:00:00Z", "2026-02-30", "2026-13-01", "unbekannt", null, undefined, 20261017]) {
      expect(receiptDayOrToday(sloppy, now)).toBe("2026-11-01");
    }
  });
});

describe("inheritedTaxRelevance", () => {
  const group = (isTaxRelevant?: boolean) => ({ category: { isTaxRelevant } });

  it("is all / none / mixed according to the categories of the groups", () => {
    expect(inheritedTaxRelevance([group(true), group(true)])).toBe("all");
    expect(inheritedTaxRelevance([group(false), group(undefined)])).toBe("none");
    expect(inheritedTaxRelevance([group(true), group(false)])).toBe("mixed");
  });

  it("is none when nothing will be booked", () => {
    expect(inheritedTaxRelevance([])).toBe("none");
  });
});

describe("buildBatchRequest", () => {
  const item = { name: "Milch", quantity: 2, unitPriceCents: 129, totalCents: 258, position: 0, categoryId: "food" };
  const base = {
    receiptDate: "2026-10-17",
    merchant: "REWE",
    accountId: "acc-1",
    groups: [{ category: { id: "food", name: "Lebensmittel" }, items: [item], totalCents: 258 }]
  };

  it("omits taxRelevant while the switch is untouched, so each booking inherits its category's flag", () => {
    const body = buildBatchRequest({ ...base, taxOverride: null });
    expect("taxRelevant" in body).toBe(false);
    expect(JSON.parse(JSON.stringify(body))).toEqual({
      receiptDate: "2026-10-17",
      receiptMerchant: "REWE",
      accountId: "acc-1",
      groups: [
        { categoryId: "food", items: [{ name: "Milch", quantity: 2, unitPriceCents: 129, totalCents: 258, position: 0 }] }
      ]
    });
  });

  it("sends the user's explicit choice, also an explicit false", () => {
    expect(buildBatchRequest({ ...base, taxOverride: true }).taxRelevant).toBe(true);
    const off = buildBatchRequest({ ...base, taxOverride: false });
    expect("taxRelevant" in off).toBe(true);
    expect(off.taxRelevant).toBe(false);
  });

  it("omits an empty merchant", () => {
    expect(JSON.parse(JSON.stringify(buildBatchRequest({ ...base, merchant: "", taxOverride: null })))).not.toHaveProperty(
      "receiptMerchant"
    );
  });
});
