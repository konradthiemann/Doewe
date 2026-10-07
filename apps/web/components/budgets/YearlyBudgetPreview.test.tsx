import { distributeYearlyBudget } from "@doewe/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "../../lib/i18n";

import { YearlyBudgetPreview } from "./YearlyBudgetPreview";

const formatCurrency = (cents: number) => `EUR ${(cents / 100).toFixed(2)}`;
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function setup(yearlyCents: number, availablePerMonthCents: number[]) {
  return render(
    <I18nProvider>
      <YearlyBudgetPreview
        yearlyCents={yearlyCents}
        availablePerMonthCents={availablePerMonthCents}
        formatCurrency={formatCurrency}
        monthLabels={monthLabels}
      />
    </I18nProvider>
  );
}

/** The list item / table row that contains the given month label. */
const rowOf = (label: string): HTMLElement => {
  const el = screen.getByText(label);
  const row = el.closest("li, tr");
  if (!row) throw new Error(`no list item or table row for ${label}`);
  return row as HTMLElement;
};

const weighted = [0, ...Array.from({ length: 11 }, () => 200000)];
const equalAvailable = Array.from({ length: 12 }, () => 100000);

describe("YearlyBudgetPreview", () => {
  it("renders all twelve month labels", () => {
    setup(1_200_000, weighted);
    for (const label of monthLabels) expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("shows the distributed value of every month in the row of its label", () => {
    setup(1_200_000, weighted);
    const expected = distributeYearlyBudget(1_200_000, weighted);
    monthLabels.forEach((label, i) => {
      expect(within(rowOf(label)).getByText(formatCurrency(expected[i]!))).toBeInTheDocument();
    });
  });

  it("gives January 0 when no amount is available there and the rest follows the weights", () => {
    setup(1_200_000, weighted);
    expect(within(rowOf("Jan")).getByText(formatCurrency(0))).toBeInTheDocument();
    // 1_200_000 / 11 = 109090.9... -> floor 109090, remainder 10 goes to the heaviest (first: Feb)
    expect(within(rowOf("Feb")).getByText(formatCurrency(109100))).toBeInTheDocument();
    expect(within(rowOf("Mar")).getByText(formatCurrency(109090))).toBeInTheDocument();
  });

  it("renders values that sum to the yearly amount", () => {
    setup(1_000_003, weighted);
    const expected = distributeYearlyBudget(1_000_003, weighted);
    expect(expected.reduce((a, b) => a + b, 0)).toBe(1_000_003);
    const shown = monthLabels.map((label, i) => within(rowOf(label)).getByText(formatCurrency(expected[i]!)));
    expect(shown).toHaveLength(12);
  });

  it("shows no even-distribution hint when at least one month has positive availability", () => {
    setup(1_200_000, weighted);
    expect(screen.queryByTestId("budgets-even-hint")).not.toBeInTheDocument();
  });

  it("shows the even-distribution hint when no month has positive availability", () => {
    setup(1_200_000, Array.from({ length: 12 }, () => 0));
    expect(screen.getByTestId("budgets-even-hint")).toBeInTheDocument();
    for (const label of monthLabels) {
      expect(within(rowOf(label)).getByText(formatCurrency(100_000))).toBeInTheDocument();
    }
  });

  it("treats negative availability as zero weight (hint when the sum of positives is 0)", () => {
    setup(1_200_001, Array.from({ length: 12 }, () => -5000));
    expect(screen.getByTestId("budgets-even-hint")).toBeInTheDocument();
    // remainder 1 cent lands on January
    expect(within(rowOf("Jan")).getByText(formatCurrency(100_001))).toBeInTheDocument();
    expect(within(rowOf("Feb")).getByText(formatCurrency(100_000))).toBeInTheDocument();
  });

  it("shows zero for every month when the yearly amount is 0", () => {
    setup(0, equalAvailable);
    for (const label of monthLabels) {
      expect(within(rowOf(label)).getByText(formatCurrency(0))).toBeInTheDocument();
    }
    expect(screen.queryByTestId("budgets-even-hint")).not.toBeInTheDocument();
  });

  it("is screen-reader friendly: a list or table with exactly twelve rows", () => {
    setup(1_200_000, equalAvailable);
    const rows = [...screen.queryAllByRole("listitem"), ...screen.queryAllByRole("row")];
    expect(rows.length).toBeGreaterThanOrEqual(12);
    expect(within(rowOf("Feb")).getByText("EUR 1000.00")).toBeInTheDocument();
  });
});
