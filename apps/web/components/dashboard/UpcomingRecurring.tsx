"use client";

import { zonedDateTime } from "@doewe/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useI18n } from "../../lib/i18n";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";

import type { Locale } from "../../lib/locales/translate";

/** A standing order that is due this month and not booked yet. */
export type PlannedRecurring = {
  id: string;
  description: string;
  amountCents: number;
  dayOfMonth: number | null;
};

/**
 * A hand-entered booking that may be this month's payment of a standing order
 * (`recurringSuggestions` of GET /api/analytics/summary). It only counts as
 * that payment once the user confirms it.
 */
export type RecurringSuggestion = {
  recurringId: string;
  /** YYYY-MM */
  period: string;
  /** yyyy-mm-dd */
  dueDay: string;
  transactionId: string;
  transactionDescription: string;
  /** ISO timestamp */
  transactionOccurredAt: string;
  amountCents: number;
};

type FormatCurrency = (euros: number) => string;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Day and month of the calendar day (Europe/Berlin) a booking is counted on:
 * `18.11.` (de) / `11/18` (en). Empty for an invalid timestamp.
 */
export function formatDayMonthShort(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const { day, month } = zonedDateTime(date);
  return locale === "de" ? `${pad(day)}.${pad(month)}.` : `${pad(month)}/${pad(day)}`;
}

/**
 * Asks whether a hand-entered booking was this standing order. Confirming
 * links the booking to the standing order for the period, so it is not booked
 * again; doing nothing leaves the standing order to be booked on its day.
 */
export function RecurringSuggestionHint({
  suggestion,
  formatCurrency
}: {
  suggestion: RecurringSuggestion;
  formatCurrency: FormatCurrency;
}) {
  const { locale, t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) return null;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
  };

  const confirm = async () => {
    setPending(true);
    try {
      const res = await fetch(`/api/recurring-transactions/${encodeURIComponent(suggestion.recurringId)}/link-booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: suggestion.transactionId, period: suggestion.period })
      });
      if (res.ok) {
        setConfirmed(true);
        toast.success(t("dashboard.recurringSuggestionLinked"));
        refresh();
        return;
      }
      if (res.status === 409) {
        // The booking or the standing order changed in the meantime: nothing
        // was linked, the refreshed overview shows the current state.
        toast.info(t("dashboard.recurringSuggestionStale"));
        refresh();
        return;
      }
      toast.error(t("dashboard.recurringSuggestionError"));
    } catch {
      toast.error(t("dashboard.recurringSuggestionError"));
    } finally {
      setPending(false);
    }
  };

  const description = suggestion.transactionDescription.trim();
  const vars = {
    date: formatDayMonthShort(suggestion.transactionOccurredAt, locale),
    amount: formatCurrency(Math.abs(suggestion.amountCents) / 100),
    description
  };

  return (
    <div className="mt-2 border-t border-line pt-2" data-testid="recurring-suggestion">
      <p className="text-xs text-ink-muted">
        {description
          ? t("dashboard.recurringSuggestion", vars)
          : t("dashboard.recurringSuggestionNoDescription", vars)}
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-2"
        loading={pending}
        onClick={() => void confirm()}
      >
        {t("dashboard.recurringSuggestionConfirm")}
      </Button>
    </div>
  );
}

/** One standing order of this month; with a suggestion, the question whether it was already paid. */
export function RecurringItem({
  rec,
  suggestion,
  formatCurrency
}: {
  rec: PlannedRecurring;
  suggestion?: RecurringSuggestion;
  formatCurrency: FormatCurrency;
}) {
  const { t } = useI18n();
  return (
    <li className="rounded-field border border-line bg-surface-2 p-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{rec.description}</p>
          {rec.dayOfMonth && (
            <p className="text-xs text-ink-muted">{t("dashboard.recurringDay", { day: rec.dayOfMonth })}</p>
          )}
        </div>
        <span
          className={`ml-3 text-sm font-semibold tabular-nums ${rec.amountCents < 0 ? "text-expense" : "text-income"}`}
        >
          {formatCurrency(rec.amountCents / 100)}
        </span>
      </div>
      {suggestion && <RecurringSuggestionHint suggestion={suggestion} formatCurrency={formatCurrency} />}
    </li>
  );
}

/** "Steht diesen Monat noch an": the planned standing orders, each with its suggestion if there is one. */
export function UpcomingRecurringList({
  items,
  suggestions,
  formatCurrency
}: {
  items: readonly PlannedRecurring[];
  suggestions?: readonly RecurringSuggestion[];
  formatCurrency: FormatCurrency;
}) {
  return (
    <ul className="mt-2 space-y-2">
      {items.map((rec) => (
        <RecurringItem
          key={rec.id}
          rec={rec}
          suggestion={suggestions?.find((s) => s.recurringId === rec.id)}
          formatCurrency={formatCurrency}
        />
      ))}
    </ul>
  );
}
