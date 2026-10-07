"use client";

import { Fragment } from "react";

import { useI18n } from "../../lib/i18n";

import type { RecurringYearGroup, RecurringYearMatrix } from "@doewe/shared";

type Props = {
  matrix: RecurringYearMatrix;
  formatCurrency: (cents: number) => string;
  /** 12 short month names, Jan-Dec. */
  monthLabels: string[];
};

const stickyCell = "sticky left-0 z-10 bg-surface";
const numCell = "whitespace-nowrap px-3 py-2 text-right tabular-nums";

export function RecurringYearTable({ matrix, formatCurrency, monthLabels }: Props) {
  const { t } = useI18n();

  const amount = (cents: number) =>
    cents === 0 ? <span className="text-ink-faint">–</span> : formatCurrency(cents);

  const groups: Array<{ key: string; label: string; group: RecurringYearGroup }> = [
    { key: "income", label: t("yearly.income"), group: matrix.income },
    { key: "expenses", label: t("yearly.expenses"), group: matrix.expenses },
    { key: "savings", label: t("yearly.savings"), group: matrix.savings }
  ];

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="min-w-full border-collapse text-sm text-ink">
        <caption className="sr-only">{t("yearly.tableCaption")}</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={`${stickyCell} px-3 py-2 text-left font-semibold`}>
              <span className="sr-only">{matrix.year}</span>
            </th>
            {monthLabels.map((label) => (
              <th key={label} scope="col" className={`${numCell} font-semibold text-ink-muted`}>
                {label}
              </th>
            ))}
            <th scope="col" className={`${numCell} font-semibold`}>
              {t("yearly.total")}
            </th>
          </tr>
        </thead>
        <tbody>
          {groups
            .filter(({ group }) => group.rows.length > 0)
            .map(({ key, label, group }) => (
              <Fragment key={key}>
                <tr className="bg-surface-2">
                  <th scope="colgroup" colSpan={14} className={`sticky left-0 z-10 bg-surface-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted`}>
                    {label}
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.id} className="border-b border-line/60">
                    <th scope="row" className={`${stickyCell} max-w-[14rem] px-3 py-2 text-left font-medium`}>
                      <span className="block truncate" title={row.description}>
                        {row.description}
                      </span>
                      {row.categoryName ? (
                        <span className="block truncate text-xs font-normal text-ink-muted">{row.categoryName}</span>
                      ) : null}
                    </th>
                    {row.monthlyCents.map((cents, index) => (
                      <td key={index} className={numCell}>
                        {amount(cents)}
                      </td>
                    ))}
                    <td className={`${numCell} font-semibold`}>{amount(row.totalCents)}</td>
                  </tr>
                ))}
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
                </tr>
              </Fragment>
            ))}
          <tr className="border-t-2 border-line font-semibold">
            <th scope="row" className={`${stickyCell} px-3 py-2 text-left`}>
              {t("yearly.net")}
            </th>
            {matrix.net.monthlyTotalsCents.map((cents, index) => (
              <td key={index} className={numCell}>
                {amount(cents)}
              </td>
            ))}
            <td className={numCell}>{amount(matrix.net.totalCents)}</td>
          </tr>
          <tr className="text-ink-muted">
            <th scope="row" className={`${stickyCell} px-3 py-2 text-left font-medium`}>
              {t("yearly.average")}
            </th>
            <td colSpan={12} />
            <td className={numCell}>{amount(matrix.net.monthlyAverageCents)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
