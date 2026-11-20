"use client";

import { formatBookingDate, formatMonth } from "../../lib/bookingDate";
import { useI18n } from "../../lib/i18n";
import { goalSpending, isDeadlinePast, monthsToDeadline } from "../../lib/savingGoalProgress";
import { Spinner } from "../ui/Spinner";

export type SavingsPayment = { id: string; amountCents: number; occurredAt: string; note: string | null };

export type SavingGoal = {
  id: string;
  accountId: string;
  categoryId?: string | null;
  categoryName?: string | null;
  title: string;
  month: number | null;
  year: number | null;
  amountCents: number | null;
  monthlyRateCents: number | null;
  suggestedMonthlyRateCents: number | null;
  /** From the monthly budget: linked bookings, outcome minus refunds. */
  transactionSpentCents: number;
  /** From savings: sum of the payments recorded on the goal. */
  savingsPaidCents: number;
  savingsPayments: SavingsPayment[];
  completedAt?: string | null;
  spentCents?: number | null;
  createdAt: string;
};

type Props = {
  goal: SavingGoal;
  now: Date;
  formatCurrency: (cents: number) => string;
  dateLocale: string;
  applyingRate: boolean;
  removingPaymentId: string | null;
  onApplyRate: (goal: SavingGoal) => void;
  onAddPayment: (goal: SavingGoal, trigger: HTMLElement) => void;
  onRemovePayment: (goal: SavingGoal, payment: SavingsPayment) => void;
  onComplete: (goal: SavingGoal, trigger: HTMLElement) => void;
  onEdit: (goal: SavingGoal) => void;
  /** Undated goals only: open the form with the schedule switched on. */
  onSchedule?: (goal: SavingGoal) => void;
  onDelete: (goal: SavingGoal) => void;
};

const actionClass = {
  savings:
    "border-savings/40 text-savings hover:bg-savings-soft focus-visible:ring-savings",
  success: "border-success/40 text-success hover:bg-success-soft focus-visible:ring-success",
  brand: "border-brand/40 text-brand hover:bg-brand-soft focus-visible:ring-brand",
  neutral: "border-line-strong text-ink hover:bg-surface-2 focus-visible:ring-brand",
  danger: "border-danger/40 text-danger hover:bg-danger-soft focus-visible:ring-danger"
} as const;

function actionButton(tone: keyof typeof actionClass) {
  return `inline-flex items-center rounded-field border bg-surface px-3 py-1.5 text-xs font-medium shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ${actionClass[tone]}`;
}

/** One saving goal: its plan (target, date, monthly rate) and what was spent on it. */
export function GoalCard({
  goal,
  now,
  formatCurrency,
  dateLocale,
  applyingRate,
  removingPaymentId,
  onApplyRate,
  onAddPayment,
  onRemovePayment,
  onComplete,
  onEdit,
  onSchedule,
  onDelete
}: Props) {
  const { locale, t } = useI18n();
  const deadline = goal.month != null && goal.year != null ? { year: goal.year, month: goal.month } : null;
  const spending = goalSpending(goal.transactionSpentCents, goal.savingsPaidCents, goal.amountCents);
  const hasTarget = goal.amountCents != null && goal.amountCents > 0;

  return (
    <div className="min-w-0 space-y-3 rounded-card border border-line bg-surface/95 p-4 shadow-card backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {deadline && (
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{formatMonth(deadline, dateLocale)}</p>
          )}
          <h3 className="break-words text-lg font-semibold text-ink">{goal.title}</h3>
        </div>
        <div className="shrink-0 text-right">
          {goal.amountCents != null ? (
            <>
              <p className="text-xs uppercase tracking-wide text-ink-muted">{t("savingPlan.timelineGoal")}</p>
              <p className="text-xl font-semibold tabular-nums text-ink">{formatCurrency(goal.amountCents)}</p>
            </>
          ) : (
            <p className="text-xs italic text-ink-faint">{t("savingPlan.undatedNoAmount")}</p>
          )}
        </div>
      </div>

      {deadline && renderRateLine()}

      <div>
        {spending.spentCents > 0 ? (
          <>
            <p className="text-sm text-ink">
              {hasTarget
                ? t("savingPlan.goal.spentOfTarget", {
                    spent: formatCurrency(spending.spentCents),
                    target: formatCurrency(goal.amountCents ?? 0)
                  })
                : t("savingPlan.goal.spentOnly", { spent: formatCurrency(spending.spentCents) })}
            </p>
            {hasTarget && (
              <div
                className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-2"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={spending.percent}
                aria-label={t("savingPlan.goal.spentBar")}
              >
                <div
                  className={`h-2 rounded-full transition-[width] duration-base ease-calm motion-reduce:transition-none ${
                    spending.overCents > 0 ? "bg-warning" : "bg-savings"
                  }`}
                  style={{ width: `${spending.percent}%` }}
                />
              </div>
            )}
            <p className="mt-1.5 text-xs text-ink-muted">
              {[
                goal.transactionSpentCents > 0 &&
                  t("savingPlan.goal.fromBudget", { amount: formatCurrency(goal.transactionSpentCents) }),
                goal.savingsPaidCents > 0 &&
                  t("savingPlan.goal.fromSavings", { amount: formatCurrency(goal.savingsPaidCents) }),
                hasTarget &&
                  (spending.overCents > 0
                    ? t("savingPlan.goal.over", { amount: formatCurrency(spending.overCents) })
                    : t("savingPlan.goal.remaining", { amount: formatCurrency(spending.remainingCents) }))
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </>
        ) : (
          <p className="text-xs text-ink-muted">{t("savingPlan.goal.nothingSpent")}</p>
        )}

        {goal.savingsPayments.length > 0 && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer rounded-field text-ink-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              {t("savingPlan.goal.paymentsToggle", { count: goal.savingsPayments.length })}
            </summary>
            <ul className="mt-2 divide-y divide-line rounded-field border border-line">
              {goal.savingsPayments.map((payment) => {
                const date = formatBookingDate(payment.occurredAt, locale);
                const amount = formatCurrency(payment.amountCents);
                return (
                  <li key={payment.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-ink">{payment.note || t("savingPlan.payment.title")}</p>
                      <p className="text-ink-muted">{date}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums text-ink">{amount}</span>
                      <button
                        type="button"
                        onClick={() => onRemovePayment(goal, payment)}
                        disabled={removingPaymentId === payment.id}
                        aria-label={t("savingPlan.goal.paymentRemoveLabel", { amount, date })}
                        className="rounded-field px-2 py-1 text-danger hover:bg-danger-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-danger disabled:opacity-50"
                      >
                        {removingPaymentId === payment.id ? <Spinner size="sm" /> : t("savingPlan.goal.paymentRemove")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={(event) => onAddPayment(goal, event.currentTarget)} className={actionButton("savings")}>
          + {t("savingPlan.goal.addPayment")}
        </button>
        {onSchedule && (
          <button type="button" onClick={() => onSchedule(goal)} className={actionButton("brand")}>
            {t("savingPlan.undatedSchedule")}
          </button>
        )}
        <button type="button" onClick={(event) => onComplete(goal, event.currentTarget)} className={actionButton("success")}>
          {t("savingPlan.markComplete")}
        </button>
        <button type="button" onClick={() => onEdit(goal)} className={actionButton("neutral")}>
          {t("savingPlan.edit")}
        </button>
        <button type="button" onClick={() => onDelete(goal)} className={actionButton("danger")}>
          {t("savingPlan.delete")}
        </button>
      </div>
    </div>
  );

  function renderRateLine() {
    if (!deadline) return null;
    if (isDeadlinePast(deadline, now)) {
      return <p className="text-xs text-ink-muted">{t("savingPlan.goal.deadlinePast")}</p>;
    }
    const months = monthsToDeadline(deadline, now);
    const monthsLeft =
      months === 1 ? t("savingPlan.goal.monthsLeftOne") : t("savingPlan.goal.monthsLeftMany", { count: months });
    if (goal.monthlyRateCents != null) {
      return (
        <p className="text-sm text-ink">
          <span className="font-medium text-savings">
            {t("savingPlan.goal.rate", { amount: formatCurrency(goal.monthlyRateCents) })}
          </span>
          <span className="text-ink-muted"> · {monthsLeft}</span>
        </p>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
        <span>
          {t("savingPlan.goal.noRate")} · {monthsLeft}
        </span>
        {goal.suggestedMonthlyRateCents != null && (
          <>
            <span>
              · {t("savingPlan.goal.suggestRate", { amount: formatCurrency(goal.suggestedMonthlyRateCents) })}
            </span>
            <button
              type="button"
              onClick={() => onApplyRate(goal)}
              disabled={applyingRate}
              className={actionButton("savings")}
            >
              {applyingRate && <Spinner size="sm" className="mr-1.5" />}
              {t("savingPlan.goal.applyRate")}
            </button>
          </>
        )}
      </div>
    );
  }
}
