"use client";

import React, { useId, useState } from "react";

import { useI18n } from "../lib/i18n";

import { Button } from "./ui/Button";

const PRESET_INTERVALS = [1, 3, 6, 12] as const;
const CUSTOM_VALUE = "custom";

const fieldClass =
  "w-full rounded-field border-line-strong bg-surface text-ink text-base md:text-sm focus:border-brand focus:ring-brand";

type Props = {
  transactionId: string;
  /** Calendar day of the booking; default for the day-of-month input. */
  bookingDay: number;
  recurringTransactionId?: string | null;
  onMade: (message: string) => void;
};

/** Turns an existing booking into a recurring transaction (POST /api/transactions/[id]/make-recurring). */
export function MakeRecurringSection({ transactionId, bookingDay, recurringTransactionId, onMade }: Props) {
  const { t } = useI18n();
  const baseId = useId();
  const [interval, setInterval] = useState<string>("1");
  const [customInterval, setCustomInterval] = useState("2");
  const [day, setDay] = useState(String(bookingDay));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (recurringTransactionId) {
    return (
      <div className="border-t border-line pt-4">
        <p className="text-sm text-ink-muted">{t("transactionForm.makeRecurringAlreadyLinked")}</p>
      </div>
    );
  }

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const intervalMonths = Number(interval === CUSTOM_VALUE ? customInterval : interval);
      const res = await fetch(`/api/transactions/${transactionId}/make-recurring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalMonths, dayOfMonth: Number(day) })
      });
      if (res.status === 409) {
        setError(t("transactionForm.makeRecurringConflict"));
        return;
      }
      if (!res.ok) {
        setError(t("transactionForm.makeRecurringError"));
        return;
      }
      onMade(t("transactionForm.madeRecurring"));
    } catch {
      setError(t("transactionForm.makeRecurringError"));
    } finally {
      setLoading(false);
    }
  };

  // This section lives inside the transaction <form>: Enter must not submit that outer form.
  const blockEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.preventDefault();
  };

  return (
    <div className="space-y-3 border-t border-line pt-4">
      <h3 className="text-sm font-semibold text-ink">{t("transactionForm.makeRecurringTitle")}</h3>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor={`${baseId}-interval`}>
          {t("transactionForm.makeRecurringInterval")}
        </label>
        <select
          id={`${baseId}-interval`}
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          className={fieldClass}
        >
          {PRESET_INTERVALS.map((months) => (
            <option key={months} value={String(months)}>
              {months === 1
                ? t("transactionForm.makeRecurringIntervalMonthly")
                : t("transactionForm.makeRecurringIntervalMonths", { count: months })}
            </option>
          ))}
          <option value={CUSTOM_VALUE}>{t("transactionForm.makeRecurringIntervalCustom")}</option>
        </select>
      </div>
      {interval === CUSTOM_VALUE && (
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor={`${baseId}-custom`}>
            {t("transactionForm.makeRecurringIntervalCustomLabel")}
          </label>
          <input
            id={`${baseId}-custom`}
            type="number"
            inputMode="numeric"
            min={1}
            max={24}
            step={1}
            value={customInterval}
            onChange={(e) => setCustomInterval(e.target.value)}
            onKeyDown={blockEnter}
            className={fieldClass}
          />
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor={`${baseId}-day`}>
          {t("transactionForm.makeRecurringDay")}
        </label>
        <input
          id={`${baseId}-day`}
          type="number"
          inputMode="numeric"
          min={1}
          max={31}
          step={1}
          value={day}
          onChange={(e) => setDay(e.target.value)}
          onKeyDown={blockEnter}
          className={fieldClass}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="button" variant="secondary" onClick={handleSubmit} disabled={loading}>
        {t("transactionForm.makeRecurringAction")}
      </Button>
    </div>
  );
}
