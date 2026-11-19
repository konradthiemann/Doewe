import { describe, expect, it } from "vitest";

import {
  addFlow,
  classifyFlow,
  emptyFlowTotals,
  isSavingsCategoryName,
  savingsCategoryIds,
  sumFlows
} from "./cashflow";

const SAVINGS = new Set(["cat-savings"]);

describe("isSavingsCategoryName / savingsCategoryIds", () => {
  it("matches the English and German name regardless of case and surrounding whitespace", () => {
    for (const name of ["savings", "Savings", "SPAREN", " Sparen ", "sparen\t"]) {
      expect(isSavingsCategoryName(name)).toBe(true);
    }
  });

  it("does not match names that merely contain the word", () => {
    for (const name of ["Sparen Urlaub", "Bausparen", "My savings", ""]) {
      expect(isSavingsCategoryName(name)).toBe(false);
    }
  });

  it("returns every matching category, not just the first", () => {
    const ids = savingsCategoryIds([
      { id: "a", name: "Groceries" },
      { id: "b", name: "Savings" },
      { id: "c", name: " sparen" }
    ]);
    expect([...ids].sort()).toEqual(["b", "c"]);
  });
});

describe("classifyFlow", () => {
  it("classifies by sign outside the savings category", () => {
    expect(classifyFlow({ amountCents: 100, categoryId: "cat-x" }, SAVINGS)).toBe("income");
    expect(classifyFlow({ amountCents: -100, categoryId: "cat-x" }, SAVINGS)).toBe("outcome");
    expect(classifyFlow({ amountCents: -100, categoryId: null }, SAVINGS)).toBe("outcome");
  });

  it("treats a zero amount as income, so every row has exactly one class", () => {
    expect(classifyFlow({ amountCents: 0, categoryId: null }, SAVINGS)).toBe("income");
  });

  it("checks the savings category before the sign", () => {
    expect(classifyFlow({ amountCents: -5000, categoryId: "cat-savings" }, SAVINGS)).toBe("savings");
    expect(classifyFlow({ amountCents: 5000, categoryId: "cat-savings" }, SAVINGS)).toBe("savings");
  });
});

describe("sumFlows", () => {
  const rows = [
    { amountCents: 250_000, categoryId: "cat-salary" },
    { amountCents: -80_000, categoryId: "cat-rent" },
    { amountCents: -4_599, categoryId: null },
    { amountCents: 1_500, categoryId: "cat-rent" }, // refund: income, does not reduce outcome
    { amountCents: -30_000, categoryId: "cat-savings" }, // deposit
    { amountCents: 10_000, categoryId: "cat-savings" } // withdrawal
  ];

  it("keeps savings out of income and outcome and nets deposits against withdrawals", () => {
    expect(sumFlows(rows, SAVINGS)).toEqual({
      incomeCents: 251_500,
      outcomeCents: 84_599,
      savingsCents: 20_000,
      netCents: 146_901
    });
  });

  it("always satisfies net = income − outcome − savings = plain sum of the amounts", () => {
    const totals = sumFlows(rows, SAVINGS);
    const plainSum = rows.reduce((sum, row) => sum + row.amountCents, 0);
    expect(totals.netCents).toBe(plainSum);
    expect(totals.incomeCents - totals.outcomeCents - totals.savingsCents).toBe(plainSum);
  });

  it("reports negative savings when more was withdrawn than deposited", () => {
    const totals = sumFlows([{ amountCents: 7_000, categoryId: "cat-savings" }], SAVINGS);
    expect(totals).toEqual({ incomeCents: 0, outcomeCents: 0, savingsCents: -7_000, netCents: 7_000 });
  });

  it("without any savings category everything is income or outcome", () => {
    const totals = sumFlows(rows, new Set());
    expect(totals.savingsCents).toBe(0);
    expect(totals.incomeCents).toBe(261_500);
    expect(totals.outcomeCents).toBe(114_599);
  });

  it("accumulates row by row through addFlow", () => {
    const totals = emptyFlowTotals();
    expect(addFlow(totals, rows[1], SAVINGS)).toBe("outcome");
    expect(addFlow(totals, rows[4], SAVINGS)).toBe("savings");
    expect(totals).toEqual({ incomeCents: 0, outcomeCents: 80_000, savingsCents: 30_000, netCents: -110_000 });
  });
});
