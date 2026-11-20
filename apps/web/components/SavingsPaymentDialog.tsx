"use client";

import { parseDayKey, parseMoneyInput, zonedDayKey } from "@doewe/shared";
import { useId, useState } from "react";

import { useI18n } from "../lib/i18n";

import { Button } from "./ui/Button";
import { Dialog, DialogTitle } from "./ui/Dialog";
import { InfoTip } from "./ui/InfoTip";

export type PayableGoal = { id: string; title: string };

type Props = {
  /** The goal to add a payment to; null = dialog closed. */
  goal: PayableGoal | null;
  formatCurrency: (cents: number) => string;
  onClose: () => void;
  onAdded: (amountCents: number) => void;
  /** Element that opened the dialog; gets the focus back when the dialog closes. */
  returnFocusTo?: HTMLElement | null;
};

/**
 * "Paid from savings": money spent on a goal straight from the savings account.
 * Recorded on the goal only — not a booking, no monthly figure changes.
 */
export function SavingsPaymentDialog({ goal, formatCurrency, onClose, onAdded, returnFocusTo }: Props) {
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
        <SavingsPaymentForm key={goal.id} goal={goal} formatCurrency={formatCurrency} onClose={onClose} onAdded={onAdded} />
      )}
    </Dialog>
  );
}

function SavingsPaymentForm({
  goal,
  formatCurrency,
  onClose,
  onAdded
}: {
  goal: PayableGoal;
  formatCurrency: (cents: number) => string;
  onClose: () => void;
  onAdded: (amountCents: number) => void;
}) {
  const { t } = useI18n();
  const baseId = useId();
  const [amountText, setAmountText] = useState("");
  const [day, setDay] = useState(() => zonedDayKey(new Date()));
  const [note, setNote] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const amountCents = parseMoneyInput(amountText);
  const amountValid = amountCents !== null && amountCents > 0;
  const dayValid = parseDayKey(day) !== null;

  const handleSubmit = async () => {
    if (!amountValid || !dayValid || amountCents === null) {
      setShowErrors(true);
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/saving-plan/${goal.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, day, note: note.trim() || undefined })
      });
      if (!res.ok) {
        setSubmitError(t("savingPlan.payment.error"));
        return;
      }
      onAdded(amountCents);
    } catch {
      setSubmitError(t("savingPlan.payment.error"));
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass =
    "block w-full rounded-field border-line-strong bg-surface text-base text-ink shadow-card focus:border-brand focus:ring-brand md:text-sm";
  const amountError = showErrors && !amountValid;
  const dayError = showErrors && !dayValid;

  return (
    <form
      className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card border border-line bg-surface p-5 text-left shadow-raised sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="flex items-center gap-2">
        <DialogTitle className="min-w-0 text-lg font-semibold text-ink">{t("savingPlan.payment.title")}</DialogTitle>
        <InfoTip topic="savingPlan.spending" />
      </div>
      <p className="mt-1 text-sm text-ink-muted">{t("savingPlan.payment.intro", { title: goal.title })}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`${baseId}-amount`} className="block text-sm font-medium text-ink">
            {t("savingPlan.payment.amountLabel")}
          </label>
          <input
            id={`${baseId}-amount`}
            type="text"
            inputMode="decimal"
            autoFocus
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            onBlur={() => amountText.trim() !== "" && setShowErrors(true)}
            aria-invalid={amountError}
            placeholder={t("savingPlan.form.amountPlaceholder")}
            className={`mt-1 ${fieldClass}`}
          />
          {amountError && (
            <p role="alert" className="mt-1 text-xs text-danger">
              {t("savingPlan.payment.amountInvalid")}
            </p>
          )}
        </div>
        <div className="min-w-0">
          <label htmlFor={`${baseId}-day`} className="block text-sm font-medium text-ink">
            {t("savingPlan.payment.dayLabel")}
          </label>
          <input
            id={`${baseId}-day`}
            type="date"
            value={day}
            onChange={(event) => setDay(event.target.value)}
            aria-invalid={dayError}
            className={`mt-1 ${fieldClass}`}
          />
          {dayError && (
            <p role="alert" className="mt-1 text-xs text-danger">
              {t("savingPlan.payment.dayInvalid")}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor={`${baseId}-note`} className="block text-sm font-medium text-ink">
          {t("savingPlan.payment.noteLabel")}
        </label>
        <input
          id={`${baseId}-note`}
          type="text"
          maxLength={200}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("savingPlan.payment.notePlaceholder")}
          className={`mt-1 ${fieldClass}`}
        />
      </div>

      {amountValid && amountCents !== null && (
        <p className="mt-4 rounded-field border border-savings/30 bg-savings-soft p-3 text-sm text-ink" aria-live="polite">
          {t("savingPlan.goal.fromSavings", { amount: formatCurrency(amountCents) })}
        </p>
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
        <Button type="submit" loading={submitting}>
          {t("savingPlan.payment.confirm")}
        </Button>
      </div>
    </form>
  );
}
