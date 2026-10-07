import type { CategoryYearGroup, CategoryYearMatrix, CategoryYearRow } from "@doewe/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "../../lib/i18n";

import { CategoryYearTable } from "./CategoryYearTable";

// Column layout the implementation must follow:
// [0] category (sticky), [1..12] months, [13] Summe, [14] Budget (Jahr).
// Status attribute `data-budget-status` lives on the month cells and the Summe cell of a category row.
const formatCurrency = (cents: number) => `EUR ${(cents / 100).toFixed(2)}`;
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const zeros = () => Array.from({ length: 12 }, () => 0);
const flat = (cents: number) => Array.from({ length: 12 }, () => cents);
const at = (entries: Record<number, number>): number[] => {
  const out = zeros();
  for (const [month, cents] of Object.entries(entries)) out[Number(month) - 1] = cents;
  return out;
};

function row(o: Partial<CategoryYearRow> & Pick<CategoryYearRow, "id" | "name">): CategoryYearRow {
  const monthlyCents = o.monthlyCents ?? zeros();
  return {
    kind: "expense",
    monthlyCents,
    totalCents: monthlyCents.reduce((a, b) => a + b, 0),
    budgetMonthlyCents: null,
    budgetTotalCents: null,
    overMonths: [],
    overYear: false,
    ...o
  };
}

function group(rows: CategoryYearRow[]): CategoryYearGroup {
  const monthlyTotalsCents = zeros().map((_, i) => rows.reduce((s, r) => s + r.monthlyCents[i]!, 0));
  return { rows, monthlyTotalsCents, totalCents: monthlyTotalsCents.reduce((a, b) => a + b, 0) };
}

function matrix(parts: { income?: CategoryYearRow[]; expenses?: CategoryYearRow[]; savings?: CategoryYearRow[] }): CategoryYearMatrix {
  const income = group(parts.income ?? []);
  const expenses = group(parts.expenses ?? []);
  const savings = group(parts.savings ?? []);
  const balanceMonthlyCents = zeros().map(
    (_, i) => income.monthlyTotalsCents[i]! - expenses.monthlyTotalsCents[i]! - savings.monthlyTotalsCents[i]!
  );
  return {
    year: 2036,
    income,
    expenses,
    savings,
    balanceMonthlyCents,
    balanceTotalCents: balanceMonthlyCents.reduce((a, b) => a + b, 0)
  };
}

function setup(m: CategoryYearMatrix) {
  return render(
    <I18nProvider>
      <CategoryYearTable matrix={m} formatCurrency={formatCurrency} monthLabels={monthLabels} uncategorizedLabel="Ohne Kategorie" />
    </I18nProvider>
  );
}

const rowOf = (text: string): HTMLElement => {
  const tr = screen.getByText(text).closest("tr");
  if (!tr) throw new Error(`no row for ${text}`);
  return tr;
};
const cells = (tr: HTMLElement): HTMLElement[] => Array.from(tr.children) as HTMLElement[];
const monthCell = (tr: HTMLElement, month: number): HTMLElement => cells(tr)[month]!;
const totalCell = (tr: HTMLElement): HTMLElement => cells(tr)[13]!;
const budgetCell = (tr: HTMLElement): HTMLElement => cells(tr)[14]!;
const statusOf = (el: HTMLElement) => el.getAttribute("data-budget-status");

// Food: budget 10000 per month. March 12000 (over), April 8500 (warn: >= 85%), May 8499 (ok), June 10000 (at budget -> warn, not over)
const food = row({
  id: "food",
  name: "Lebensmittel",
  monthlyCents: at({ 3: 12000, 4: 8500, 5: 8499, 6: 10000 }),
  budgetMonthlyCents: flat(10000),
  budgetTotalCents: 120000,
  overMonths: [3],
  overYear: false
});
const rent = row({ id: "rent", name: "Miete", monthlyCents: flat(80000) });
const salary = row({ id: "salary", name: "Gehalt", kind: "income", monthlyCents: flat(300000) });

describe("CategoryYearTable", () => {
  it("renders a table with an accessible name", () => {
    setup(matrix({ expenses: [food] }));
    const table = screen.getByRole("table");
    expect(screen.getByRole("table", { name: /\S/ })).toBe(table);
  });

  it("renders the header: Kategorie, 12 month labels, Summe, Budget (Jahr)", () => {
    setup(matrix({ expenses: [food] }));
    const header = screen.getAllByRole("row")[0]!;
    expect(within(header).getByText("Kategorie")).toBeInTheDocument();
    for (const label of monthLabels) expect(within(header).getByText(label)).toBeInTheDocument();
    expect(within(header).getByText("Summe")).toBeInTheDocument();
    expect(within(header).getByText("Budget (Jahr)")).toBeInTheDocument();
  });

  it("renders group headings only for groups with rows, expenses first", () => {
    setup(matrix({ income: [salary], expenses: [rent] }));
    const ausgaben = screen.getByText("Ausgaben");
    const einnahmen = screen.getByText("Einnahmen");
    expect(screen.queryByText("Sparen")).not.toBeInTheDocument();
    expect(ausgaben.compareDocumentPosition(einnahmen) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders the savings group with its rows", () => {
    const etf = row({ id: "sav", name: "ETF", kind: "savings", monthlyCents: flat(20000) });
    setup(matrix({ savings: [etf] }));
    expect(screen.getByText("Sparen")).toBeInTheDocument();
    expect(screen.getByText("ETF")).toBeInTheDocument();
    expect(screen.queryByText("Einnahmen")).not.toBeInTheDocument();
    expect(screen.queryByText("Ausgaben")).not.toBeInTheDocument();
  });

  it("renders amounts via formatCurrency, row total, and a dash for zero months", () => {
    setup(matrix({ expenses: [food] }));
    const tr = rowOf("Lebensmittel");
    expect(within(monthCell(tr, 3)).getByText("EUR 120.00")).toBeInTheDocument();
    expect(within(monthCell(tr, 4)).getByText("EUR 85.00")).toBeInTheDocument();
    expect(within(totalCell(tr)).getByText(formatCurrency(food.totalCents))).toBeInTheDocument();
    expect(within(monthCell(tr, 1)).getByText("–")).toBeInTheDocument();
    expect(within(monthCell(tr, 1)).queryByText("EUR 0.00")).not.toBeInTheDocument();
  });

  it("shows the yearly budget formatted, or a dash without a budget", () => {
    setup(matrix({ expenses: [food, rent] }));
    expect(within(budgetCell(rowOf("Lebensmittel"))).getByText("EUR 1200.00")).toBeInTheDocument();
    expect(within(budgetCell(rowOf("Miete"))).getByText("–")).toBeInTheDocument();
  });

  it("marks months over budget with data-budget-status=over and a danger class", () => {
    setup(matrix({ expenses: [food] }));
    const cell = monthCell(rowOf("Lebensmittel"), 3);
    expect(statusOf(cell)).toBe("over");
    expect(cell.className).toContain("danger");
    expect(cells(rowOf("Lebensmittel")).filter((c) => statusOf(c) === "over")).toHaveLength(1);
  });

  it("marks months at 85% or more but not over as warn, below as ok", () => {
    setup(matrix({ expenses: [food] }));
    const tr = rowOf("Lebensmittel");
    expect(statusOf(monthCell(tr, 4))).toBe("warn"); // 85.00 %
    expect(statusOf(monthCell(tr, 5))).toBe("ok"); // 84.99 %
    expect(statusOf(monthCell(tr, 6))).toBe("warn"); // exactly at budget is not over
    expect(statusOf(monthCell(tr, 1))).toBe("ok"); // zero spend with budget
  });

  it("marks months without a budget (null) as none and never over", () => {
    const partial = row({
      id: "partial",
      name: "Teilbudget",
      monthlyCents: at({ 1: 20000, 2: 20000 }),
      budgetMonthlyCents: [10000, ...Array.from({ length: 11 }, () => null)],
      budgetTotalCents: 10000,
      overMonths: [1],
      overYear: true
    });
    setup(matrix({ expenses: [partial] }));
    const tr = rowOf("Teilbudget");
    expect(statusOf(monthCell(tr, 1))).toBe("over");
    expect(statusOf(monthCell(tr, 2))).toBe("none");
    expect(statusOf(monthCell(tr, 7))).toBe("none");
  });

  it("derives the Summe cell status from overYear / budget share", () => {
    const yearOver = row({
      id: "yo",
      name: "Jahr ueber",
      monthlyCents: flat(1100),
      budgetMonthlyCents: flat(1000),
      budgetTotalCents: 12000,
      overYear: true
    });
    const yearWarn = row({ id: "yw", name: "Jahr knapp", monthlyCents: flat(900), budgetMonthlyCents: flat(1000), budgetTotalCents: 12000 });
    const yearOk = row({ id: "yk", name: "Jahr ok", monthlyCents: flat(100), budgetMonthlyCents: flat(1000), budgetTotalCents: 12000 });
    setup(matrix({ expenses: [yearOver, yearWarn, yearOk, rent] }));
    expect(statusOf(totalCell(rowOf("Jahr ueber")))).toBe("over");
    expect(totalCell(rowOf("Jahr ueber")).className).toContain("danger");
    expect(statusOf(totalCell(rowOf("Jahr knapp")))).toBe("warn");
    expect(statusOf(totalCell(rowOf("Jahr ok")))).toBe("ok");
    expect(statusOf(totalCell(rowOf("Miete")))).toBe("none");
  });

  it("never renders over for rows without a budget", () => {
    setup(matrix({ income: [salary], expenses: [rent] }));
    for (const name of ["Gehalt", "Miete"]) {
      const tr = rowOf(name);
      expect(tr.querySelectorAll('[data-budget-status="over"]')).toHaveLength(0);
      expect(statusOf(monthCell(tr, 2))).toBe("none");
    }
  });

  it("renders a sum row per group with the group totals", () => {
    const m = matrix({ income: [salary], expenses: [rent] });
    setup(m);
    const sumRows = screen.getAllByRole("row").filter((tr) => within(tr).queryAllByText("Summe").length > 0 && tr !== screen.getAllByRole("row")[0]);
    expect(sumRows).toHaveLength(2);
    const texts = sumRows.map((tr) => tr.textContent ?? "");
    expect(texts.some((t) => t.includes(formatCurrency(m.expenses.totalCents)))).toBe(true);
    expect(texts.some((t) => t.includes(formatCurrency(m.income.totalCents)))).toBe(true);
  });

  it("renders exactly one Saldo row with the balance", () => {
    const m = matrix({ income: [salary], expenses: [rent] });
    setup(m);
    expect(screen.getAllByText("Saldo")).toHaveLength(1);
    const tr = rowOf("Saldo");
    // 3000 - 800 = 2200 per month
    expect(within(tr).getAllByText("EUR 2200.00")).toHaveLength(12);
    expect(within(tr).getByText(formatCurrency(m.balanceTotalCents))).toBeInTheDocument();
  });

  it("shows the uncategorized label for the uncategorized row", () => {
    const unc = row({ id: "uncategorized", name: "", monthlyCents: at({ 2: 1500 }) });
    setup(matrix({ expenses: [unc] }));
    const tr = rowOf("Ohne Kategorie");
    expect(within(monthCell(tr, 2)).getByText("EUR 15.00")).toBeInTheDocument();
  });

  it("marks the first column as sticky in header and body", () => {
    setup(matrix({ expenses: [food] }));
    expect(cells(screen.getAllByRole("row")[0]!)[0]!.className).toContain("sticky");
    expect(cells(rowOf("Lebensmittel"))[0]!.className).toContain("sticky");
  });

  it("renders a textual budget legend", () => {
    setup(matrix({ expenses: [food] }));
    const legend = screen.getByTestId("budget-legend");
    expect(legend.textContent?.trim().length).toBeGreaterThan(0);
  });
});
