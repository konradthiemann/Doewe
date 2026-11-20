"use client";

import { parseMoneyInput, zonedDayKey } from "@doewe/shared";
import { useId, useState } from "react";

import { useI18n } from "../lib/i18n";

import { Button } from "./ui/Button";
import { Dialog, DialogTitle } from "./ui/Dialog";
import { InfoTip } from "./ui/InfoTip";

export type CompletableGoal = {
  id: string;
  title: string;
  /** Target of the goal. */
  amountCents: number | null;
  /** Spent from the monthly budget: the bookings linked to the goal. */
  transactionSpentCents: number;
  /** Spent from savings: the payments recorded on the goal so far. */
  savingsPaidCents: number;
};

/** Body of POST /api/saving-plan/{id}/complete. */
export type CompleteGoalRequest = {
  savingsPayment: { amountCents: number; day: string } | null;
};

type Props = {
  /** The goal to complete; null = dialog closed. */
  goal: CompletableGoal | null;
  formatCurrency: (cents: number) => string;
  onClose: () => void;
  onCompleted: () => void;
  /** Element that opened the dialog; gets the focus back when the dialog closes. */
  returnFocusTo?: HTMLElement | null;
};

/**
 * Completing a saving goal: shows what was spent on it and lets the user add
 * a last payment from savings. Nothing is booked.
 */
export function CompleteGoalDialog({ goal, formatCurrency, onClose, onCompleted, returnFocusTo }: Props) {
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
        <CompleteGoalForm key={goal.id} goal={goal} formatCurrency={formatCurrency} onClose={onClose} onCompleted={onCompleted} />
      )}
    </Dialog>
  );
}

function CompleteGoalForm({
  goal,
  formatCurrency,
  onClose,
  onCompleted
}: {
  goal: CompletableGoal;
  formatCurrency: (cents: number) => string;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const { t } = useI18n();
  const baseId = useId();
  const [restText, setRestText] = useState("");
  const [showRestError, setShowRestError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Empty = nothing to add; otherwise a non-negative amount.
  const restParsed = restText.trim() === "" ? 0 : parseMoneyInput(restText);
  const restValid = restParsed !== null && restParsed >= 0;
  const restCents = restValid ? restParsed : 0;
  const totalCents = goal.transactionSpentCents + goal.savingsPaidCents + restCents;
  const restErrorVisible = showRestError && !restValid;

  const handleSubmit = async () => {
    if (!restValid) {
      setShowRestError(true);
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const body: CompleteGoalRequest = {
        savingsPayment: restCents > 0 ? { amountCents: restCents, day: zonedDayKey(new Date()) } : null
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
      onCompleted();
    } catch {
      setSubmitError(t("savingPlan.errorComplete"));
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass =
    "block w-full rounded-field border-line-strong bg-surface text-base text-ink shadow-card focus:border-brand focus:ring-brand md:text-sm";

  return (
    <form
      className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card border border-line bg-surface p-5 text-left shadow-raised sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="flex items-center gap-2">
        <DialogTitle className="min-w-0 text-lg font-semibold text-ink">{t("savingPlan.complete.title")}</DialogTitle>
        <InfoTip topic="savingPlan.complete" />
      </div>
      <p className="mt-1 text-sm text-ink-muted">{t("savingPlan.complete.intro", { title: goal.title })}</p>

      <dl className="mt-4 space-y-2 rounded-field border border-line bg-surface-2 p-3 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="min-w-0 text-ink-muted">{t("savingPlan.complete.fromBudget")}</dt>
          <dd className="shrink-0 tabular-nums text-ink">{formatCurrency(goal.transactionSpentCents)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="min-w-0 text-ink-muted">{t("savingPlan.complete.fromSavings")}</dt>
          <dd className="shrink-0 tabular-nums text-ink">{formatCurrency(goal.savingsPaidCents)}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <label htmlFor={`${baseId}-rest`} className="block text-sm font-medium text-ink">
          {t("savingPlan.complete.restLabel")}
        </label>
        <input
          id={`${baseId}-rest`}
          type="text"
          inputMode="decimal"
          value={restText}
          onChange={(event) => setRestText(event.target.value)}
          onBlur={() => setShowRestError(true)}
          aria-invalid={restErrorVisible}
          aria-describedby={`${baseId}-rest-hint`}
          placeholder={t("savingPlan.form.amountPlaceholder")}
          className={`mt-1 ${fieldClass}`}
        />
        <p id={`${baseId}-rest-hint`} className="mt-1 text-xs text-ink-muted">
          {t("savingPlan.complete.restHint")}
        </p>
        {restErrorVisible && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {t("savingPlan.complete.restInvalid")}
          </p>
        )}
      </div>

      <dl className="mt-4 space-y-1 rounded-field border border-brand/30 bg-brand-soft p-3 text-sm" aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="min-w-0 font-medium text-ink">{t("savingPlan.complete.totalLabel")}</dt>
          <dd className="shrink-0 font-semibold tabular-nums text-ink" data-testid="complete-goal-total">
            {formatCurrency(totalCents)}
          </dd>
        </div>
        {goal.amountCents != null && (
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <dt className="min-w-0 text-ink-muted">{t("savingPlan.complete.targetLabel")}</dt>
            <dd className="shrink-0 tabular-nums text-ink-muted">{formatCurrency(goal.amountCents)}</dd>
          </div>
        )}
      </dl>

      {submitError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {submitError}
        </p>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
          {t("savingPlan.confirmDeleteCancel")}
        </Button>
        <Button type="submit" loading={submitting}>
          {submitting ? t("savingPlan.completing") : t("savingPlan.complete.confirm")}
        </Button>
      </div>
    </form>
  );
}
