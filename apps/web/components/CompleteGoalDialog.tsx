"use client";

import { isSavingsCategoryName, parseMoneyInput } from "@doewe/shared";
import { useId, useMemo, useState } from "react";

import { useApiQuery } from "../lib/api/useApiQuery";
import { useI18n } from "../lib/i18n";

import { Button } from "./ui/Button";
import { Dialog, DialogTitle } from "./ui/Dialog";
import { InfoTip } from "./ui/InfoTip";

export type CompletableGoal = {
  id: string;
  title: string;
  /** Target of the goal; prefills "what did it cost". */
  amountCents: number | null;
  /** Bookings already linked to the goal (sum of their absolute amounts). */
  transactionSpentCents: number;
};

/** Body of POST /api/saving-plan/{id}/complete. */
export type CompleteGoalRequest = {
  spentCents: number;
  withdraw: boolean;
  expense: { categoryId: string | null } | null;
};

export type CompleteGoalResult = { withdrawnCents: number; expenseTransactionId: string | null };

type Props = {
  /** The goal to complete; null = dialog closed. */
  goal: CompletableGoal | null;
  /** What is in the savings pool right now (cents, >= 0). */
  poolCents: number;
  formatCurrency: (cents: number) => string;
  onClose: () => void;
  onCompleted: (result: CompleteGoalResult) => void;
  /** Element that opened the dialog; gets the focus back when the dialog closes. */
  returnFocusTo?: HTMLElement | null;
};

/** What the pool gives for a cost: never more than is in it. */
export function withdrawableCents(costCents: number, poolCents: number): number {
  return Math.max(0, Math.min(costCents, poolCents));
}

/**
 * Completing a saving goal: what it cost, whether the money comes out of the
 * savings pool, and whether the purchase is booked as an expense.
 */
export function CompleteGoalDialog({ goal, poolCents, formatCurrency, onClose, onCompleted, returnFocusTo }: Props) {
  return (
    <Dialog
      open={goal !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      className="max-w-md sm:max-w-md"
      onCloseAutoFocus={(event) => {
        if (returnFocusTo?.isConnected) {
          event.preventDefault();
          returnFocusTo.focus();
        }
      }}
    >
      {goal && (
        <CompleteGoalForm
          key={goal.id}
          goal={goal}
          poolCents={Math.max(0, poolCents)}
          formatCurrency={formatCurrency}
          onClose={onClose}
          onCompleted={onCompleted}
        />
      )}
    </Dialog>
  );
}

function Switch({
  label,
  checked,
  onChange,
  disabled
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="min-w-0 text-sm font-medium text-ink">{label}</span>
      <span className="relative inline-flex shrink-0 items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="h-6 w-11 rounded-full border border-line-strong bg-surface-2 transition peer-checked:border-brand peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

function CompleteGoalForm({
  goal,
  poolCents,
  formatCurrency,
  onClose,
  onCompleted
}: {
  goal: CompletableGoal;
  poolCents: number;
  formatCurrency: (cents: number) => string;
  onClose: () => void;
  onCompleted: (result: CompleteGoalResult) => void;
}) {
  const { locale, t } = useI18n();
  const baseId = useId();
  const alreadyBooked = goal.transactionSpentCents > 0;

  const [costText, setCostText] = useState(() => {
    const target = goal.amountCents ?? 0;
    if (target <= 0) return "";
    const fraction = String(target % 100).padStart(2, "0");
    return `${Math.floor(target / 100)}${locale === "de" ? "," : "."}${fraction}`;
  });
  const [withdraw, setWithdraw] = useState(true);
  // Bookings already linked to the goal: the purchase is evidently booked.
  const [bookExpense, setBookExpense] = useState(!alreadyBooked);
  const [categoryId, setCategoryId] = useState("");
  const [showCostError, setShowCostError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const categoriesQuery = useApiQuery<Array<{ id: string; name: string; isIncome: boolean }>>(
    ["categories"],
    "/api/categories"
  );
  // The purchase is an expense: no income categories, and not the savings
  // category (a booking there would be a deposit into the pool).
  const expenseCategories = useMemo(
    () =>
      (categoriesQuery.data ?? [])
        .filter((category) => !category.isIncome && !isSavingsCategoryName(category.name))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categoriesQuery.data]
  );

  const costCents = parseMoneyInput(costText);
  const costValid = costCents !== null;
  const cost = costCents ?? 0;
  const takenCents = withdraw ? withdrawableCents(cost, poolCents) : 0;
  const willBookExpense = bookExpense && cost > 0;
  const categoryName = expenseCategories.find((category) => category.id === categoryId)?.name ?? null;

  const expenseTarget = categoryName
    ? t("savingPlan.complete.summaryTargetCategory", { category: categoryName })
    : t("savingPlan.complete.summaryTargetNone");
  const summary: string[] = [];
  if (takenCents > 0 && willBookExpense && takenCents === cost) {
    summary.push(
      t("savingPlan.complete.summaryWithdrawAndExpense", { amount: formatCurrency(cost), target: expenseTarget })
    );
  } else {
    if (takenCents > 0) {
      summary.push(t("savingPlan.complete.summaryWithdraw", { amount: formatCurrency(takenCents) }));
    } else if (withdraw && cost > 0) {
      summary.push(t("savingPlan.complete.summaryPoolEmpty"));
    } else {
      summary.push(t("savingPlan.complete.summaryPoolUntouched"));
    }
    summary.push(
      willBookExpense
        ? t("savingPlan.complete.summaryExpense", { amount: formatCurrency(cost), target: expenseTarget })
        : t("savingPlan.complete.summaryNoExpense")
    );
  }

  const handleSubmit = async () => {
    if (costCents === null) {
      setShowCostError(true);
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const body: CompleteGoalRequest = {
        spentCents: costCents,
        withdraw,
        expense: willBookExpense ? { categoryId: categoryId || null } : null
      };
      const res = await fetch(`/api/saving-plan/${goal.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        setSubmitError(t("savingPlan.errorComplete"));
        return;
      }
      const data = (await res.json().catch(() => null)) as Partial<CompleteGoalResult> | null;
      onCompleted({
        withdrawnCents: typeof data?.withdrawnCents === "number" ? data.withdrawnCents : 0,
        expenseTransactionId: data?.expenseTransactionId ?? null
      });
    } catch {
      setSubmitError(t("savingPlan.errorComplete"));
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass =
    "block w-full rounded-field border-line-strong bg-surface text-base text-ink shadow-card focus:border-brand focus:ring-brand md:text-sm";
  const costErrorVisible = showCostError && !costValid;

  return (
    <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card border border-line bg-surface p-5 text-left shadow-raised sm:p-6">
      <div className="flex items-center gap-2">
        <DialogTitle className="min-w-0 text-lg font-semibold text-ink">{t("savingPlan.complete.title")}</DialogTitle>
        <InfoTip topic="savingPlan.complete" />
      </div>
      <p className="mt-1 text-sm text-ink-muted">{t("savingPlan.complete.intro", { title: goal.title })}</p>

      <div className="mt-4">
        <label htmlFor={`${baseId}-cost`} className="block text-sm font-medium text-ink">
          {t("savingPlan.complete.costLabel")}
        </label>
        <input
          id={`${baseId}-cost`}
          type="text"
          inputMode="decimal"
          value={costText}
          onChange={(event) => setCostText(event.target.value)}
          onBlur={() => setShowCostError(true)}
          aria-invalid={costErrorVisible}
          aria-describedby={`${baseId}-cost-hint`}
          className={`mt-1 ${fieldClass}`}
        />
        <p id={`${baseId}-cost-hint`} className="mt-1 text-xs text-ink-muted">
          {t("savingPlan.complete.costHint")}
        </p>
        {costErrorVisible && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {t("savingPlan.complete.costInvalid")}
          </p>
        )}
      </div>

      <div className="mt-4 rounded-field border border-line bg-surface-2 p-3">
        <Switch label={t("savingPlan.complete.withdrawLabel")} checked={withdraw} onChange={setWithdraw} />
        <p className="mt-1 text-xs text-ink-muted">
          {t("savingPlan.complete.poolAmount", { amount: formatCurrency(poolCents) })}
        </p>
        {withdraw && cost > 0 && poolCents === 0 && (
          <p className="mt-1 text-xs text-ink">{t("savingPlan.complete.poolEmpty")}</p>
        )}
        {withdraw && poolCents > 0 && cost > poolCents && (
          <p className="mt-1 text-xs text-ink">
            {t("savingPlan.complete.poolShort", {
              pool: formatCurrency(poolCents),
              rest: formatCurrency(cost - poolCents)
            })}
          </p>
        )}
        {!withdraw && <p className="mt-1 text-xs text-ink-muted">{t("savingPlan.complete.withdrawOff")}</p>}
      </div>

      <div className="mt-3 rounded-field border border-line bg-surface-2 p-3">
        <Switch label={t("savingPlan.complete.expenseLabel")} checked={bookExpense} onChange={setBookExpense} />
        {alreadyBooked && (
          <p className="mt-1 text-xs text-ink-muted">
            {t("savingPlan.complete.expenseAlreadyBooked", { amount: formatCurrency(goal.transactionSpentCents) })}
          </p>
        )}
        {bookExpense && (
          <div className="mt-2">
            <label htmlFor={`${baseId}-category`} className="block text-xs font-medium text-ink-muted">
              {t("savingPlan.complete.categoryLabel")}
            </label>
            <select
              id={`${baseId}-category`}
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className={`mt-1 ${fieldClass}`}
            >
              <option value="">{t("savingPlan.complete.categoryNone")}</option>
              {expenseCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {costValid && (
        <div className="mt-4 rounded-field border border-brand/30 bg-brand-soft p-3 text-sm text-ink" aria-live="polite">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {t("savingPlan.complete.summaryTitle")}
          </p>
          <p className="mt-1" data-testid="complete-goal-summary">
            {summary.join(" ")}
          </p>
        </div>
      )}

      {submitError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {submitError}
        </p>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
          {t("savingPlan.confirmDeleteCancel")}
        </Button>
        <Button type="button" onClick={() => void handleSubmit()} loading={submitting}>
          {submitting ? t("savingPlan.completing") : t("savingPlan.complete.confirm")}
        </Button>
      </div>
    </div>
  );
}
