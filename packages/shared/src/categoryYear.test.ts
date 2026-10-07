import { describe, expect, it } from "vitest";

import {
  buildCategoryYearMatrix,
  type CategoryYearCategory,
  type CategoryYearRow,
  type CategoryYearTx
} from "./categoryYear";

const zeros = () => Array.from({ length: 12 }, () => 0);
const at = (entries: Record<number, number>): number[] => {
  const out = zeros();
  for (const [month, cents] of Object.entries(entries)) out[Number(month) - 1] = cents;
  return out;
};
const flat = (cents: number): number[] => Array.from({ length: 12 }, () => cents);

const food: CategoryYearCategory = { id: "food", name: "Food", kind: "expense" };
const rent: CategoryYearCategory = { id: "rent", name: "Rent", kind: "expense" };
const salary: CategoryYearCategory = { id: "salary", name: "Salary", kind: "income" };
const savings: CategoryYearCategory = { id: "sav", name: "Savings", kind: "savings" };

const tx = (categoryId: string | null, amountCents: number, month: number): CategoryYearTx => ({
  categoryId,
  amountCents,
  month
});

function build(
  transactions: CategoryYearTx[],
  budgetsByCategory: Record<string, (number | null)[]> = {},
  categories: CategoryYearCategory[] = [food, rent, salary, savings]
) {
  return buildCategoryYearMatrix({ year: 2036, categories, transactions, budgetsByCategory });
}

const rowOf = (rows: CategoryYearRow[], id: string): CategoryYearRow => {
  const found = rows.find((r) => r.id === id);
  if (!found) throw new Error(`row ${id} missing`);
  return found;
};

describe("buildCategoryYearMatrix", () => {
  it("returns 12 zeros and empty groups for empty input", () => {
    const m = build([], {}, []);
    expect(m.year).toBe(2036);
    for (const g of [m.income, m.expenses, m.savings]) {
      expect(g.rows).toEqual([]);
      expect(g.monthlyTotalsCents).toEqual(zeros());
      expect(g.totalCents).toBe(0);
    }
    expect(m.balanceMonthlyCents).toEqual(zeros());
    expect(m.balanceTotalCents).toBe(0);
  });

  it("sums expenses per month as positive magnitudes", () => {
    const m = build([tx("food", -5000, 3), tx("food", -2500, 3), tx("food", -1000, 7)]);
    const row = rowOf(m.expenses.rows, "food");
    expect(row).toMatchObject({ id: "food", name: "Food", kind: "expense" });
    expect(row.monthlyCents).toEqual(at({ 3: 7500, 7: 1000 }));
    expect(row.totalCents).toBe(8500);
    expect(m.expenses.monthlyTotalsCents).toEqual(at({ 3: 7500, 7: 1000 }));
    expect(m.expenses.totalCents).toBe(8500);
  });

  it("lets a refund (positive amount) reduce an expense category", () => {
    const m = build([tx("food", -5000, 2), tx("food", 1500, 2)]);
    expect(rowOf(m.expenses.rows, "food").monthlyCents).toEqual(at({ 2: 3500 }));
    expect(rowOf(m.expenses.rows, "food").totalCents).toBe(3500);
  });

  it("sums income categories as positive amounts", () => {
    const m = build([tx("salary", 300000, 1), tx("salary", 300000, 2)]);
    const row = rowOf(m.income.rows, "salary");
    expect(row.kind).toBe("income");
    expect(row.monthlyCents).toEqual(at({ 1: 300000, 2: 300000 }));
    expect(row.totalCents).toBe(600000);
    expect(m.income.totalCents).toBe(600000);
    expect(m.expenses.rows).toEqual([]);
  });

  it("counts a savings deposit (stored negative) positive and a withdrawal as reduction", () => {
    const m = build([tx("sav", -20000, 1), tx("sav", -20000, 2), tx("sav", 5000, 2)]);
    const row = rowOf(m.savings.rows, "sav");
    expect(row.kind).toBe("savings");
    expect(row.monthlyCents).toEqual(at({ 1: 20000, 2: 15000 }));
    expect(row.totalCents).toBe(35000);
    expect(m.savings.monthlyTotalsCents).toEqual(at({ 1: 20000, 2: 15000 }));
    expect(m.expenses.rows).toEqual([]);
  });

  it("computes balance per month as income - expenses - savings", () => {
    const m = build([
      tx("salary", 300000, 1),
      tx("food", -50000, 1),
      tx("sav", -20000, 1),
      tx("food", -10000, 2)
    ]);
    expect(m.balanceMonthlyCents).toEqual(at({ 1: 230000, 2: -10000 }));
    expect(m.balanceTotalCents).toBe(220000);
  });

  it("marks a month over budget only when strictly above the budget", () => {
    const m = build([tx("food", -12000, 3)], { food: flat(10000) });
    const row = rowOf(m.expenses.rows, "food");
    expect(row.overMonths).toEqual([3]);
    expect(row.budgetMonthlyCents).toEqual(flat(10000));
    expect(row.budgetTotalCents).toBe(120000);
    expect(row.overYear).toBe(false);
  });

  it("does not mark a month exactly at the budget", () => {
    const m = build([tx("food", -10000, 3)], { food: flat(10000) });
    expect(rowOf(m.expenses.rows, "food").overMonths).toEqual([]);
  });

  it("never marks months without a budget (null) and ignores a budget of 0", () => {
    const budget = at({ 1: 5000, 2: 0 }).map((v, i) => (i === 0 || i === 1 ? v : null));
    const m = build([tx("food", -9000, 1), tx("food", -9000, 2), tx("food", -9000, 3)], { food: budget });
    const row = rowOf(m.expenses.rows, "food");
    expect(row.overMonths).toEqual([1]);
    expect(row.budgetMonthlyCents).toEqual(budget);
  });

  it("has no budget fields set for a category that never has a budget", () => {
    const m = build([tx("food", -9000, 1)]);
    const row = rowOf(m.expenses.rows, "food");
    expect(row.budgetMonthlyCents).toBeNull();
    expect(row.budgetTotalCents).toBeNull();
    expect(row.overMonths).toEqual([]);
    expect(row.overYear).toBe(false);
  });

  it("sets overYear when the year spend exceeds the year budget", () => {
    const m = build([tx("food", -60000, 1), tx("food", -70000, 2)], { food: flat(10000) });
    const row = rowOf(m.expenses.rows, "food");
    expect(row.budgetTotalCents).toBe(120000);
    expect(row.overYear).toBe(true);
  });

  it("counts only months WITH a budget for overYear (partial budgets)", () => {
    // Budget only in Jan+Feb (2 x 10000 = 20000). Spend in Jan/Feb 15000 total -> not over;
    // spend of 99999 in a month without budget must not count.
    const budget = [10000, 10000, ...Array.from({ length: 10 }, () => null)];
    const m = build([tx("food", -7500, 1), tx("food", -7500, 2), tx("food", -99999, 6)], { food: budget });
    const row = rowOf(m.expenses.rows, "food");
    expect(row.budgetTotalCents).toBe(20000);
    expect(row.overYear).toBe(false);
    expect(row.overMonths).toEqual([]);
    expect(row.totalCents).toBe(114999);
  });

  it("sets overYear for partial budgets when the budgeted months exceed their sum", () => {
    const budget = [10000, 10000, ...Array.from({ length: 10 }, () => null)];
    const m = build([tx("food", -15000, 1), tx("food", -6000, 2), tx("food", -1, 6)], { food: budget });
    const row = rowOf(m.expenses.rows, "food");
    expect(row.overYear).toBe(true);
    expect(row.overMonths).toEqual([1]);
  });

  it("creates a zero row for a budget-only category", () => {
    const m = build([], { food: flat(10000) });
    const row = rowOf(m.expenses.rows, "food");
    expect(row.monthlyCents).toEqual(zeros());
    expect(row.totalCents).toBe(0);
    expect(row.budgetTotalCents).toBe(120000);
    expect(row.overMonths).toEqual([]);
    expect(row.overYear).toBe(false);
  });

  it("books null and unknown categories as uncategorized expense for negative amounts", () => {
    const m = build([tx(null, -1000, 4), tx("ghost", -500, 4)]);
    const row = rowOf(m.expenses.rows, "uncategorized");
    expect(row).toMatchObject({ id: "uncategorized", name: "", kind: "expense" });
    expect(row.monthlyCents).toEqual(at({ 4: 1500 }));
    expect(m.expenses.rows.filter((r) => r.id === "uncategorized")).toHaveLength(1);
    expect(m.income.rows).toEqual([]);
  });

  it("books null categories as uncategorized income for positive amounts", () => {
    const m = build([tx(null, 2500, 5), tx("ghost", 500, 5)]);
    const row = rowOf(m.income.rows, "uncategorized");
    expect(row).toMatchObject({ id: "uncategorized", name: "", kind: "income" });
    expect(row.monthlyCents).toEqual(at({ 5: 3000 }));
    expect(m.expenses.rows).toEqual([]);
  });

  it("allows uncategorized in both groups at once", () => {
    const m = build([tx(null, -1000, 1), tx(null, 4000, 1)]);
    expect(rowOf(m.expenses.rows, "uncategorized").totalCents).toBe(1000);
    expect(rowOf(m.income.rows, "uncategorized").totalCents).toBe(4000);
    expect(m.balanceMonthlyCents).toEqual(at({ 1: 3000 }));
  });

  it("sorts by total descending, ties by name ascending, uncategorized last", () => {
    const zeta: CategoryYearCategory = { id: "z", name: "Zeta", kind: "expense" };
    const alpha: CategoryYearCategory = { id: "a", name: "Älpha", kind: "expense" };
    const big: CategoryYearCategory = { id: "b", name: "Big", kind: "expense" };
    const m = build(
      [
        tx("z", -1000, 1),
        tx("a", -1000, 1),
        tx("b", -5000, 1),
        tx(null, -999999, 1) // largest, but still last
      ],
      {},
      [zeta, alpha, big]
    );
    expect(m.expenses.rows.map((r) => r.id)).toEqual(["b", "a", "z", "uncategorized"]);
  });

  it("does not mutate its input", () => {
    const categories = [food, salary];
    const transactions = [tx("food", -5000, 1), tx(null, 100, 2)];
    const budgets = { food: flat(10000) };
    const snapshot = JSON.stringify({ categories, transactions, budgets });
    buildCategoryYearMatrix({ year: 2036, categories, transactions, budgetsByCategory: budgets });
    expect(JSON.stringify({ categories, transactions, budgets })).toBe(snapshot);
  });
});
