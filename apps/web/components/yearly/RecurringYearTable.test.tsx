import type { RecurringYearGroup, RecurringYearMatrix, RecurringYearRow } from "@doewe/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "../../lib/i18n";

import { RecurringYearTable } from "./RecurringYearTable";

const formatCurrency = (cents: number) => `EUR ${(cents / 100).toFixed(2)}`;
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const zeros = () => Array.from({ length: 12 }, () => 0);

function row(overrides: Partial<RecurringYearRow> & Pick<RecurringYearRow, "id" | "description">): RecurringYearRow {
  return {
    categoryId: null,
    categoryName: null,
    kind: "expense",
    amountCents: -1000,
    intervalMonths: 1,
    monthlyCents: zeros(),
    totalCents: 0,
    ...overrides
  };
}

function group(rows: RecurringYearRow[]): RecurringYearGroup {
  const monthlyTotalsCents = zeros().map((_, i) => rows.reduce((s, r) => s + r.monthlyCents[i], 0));
  const totalCents = monthlyTotalsCents.reduce((a, b) => a + b, 0);
  return { rows, monthlyTotalsCents, totalCents, monthlyAverageCents: Math.round(totalCents / 12) };
}

const rent = row({
  id: "rent",
  description: "Miete",
  monthlyCents: [-80000, -80000, 0, -80000, -80000, -80000, -80000, -80000, -80000, -80000, -80000, -80000],
  totalCents: -880000
});
const salary = row({
  id: "salary",
  description: "Gehalt",
  kind: "income",
  amountCents: 300000,
  monthlyCents: Array.from({ length: 12 }, () => 300000),
  totalCents: 3600000
});

function matrix(parts: { income?: RecurringYearRow[]; expenses?: RecurringYearRow[]; savings?: RecurringYearRow[] }): RecurringYearMatrix {
  const income = group(parts.income ?? []);
  const expenses = group(parts.expenses ?? []);
  const savings = group(parts.savings ?? []);
  const monthlyTotalsCents = zeros().map(
    (_, i) => income.monthlyTotalsCents[i] + expenses.monthlyTotalsCents[i] + savings.monthlyTotalsCents[i]
  );
  const totalCents = monthlyTotalsCents.reduce((a, b) => a + b, 0);
  return {
    year: 2026,
    income,
    expenses,
    savings,
    net: { monthlyTotalsCents, totalCents, monthlyAverageCents: Math.round(totalCents / 12) }
  };
}

function setup(m: RecurringYearMatrix) {
  return render(
    <I18nProvider>
      <RecurringYearTable matrix={m} formatCurrency={formatCurrency} monthLabels={monthLabels} />
    </I18nProvider>
  );
}

const rowOf = (text: string): HTMLElement => {
  const cell = screen.getByText(text);
  const tr = cell.closest("tr");
  if (!tr) throw new Error(`no row for ${text}`);
  return tr;
};

describe("RecurringYearTable", () => {
  it("renders a table with an accessible name", () => {
    setup(matrix({ income: [salary], expenses: [rent] }));
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /\S/ })).toBe(table);
  });

  it("renders month labels and Summe in the header row", () => {
    setup(matrix({ expenses: [rent] }));
    const headerRow = screen.getAllByRole("row")[0];
    for (const label of monthLabels) {
      expect(within(headerRow).getByText(label)).toBeInTheDocument();
    }
    expect(within(headerRow).getByText("Summe")).toBeInTheDocument();
  });

  it("renders group headings only for groups with rows", () => {
    setup(matrix({ income: [salary], expenses: [rent] }));
    expect(screen.getByText("Einnahmen")).toBeInTheDocument();
    expect(screen.getByText("Ausgaben")).toBeInTheDocument();
    expect(screen.queryByText("Sparen")).not.toBeInTheDocument();
  });

  it("renders the savings group when it has rows", () => {
    const etf = row({ id: "etf", description: "ETF", kind: "savings", monthlyCents: Array.from({ length: 12 }, () => -20000), totalCents: -240000 });
    setup(matrix({ savings: [etf] }));
    expect(screen.getByText("Sparen")).toBeInTheDocument();
    expect(screen.getByText("ETF")).toBeInTheDocument();
    expect(screen.queryByText("Einnahmen")).not.toBeInTheDocument();
    expect(screen.queryByText("Ausgaben")).not.toBeInTheDocument();
  });

  it("renders item rows with amounts via formatCurrency and the row total", () => {
    setup(matrix({ income: [salary], expenses: [rent] }));
    const tr = rowOf("Miete");
    expect(within(tr).getAllByText("EUR -800.00")).toHaveLength(11);
    expect(within(tr).getByText("EUR -8800.00")).toBeInTheDocument();
    expect(within(rowOf("Gehalt")).getByText("EUR 36000.00")).toBeInTheDocument();
  });

  it("shows a dash instead of an amount for zero months", () => {
    setup(matrix({ expenses: [rent] }));
    const tr = rowOf("Miete");
    expect(within(tr).getAllByText("–")).toHaveLength(1);
    expect(within(tr).queryByText("EUR 0.00")).not.toBeInTheDocument();
  });

  it("renders a sum row per group", () => {
    setup(matrix({ income: [salary], expenses: [rent] }));
    // Group sum rows repeat the group total; "Summe" also appears in the header.
    expect(screen.getAllByText("Summe").length).toBeGreaterThanOrEqual(3);
  });

  it("renders the Saldo row with the net totals", () => {
    const m = matrix({ income: [salary], expenses: [rent] });
    setup(m);
    const tr = rowOf("Saldo");
    // March: 3000 income, rent skipped -> 3000.00; other months 2200.00
    expect(within(tr).getAllByText("EUR 2200.00")).toHaveLength(11);
    expect(within(tr).getByText("EUR 3000.00")).toBeInTheDocument();
    expect(within(tr).getByText(formatCurrency(m.net.totalCents))).toBeInTheDocument();
  });

  it("renders the Ø Monat row with the monthly average", () => {
    const m = matrix({ income: [salary], expenses: [rent] });
    setup(m);
    const tr = rowOf("Ø Monat");
    expect(within(tr).getByText(formatCurrency(m.net.monthlyAverageCents))).toBeInTheDocument();
  });

  it("marks the first column (description) as sticky", () => {
    setup(matrix({ income: [salary], expenses: [rent] }));
    const first = rowOf("Miete").querySelector("th, td");
    expect(first).not.toBeNull();
    expect(first!.className).toContain("sticky");
    const headFirst = screen.getAllByRole("row")[0].querySelector("th, td");
    expect(headFirst!.className).toContain("sticky");
  });
});
