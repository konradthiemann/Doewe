import { describe, expect, it } from "vitest";

import { toBreakdownRows, type DashboardCategoryBudget } from "../lib/budgetRows";

function item(overrides: Partial<DashboardCategoryBudget> & Pick<DashboardCategoryBudget, "categoryId" | "name">): DashboardCategoryBudget {
  return { budget: 0, spent: 0, diff: 0, ...overrides };
}

describe("toBreakdownRows", () => {
  it("returns an empty array for an empty list", () => {
    expect(toBreakdownRows([])).toEqual([]);
  });

  it("maps id, name and converts euros to integer cents", () => {
    const rows = toBreakdownRows([
      item({ categoryId: "c1", name: "Food", budget: 42, spent: 113.66, diff: -71.66 })
    ]);
    expect(rows).toEqual([
      { id: "c1", name: "Food", spentCents: 11366, budgetCents: 4200, transactionCount: 0 }
    ]);
  });

  it.each([
    [42, 4200],
    [113.66, 11366],
    [679.33, 67933],
    [19.99, 1999],
    [0.29, 29],
    [0.1 + 0.2, 30],
    [0, 0]
  ])("converts %s EUR to %s cents without float drift", (euro, cents) => {
    const [row] = toBreakdownRows([item({ categoryId: "c", name: "X", spent: euro, budget: euro })]);
    expect(row.spentCents).toBe(cents);
    expect(row.budgetCents).toBe(cents);
    expect(Number.isInteger(row.spentCents)).toBe(true);
  });

  it("keeps the input order", () => {
    const rows = toBreakdownRows([
      item({ categoryId: "b", name: "B" }),
      item({ categoryId: "a", name: "A" }),
      item({ categoryId: "c", name: "C" })
    ]);
    expect(rows.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("omits the transactions field entirely (rows must not be expandable)", () => {
    const [row] = toBreakdownRows([item({ categoryId: "c1", name: "Food", spent: 1, budget: 2 })]);
    expect("transactions" in row).toBe(false);
    expect(row.transactionCount).toBe(0);
  });
});
