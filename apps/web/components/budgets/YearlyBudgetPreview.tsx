"use client";

import { distributeYearlyBudget } from "@doewe/shared";
import { useMemo } from "react";

import { useI18n } from "../../lib/i18n";

export interface YearlyBudgetPreviewProps {
  /** Yearly budget in cents (invalid input should be passed as 0). */
  yearlyCents: number;
  /** Monthly available money (income minus recurring expenses), 12 entries, index 0 = January. */
  availablePerMonthCents: number[];
  formatCurrency: (cents: number) => string;
  /** Twelve short month labels, index 0 = January. */
  monthLabels: string[];
}

/** The twelve monthly values a yearly budget is spread over. */
export function YearlyBudgetPreview({
  yearlyCents,
  availablePerMonthCents,
  formatCurrency,
  monthLabels
}: YearlyBudgetPreviewProps) {
  const { t } = useI18n();
  const monthly = useMemo(
    () => distributeYearlyBudget(yearlyCents, availablePerMonthCents),
    [yearlyCents, availablePerMonthCents]
  );
  const evenFallback = !availablePerMonthCents.some((value) => value > 0);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-ink-muted">{t("budgets.previewTitle")}</p>
      {evenFallback && (
        <p data-testid="budgets-even-hint" className="text-xs text-ink-muted">
          {t("budgets.evenHint")}
        </p>
      )}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-6">
        {monthly.map((cents, index) => (
          <li key={index} className="flex items-baseline justify-between gap-2 border-b border-line py-1 text-xs">
            <span className="text-ink-muted">{monthLabels[index]}</span>
            <span className="whitespace-nowrap font-medium tabular-nums text-ink">{formatCurrency(cents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
