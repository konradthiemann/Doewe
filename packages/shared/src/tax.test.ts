import { describe, it, expect } from "vitest";

import { groupTaxTransactionsByCategory, type TaxTransactionInput } from "./tax";

function tx(overrides: Partial<TaxTransactionInput> & Pick<TaxTransactionInput, "id" | "amountCents">): TaxTransactionInput {
  return {
    description: "Test",
    occurredAt: new Date("2025-01-01"),
    category: null,
    attachments: [],
    ...overrides
  };
}

describe("groupTaxTransactionsByCategory", () => {
  it("groups by category and sums per category", () => {
    const category = { id: "cat_1", name: "Fortbildung" };
    const result = groupTaxTransactionsByCategory([
      tx({ id: "t1", amountCents: -10000, category, attachments: [{ id: "a1", fileName: "r.png", mimeType: "image/png", sizeBytes: 10 }] }),
      tx({ id: "t2", amountCents: -5000, category }),
      tx({ id: "t3", amountCents: -2500, category: null })
    ]);

    expect(result.categorySums).toHaveLength(2);
    const catSum = result.categorySums.find((s) => s.categoryId === "cat_1");
    expect(catSum).toMatchObject({ categoryName: "Fortbildung", totalCents: -15000, count: 2, withReceiptCount: 1 });
    const uncategorized = result.categorySums.find((s) => s.categoryId === null);
    expect(uncategorized).toMatchObject({ totalCents: -2500, count: 1, withReceiptCount: 0 });
  });

  it("sorts categorySums by |totalCents| descending", () => {
    const result = groupTaxTransactionsByCategory([
      tx({ id: "t1", amountCents: -100, category: { id: "small", name: "Small" } }),
      tx({ id: "t2", amountCents: -10000, category: { id: "big", name: "Big" } })
    ]);
    expect(result.categorySums.map((s) => s.categoryId)).toEqual(["big", "small"]);
  });

  it("separates income and expense totals (F7)", () => {
    const result = groupTaxTransactionsByCategory([
      tx({ id: "t1", amountCents: -10000 }),
      tx({ id: "t2", amountCents: -5000 }),
      tx({ id: "t3", amountCents: 3000 })
    ]);
    expect(result.totalExpenseCents).toBe(-15000);
    expect(result.totalIncomeCents).toBe(3000);
    expect(result.totalCents).toBe(-12000);
  });

  it("returns empty sums for no transactions", () => {
    const result = groupTaxTransactionsByCategory([]);
    expect(result.categorySums).toEqual([]);
    expect(result.totalCents).toBe(0);
    expect(result.totalIncomeCents).toBe(0);
    expect(result.totalExpenseCents).toBe(0);
  });
});
