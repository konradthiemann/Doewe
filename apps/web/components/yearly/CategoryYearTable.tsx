"use client";

import { Fragment } from "react";

import { useI18n } from "../../lib/i18n";

import type { CategoryYearGroup, CategoryYearMatrix, CategoryYearRow } from "@doewe/shared";

type Props = {
  matrix: CategoryYearMatrix;
  formatCurrency: (cents: number) => string;
  /** 12 short month names, Jan-Dec. */
  monthLabels: string[];
  /** Label for the row of bookings without a category (`id === "uncategorized"`). */
  uncategorizedLabel: string;
};

type BudgetStatus = "over" | "warn" | "ok" | "none";

/** Share of the budget (in percent) from which a cell counts as "nearly over". */
const WARN_PERCENT = 85;

const stickyCell = "sticky left-0 z-10 bg-surface";
const numCell = "whitespace-nowrap px-3 py-2 text-right tabular-nums";
const statusClass: Record<BudgetStatus, string> = {
  over: "bg-danger-soft text-danger font-medium",
  warn: "bg-warning-soft text-warning",
  ok: "",
  none: ""
};

function monthStatus(row: CategoryYearRow, index: number): BudgetStatus {
  if (row.overMonths.includes(index + 1)) return "over";
  const budget = row.budgetMonthlyCents?.[index];
  if (budget === null || budget === undefined || budget <= 0) return "none";
  return (row.monthlyCents[index] ?? 0) * 100 >= budget * WARN_PERCENT ? "warn" : "ok";
}

function yearStatus(row: CategoryYearRow): BudgetStatus {
  const budget = row.budgetMonthlyCents;
  if (!budget) return "none";
  if (row.overYear) return "over";
  // Compare only the months that carry a budget, like the server does for overYear.
  let spent = 0;
  let limit = 0;
  budget.forEach((cents, index) => {
    if (cents === null || cents <= 0) return;
    spent += row.monthlyCents[index] ?? 0;
    limit += cents;
  });
  if (limit <= 0) return "none";
  return spent * 100 >= limit * WARN_PERCENT ? "warn" : "ok";
}

export function CategoryYearTable({ matrix, formatCurrency, monthLabels, uncategorizedLabel }: Props) {
  const { t } = useI18n();

  const amount = (cents: number) =>
    cents === 0 ? <span className="text-ink-faint">–</span> : formatCurrency(cents);

  // Colour is never the only signal: over/warn cells also carry text for screen readers.
  const srHint = (status: BudgetStatus) =>
    status === "over" ? (
      <span className="sr-only"> {t("yearly.srOver")}</span>
    ) : status === "warn" ? (
      <span className="sr-only"> {t("yearly.srWarn")}</span>
    ) : null;

  const groups: Array<{ key: string; label: string; group: CategoryYearGroup }> = [
    { key: "expenses", label: t("yearly.expenses"), group: matrix.expenses },
    { key: "income", label: t("yearly.income"), group: matrix.income },
    { key: "savings", label: t("yearly.savings"), group: matrix.savings }
  ];

  const legend: Array<{ key: string; swatch: string; label: string }> = [
    { key: "over", swatch: "bg-danger-soft border-danger", label: t("yearly.legendOver") },
    { key: "warn", swatch: "bg-warning-soft border-warning", label: t("yearly.legendWarn") },
    { key: "ok", swatch: "bg-surface border-line", label: t("yearly.legendOk") }
  ];

  const statusCell = (key: string | number, cents: number, status: BudgetStatus, extra = "") => (
    <td key={key} data-budget-status={status} className={`${numCell} ${statusClass[status]} ${extra}`}>
      {amount(cents)}
      {srHint(status)}
    </td>
  );

  return (
    <div className="space-y-3">
      <div className="relative overflow-x-auto rounded-card border border-line bg-surface">
        <table className="min-w-full border-collapse text-sm text-ink">
          <caption className="sr-only">{t("yearly.categoriesCaption")}</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={`${stickyCell} px-3 py-2 text-left font-semibold`}>
                {t("yearly.categoriesColCategory")}
              </th>
              {monthLabels.map((label) => (
                <th key={label} scope="col" className={`${numCell} font-semibold text-ink-muted`}>
                  {label}
                </th>
              ))}
              <th scope="col" className={`${numCell} font-semibold`}>
                {t("yearly.total")}
              </th>
              <th scope="col" className={`${numCell} font-semibold`}>
                {t("yearly.colBudgetYear")}
              </th>
            </tr>
          </thead>
          <tbody>
            {groups
              .filter(({ group }) => group.rows.length > 0)
              .map(({ key, label, group }) => (
                <Fragment key={key}>
                  <tr className="bg-surface-2">
                    <th
                      scope="colgroup"
                      colSpan={15}
                      className="sticky left-0 z-10 bg-surface-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted"
                    >
                      {label}
                    </th>
                  </tr>
                  {group.rows.map((row) => {
                    const name = row.id === "uncategorized" ? uncategorizedLabel : row.name;
                    const totalStatus = yearStatus(row);
                    return (
                      <tr key={row.id} className="border-b border-line/60">
                        <th scope="row" className={`${stickyCell} max-w-[14rem] px-3 py-2 text-left font-medium`}>
                          <span className="block truncate" title={name}>
                            {name}
                          </span>
                        </th>
                        {row.monthlyCents.map((cents, index) => statusCell(index, cents, monthStatus(row, index)))}
                        {statusCell("total", row.totalCents, totalStatus, "font-semibold")}
                        <td className={numCell}>
                          {row.budgetTotalCents === null ? (
                            <span className="text-ink-faint">–</span>
                          ) : (
                            formatCurrency(row.budgetTotalCents)
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-b border-line font-semibold">
                    <th scope="row" className={`${stickyCell} px-3 py-2 text-left`}>
                      {t("yearly.total")}
                    </th>
                    {group.monthlyTotalsCents.map((cents, index) => (
                      <td key={index} className={numCell}>
                        {amount(cents)}
                      </td>
                    ))}
                    <td className={numCell}>{amount(group.totalCents)}</td>
                    <td />
                  </tr>
                </Fragment>
              ))}
            <tr className="border-t-2 border-line font-semibold">
              <th scope="row" className={`${stickyCell} px-3 py-2 text-left`}>
                {t("yearly.net")}
              </th>
              {matrix.balanceMonthlyCents.map((cents, index) => (
                <td key={index} className={numCell}>
                  {amount(cents)}
                </td>
              ))}
              <td className={numCell}>{amount(matrix.balanceTotalCents)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <ul data-testid="budget-legend" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        {legend.map(({ key, swatch, label }) => (
          <li key={key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`inline-block h-3 w-3 rounded-sm border ${swatch}`} />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
