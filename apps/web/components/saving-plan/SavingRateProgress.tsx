"use client";

import { useI18n } from "../../lib/i18n";
import { goalPercent } from "../../lib/savingGoalProgress";

type Props = {
  /** What was set aside in the month, cents (>= 0). */
  savedCents: number;
  /** The month's rate of the saving plan, cents (> 0). */
  rateCents: number;
  /** Formats cents for display. */
  formatCents: (cents: number) => string;
  className?: string;
  /** A month that is over: says what was missing instead of what is still to go. */
  monthOver?: boolean;
};

/**
 * What was set aside in a month against the saving plan's monthly rate: bar,
 * share and what is still missing. Same rule as a goal: 100 % only once the
 * rate is really reached. Used by the dashboard, the saving plan and the review.
 */
export function SavingRateProgress({ savedCents, rateCents, formatCents, className, monthOver = false }: Props) {
  const { t } = useI18n();
  const percent = goalPercent(Math.max(savedCents, 0), rateCents);
  const remainingCents = Math.max(0, rateCents - savedCents);

  return (
    <div className={className}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-2 rounded-full bg-savings transition-[width] duration-base ease-calm motion-reduce:transition-none"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={t("dashboard.rateProgressLabel")}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-ink-muted">
        {t("dashboard.rateProgress", { percent })}
        {" · "}
        {remainingCents > 0
          ? t(monthOver ? "review.savingPlanMissing" : "dashboard.rateRemaining", { amount: formatCents(remainingCents) })
          : t(monthOver ? "review.savingPlanReached" : "dashboard.rateReached")}
      </p>
    </div>
  );
}
