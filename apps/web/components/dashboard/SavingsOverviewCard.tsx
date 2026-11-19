"use client";

import { type MonthRef } from "@doewe/shared";

import { formatBookingDayMonth, formatMonth } from "../../lib/bookingDate";
import { useI18n } from "../../lib/i18n";
import { goalPercent } from "../../lib/savingGoalProgress";
import { InfoTip } from "../ui/InfoTip";

export type CompletedGoalRow = { title: string; target: number; spent: number; completedAt: string };

export interface SavingsOverviewCardProps {
  /** Saved this month in euros: booked + planned deposits minus withdrawals, never below 0 (the hero's figure). */
  savedThisMonth: number;
  /** Taken out of the pool this month on balance, in euros (0 unless withdrawals exceed deposits). */
  netWithdrawn: number;
  /** Totals of /api/saving-plan; null while they are not loaded. */
  plan: { suggestedMonthlyCents: number; availableCents: number } | null;
  /** Earliest goal month that is the current month or later. */
  nextDeadline: MonthRef | null;
  completedGoals: CompletedGoalRow[];
  completedGoalsSpent: number;
  formatCurrency: (euros: number) => string;
  dateLocale: string;
}

/**
 * Dashboard card "Sparübersicht": what was saved this month against the
 * recommended monthly rate, and what is in the savings pool.
 *
 * The rate is what has to be set aside each month so that all dated goals are
 * reached in time. Without dated goals it is 0: then there is nothing to
 * compare with, and the card shows the saved amount and the pool only.
 */
export function SavingsOverviewCard({
  savedThisMonth,
  netWithdrawn,
  plan,
  nextDeadline,
  completedGoals,
  completedGoalsSpent,
  formatCurrency,
  dateLocale
}: SavingsOverviewCardProps) {
  const { t } = useI18n();

  const savedCents = Math.round(savedThisMonth * 100);
  const rateCents = plan?.suggestedMonthlyCents ?? 0;
  const hasRate = rateCents > 0;
  // Same rule as a goal's progress: 100 % only once the rate is really reached.
  const ratePercent = hasRate ? goalPercent(savedCents, rateCents) : 0;
  const remainingCents = Math.max(0, rateCents - savedCents);

  return (
    <section aria-labelledby="savings-overview" className="min-w-0">
      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="mb-4 flex items-center gap-2">
          <h2 id="savings-overview" className="min-w-0 text-lg font-medium">
            {t("dashboard.savingsOverview")}
          </h2>
          <InfoTip topic="dashboard.savings" />
        </div>

        <div className={`grid gap-4 ${hasRate ? "grid-cols-2" : "grid-cols-1"}`}>
          <div className="min-w-0">
            <p className="text-sm text-ink-muted">{t("dashboard.savedThisMonth")}</p>
            <p className="text-amount font-semibold tabular-nums text-savings sm:text-amount-lg">
              {formatCurrency(savedThisMonth)}
            </p>
            <p className="text-xs text-ink-muted">{t("dashboard.savedThisMonthHint")}</p>
          </div>
          {hasRate && (
            <div className="min-w-0">
              <p className="text-sm text-ink-muted">{t("dashboard.monthlyRate")}</p>
              <p className="text-amount font-semibold tabular-nums text-ink sm:text-amount-lg">
                {formatCurrency(rateCents / 100)}
              </p>
              <p className="text-xs text-ink-muted">{t("dashboard.monthlyRateHint")}</p>
            </div>
          )}
        </div>

        {hasRate && (
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-2 rounded-full bg-savings transition-[width] duration-base ease-calm motion-reduce:transition-none"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={ratePercent}
                aria-label={t("dashboard.rateProgressLabel")}
                style={{ width: `${ratePercent}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-ink-muted">
              {t("dashboard.rateProgress", { percent: ratePercent })}
              {" · "}
              {remainingCents > 0
                ? t("dashboard.rateRemaining", { amount: formatCurrency(remainingCents / 100) })
                : t("dashboard.rateReached")}
            </p>
            {nextDeadline && (
              <p className="mt-0.5 text-xs text-ink-muted">
                {t("dashboard.nextGoalDeadline", { date: formatMonth(nextDeadline, dateLocale) })}
              </p>
            )}
          </div>
        )}

        {netWithdrawn > 0 && (
          <p className="mt-3 text-xs text-ink-muted">
            {t("dashboard.netWithdrawnNote", { amount: formatCurrency(netWithdrawn) })}
          </p>
        )}

        {plan && (
          <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-3">
            <p className="min-w-0 text-sm text-ink-muted">{t("dashboard.inPool")}</p>
            <p className="shrink-0 text-amount font-semibold tabular-nums text-ink">
              {formatCurrency(Math.max(0, plan.availableCents) / 100)}
            </p>
          </div>
        )}

        {completedGoals.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-sm font-medium text-ink">{t("dashboard.completedGoalsTitle")}</p>
            <ul className="mt-2 space-y-2">
              {completedGoals.map((goal, idx) => {
                const diff = goal.spent - goal.target;
                return (
                  <li key={idx} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink-muted">{goal.title}</p>
                      <p className="text-xs text-ink-muted">
                        {formatBookingDayMonth(goal.completedAt, dateLocale, { month: "long" })}
                        {" · "}
                        {t("dashboard.completedGoalTarget", { amount: formatCurrency(goal.target) })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums text-savings">{formatCurrency(goal.spent)}</p>
                      {diff !== 0 && (
                        <p className={`text-xs ${diff > 0 ? "text-warning" : "text-income"}`}>
                          {diff > 0
                            ? t("dashboard.completedGoalOver", { amount: formatCurrency(diff) })
                            : t("dashboard.completedGoalUnder", { amount: formatCurrency(-diff) })}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-ink-muted">
              {t("dashboard.completedGoalsSpentTotal", { amount: formatCurrency(completedGoalsSpent) })}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
