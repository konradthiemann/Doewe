"use client";

import { type MonthRef } from "@doewe/shared";

import { formatBookingDayMonth, formatMonth } from "../../lib/bookingDate";
import { useI18n } from "../../lib/i18n";
import { SavingRateProgress } from "../saving-plan/SavingRateProgress";
import { InfoTip } from "../ui/InfoTip";

export type CompletedGoalRow = { title: string; target: number; spent: number; completedAt: string };

export interface SavingsOverviewCardProps {
  /** Saved this month in euros: booked + planned deposits minus withdrawals, never below 0 (the hero's figure). */
  savedThisMonth: number;
  /** Taken out of the pool this month on balance, in euros (0 unless withdrawals exceed deposits). */
  netWithdrawn: number;
  /** Totals of /api/saving-plan; null while they are not loaded. */
  plan: { monthlyRateCents: number } | null;
  /** Earliest goal month that is the current month or later. */
  nextDeadline: MonthRef | null;
  completedGoals: CompletedGoalRow[];
  completedGoalsSpent: number;
  formatCurrency: (euros: number) => string;
  dateLocale: string;
}

/**
 * Dashboard card "Sparübersicht": what was saved this month against the
 * monthly rate of the saving plan.
 *
 * The rate is the sum of the rates the household set for its dated goals.
 * Without one it is 0: then there is nothing to compare with, and the card
 * shows the saved amount only. The app keeps no savings balance, so the card
 * shows none.
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
  const rateCents = plan?.monthlyRateCents ?? 0;
  const hasRate = rateCents > 0;

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
            <SavingRateProgress
              savedCents={savedCents}
              rateCents={rateCents}
              formatCents={(cents) => formatCurrency(cents / 100)}
            />
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
