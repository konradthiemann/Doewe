"use client";

import { fromCents, parseCents, toDecimalString } from "@doewe/shared";
import { useEffect, useMemo, useRef, useState } from "react";

import { appConfig } from "../lib/config";
import { useI18n } from "../lib/i18n";

type Account = {
  id: string;
  name: string;
};

type EditGoal = {
  id: string;
  accountId: string;
  title: string;
  month: number;
  year: number;
  amountCents: number;
};

type Props = {
  headingId?: string;
  onClose?: () => void;
  onSuccess?: (message?: string) => void;
  editGoal?: EditGoal;
};

function nextMonthValue() {
  const today = new Date();
  const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function monthYearToValue(month: number, year: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function centsToDisplayString(cents: number) {
  return toDecimalString(fromCents(cents));
}

export default function PlannedSavingForm({ headingId, onClose, onSuccess, editGoal }: Props) {
  const isEditMode = !!editGoal;
  const { locale, t } = useI18n();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState(() => ({
    title: editGoal?.title ?? "",
    amount: editGoal ? centsToDisplayString(editGoal.amountCents) : "",
    accountId: editGoal?.accountId ?? "",
    targetMonth: editGoal ? monthYearToValue(editGoal.month, editGoal.year) : nextMonthValue()
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const dateLocale = locale === "de" ? "de-DE" : "en-US";


  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/accounts", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(t("savingPlan.form.errorLoadAccounts", { status: res.status }));
        }
        const data: Account[] = await res.json();
        if (!active) return;
        setAccounts(data);
        const defaultAccount = data[0];
        setForm((current) => ({ ...current, accountId: current.accountId || defaultAccount?.id || "" }));
      } catch (fetchError) {
        if (!active) return;
        setError(fetchError instanceof Error ? fetchError.message : t("savingPlan.form.errorLoadAccountsFallback"));
      }
    })();
    return () => {
      active = false;
    };
  }, [t]);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const dueLabel = useMemo(() => {
    const [year, month] = form.targetMonth.split("-");
    if (!year || !month) return t("savingPlan.form.plannedDate");
    const date = new Date(Number(year), Number(month) - 1);
    return date.toLocaleDateString(dateLocale, { month: "long", year: "numeric" });
  }, [dateLocale, form.targetMonth, t]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInlineSuccess(null);

    const [year, month] = form.targetMonth.split("-");
    if (!year || !month) {
      setError(t("savingPlan.form.errorChooseMonth"));
      return;
    }

    let amountCents: number;
    try {
      amountCents = parseCents(form.amount);
      if (amountCents <= 0) {
        setError(t("savingPlan.form.errorAmountPositive"));
        return;
      }
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : t("savingPlan.form.errorAmountInvalid"));
      return;
    }

    if (!form.accountId) {
      setError(t("savingPlan.form.errorSelectAccount"));
      return;
    }

    setLoading(true);
    try {
      const payload = {
        accountId: form.accountId,
        title: form.title,
        targetYear: Number(year),
        targetMonth: Number(month),
        amountCents
      };

      const url = isEditMode ? `/api/saving-plan/${editGoal.id}` : "/api/saving-plan";
      const method = isEditMode ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const details = await res.json().catch(() => undefined);
        const errorKey = isEditMode ? "savingPlan.form.errorUpdateFailed" : "savingPlan.form.errorSaveFailed";
        const message = details?.error
          ? JSON.stringify(details.error)
          : t(errorKey, { status: res.status });
        setError(message);
        return;
      }

      const message = isEditMode ? t("savingPlan.form.updated") : t("savingPlan.form.added");
      setInlineSuccess(message);
      if (!isEditMode) {
        setForm((current) => ({ ...current, amount: "" }));
      }
      onSuccess?.(message);
    } catch (submitError) {
      const fallbackKey = isEditMode ? "savingPlan.form.errorUpdate" : "savingPlan.form.errorSave";
      setError(submitError instanceof Error ? submitError.message : t(fallbackKey));
    } finally {
      setLoading(false);
    }
  }

  const submitLabel = loading
    ? (isEditMode ? t("savingPlan.form.updating") : t("savingPlan.form.saving"))
    : (isEditMode ? t("savingPlan.form.update") : t("savingPlan.form.save"));

  return (
    <form
      onSubmit={handleSubmit}
      aria-describedby={error ? "saving-plan-error" : undefined}
      className="relative flex max-h-[calc(100vh-4rem)] w-full flex-col space-y-4 overflow-y-auto rounded-xl border border-white/30 bg-white/95 p-4 text-left shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-neutral-800/95 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={headingId} className="text-lg font-semibold">
            {isEditMode ? t("savingPlan.form.editTitle") : t("savingPlan.form.title")}
          </h3>
          <p className="text-xs text-gray-500 dark:text-neutral-400">
            {isEditMode ? t("savingPlan.form.editSubtitle") : t("savingPlan.form.subtitle")}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-md p-1.5 transition hover:bg-black/5 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:hover:bg-white/10 dark:focus-visible:ring-offset-neutral-900"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ×
            </span>
          </button>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="saving-plan-title">
          {t("savingPlan.form.goalName")} <span className="text-red-600">*</span>
        </label>
        <input
          ref={titleRef}
          id="saving-plan-title"
          name="title"
          required
          value={form.title}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
        />
      </div>

      {appConfig.enableAccountSelection && (
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="saving-plan-account">
            {t("savingPlan.form.account")} <span className="text-red-600">*</span>
          </label>
          <select
            id="saving-plan-account"
            name="accountId"
            required
            value={form.accountId}
            onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="" disabled>
              {t("savingPlan.form.accountPlaceholder")}
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="saving-plan-due">
            {t("savingPlan.form.targetMonth")} <span className="text-red-600">*</span>
          </label>
          <input
            id="saving-plan-due"
            name="targetMonth"
            type="month"
            required
            value={form.targetMonth}
            onChange={(event) => setForm((current) => ({ ...current, targetMonth: event.target.value }))}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400" aria-live="polite">
            {dueLabel}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="saving-plan-amount">
            {t("savingPlan.form.amount")} <span className="text-red-600">*</span>
          </label>
          <input
            id="saving-plan-amount"
            name="amount"
            inputMode="decimal"
            required
            value={form.amount}
            onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
            aria-invalid={!!error && form.amount.trim() === ""}
            placeholder={t("savingPlan.form.amountPlaceholder")}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900"
        >
          {submitLabel}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800 dark:focus-visible:ring-offset-neutral-900"
          >
            {t("savingPlan.form.cancel")}
          </button>
        )}
      </div>

      {error && (
        <p id="saving-plan-error" role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {inlineSuccess && (
        <p role="status" className="text-sm text-emerald-600">
          {inlineSuccess}
        </p>
      )}
    </form>
  );
}
