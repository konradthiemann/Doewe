"use client";

import { fromCents, parseCents, toDecimalString } from "@doewe/shared";
import { useEffect, useMemo, useRef, useState } from "react";

import { appConfig } from "../lib/config";
import { useI18n } from "../lib/i18n";

type RecurringDetails = {
  id: string;
  accountId: string;
  amountCents: number;
  description: string;
  categoryId?: string | null;
  intervalMonths: number;
};

type Props = {
  recurring: RecurringDetails;
  headingId?: string;
  onSuccess?: (message?: string) => void;
  onClose?: () => void;
  onDelete?: (message?: string) => void;
};

export default function RecurringTransactionForm({
  recurring,
  headingId,
  onSuccess,
  onClose,
  onDelete
}: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState(() => ({
    description: recurring.description,
    amount: toDecimalString(fromCents(Math.abs(recurring.amountCents))),
    accountId: recurring.accountId,
    categoryId: recurring.categoryId ?? "",
    intervalMonths: recurring.intervalMonths || 1
  }));
  const [txType, setTxType] = useState<"income" | "outcome">(
    recurring.amountCents >= 0 ? "income" : "outcome"
  );
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; isIncome: boolean }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const descriptionRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [accRes, catRes] = await Promise.all([
          fetch("/api/accounts", { cache: "no-store" }),
          fetch("/api/categories", { cache: "no-store" })
        ]);

        if (!accRes.ok || !catRes.ok) {
          throw new Error(t("recurringForm.errorLoadRef"));
        }

        const [acc, cat]: [Array<{ id: string; name: string }>, Array<{ id: string; name: string; isIncome: boolean }>]
          = await Promise.all([accRes.json(), catRes.json()]);

        if (!active) return;

        setAccounts(acc);
        setCategories(cat);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : t("recurringForm.errorLoadRefFallback"));
      }
    })();

    return () => {
      active = false;
    };
  }, [t]);

  useEffect(() => {
    descriptionRef.current?.focus();
  }, [recurring.id]);

  const filteredCategories = useMemo(() => {
    const base = categories.filter((c) => (txType === "income" ? c.isIncome : !c.isIncome));
    if (recurring.categoryId) {
      const current = categories.find((c) => c.id === recurring.categoryId);
      if (current && !base.some((c) => c.id === current.id)) {
        return [...base, current];
      }
    }
    return base;
  }, [categories, recurring.categoryId, txType]);

  useEffect(() => {
    if (form.categoryId === "" || categories.length === 0) {
      return;
    }

    setForm((current) => {
      const allowed = categories.filter((category) => (txType === "income" ? category.isIncome : !category.isIncome));
      if (allowed.some((category) => category.id === current.categoryId)) {
        return current;
      }

      const fallback = allowed[0]?.id ?? "";
      if (fallback === current.categoryId) {
        return current;
      }

      return { ...current, categoryId: fallback };
    });
  }, [categories, form.categoryId, txType]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInlineSuccess(null);

    let rawCents: number;
    try {
      rawCents = parseCents(form.amount);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : t("recurringForm.errorInvalidAmount"));
      return;
    }

    if (form.intervalMonths < 1) {
      setError(t("recurringForm.errorInterval"));
      return;
    }

    setLoading(true);

    const signedCents = txType === "income" ? Math.abs(rawCents) : -Math.abs(rawCents);
    const payload = {
      accountId: form.accountId,
      amountCents: signedCents,
      description: form.description,
      categoryId: form.categoryId || undefined,
      intervalMonths: form.intervalMonths
    };

    try {
      const res = await fetch(`/api/recurring-transactions/${recurring.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        setError(t("recurringForm.errorSaveFailed", { status: res.status }));
        return;
      }

      const message = t("recurringForm.updated");
      setInlineSuccess(message);
      onSuccess?.(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("recurringForm.errorSave"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/recurring-transactions/${recurring.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        setDeleteError(t("recurringForm.errorDeleteFailed", { status: res.status }));
        setDeleteLoading(false);
        return;
      }

      const message = t("recurringForm.deleted");
      onDelete?.(message);
      onClose?.();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t("recurringForm.errorDelete"));
    } finally {
      setDeleteLoading(false);
    }
  }

  const submitLabel = loading ? t("recurringForm.saving") : t("recurringForm.save");

  return (
    <div className="relative mx-auto w-full max-w-lg sm:max-w-xl">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-1 rounded-xl blur-sm transition-opacity duration-700 bg-gradient-to-r from-indigo-500/20 via-purple-400/20 to-indigo-400/20 opacity-100"
      />
      <form
        onSubmit={handleSubmit}
        className="relative flex max-h-[calc(100vh-4rem)] w-full flex-col space-y-4 overflow-y-auto rounded-xl border border-white/40 bg-white/95 p-4 text-left shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-neutral-800/95 sm:p-6"
        aria-describedby={error ? "form-error" : undefined}
      >
        <div className="flex items-center justify-between">
          <h3 id={headingId} className="text-base font-semibold">
            {t("recurringForm.title")}
          </h3>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"
            >
              ×
            </button>
          )}
        </div>

        <div
          className="flex items-center justify-center gap-2"
          role="group"
          aria-label={t("recurringForm.typeLabel")}
        >
          <button
            type="button"
            className={`relative px-3 py-1.5 rounded-md text-sm font-medium focus:outline-none focus-visible:ring focus-visible:ring-offset-2 ${
              txType === "income"
                ? "text-white focus-visible:ring-green-500"
                : "text-green-700 dark:text-green-300 focus-visible:ring-green-500"
            }`}
            aria-pressed={txType === "income"}
            onClick={() => setTxType("income")}
          >
            <span className="relative z-10">{t("recurringForm.income")}</span>
            {txType === "income" && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-md bg-gradient-to-r from-green-500 via-emerald-500 to-green-400 animate-pulse opacity-80"
                style={{ animationDuration: "2.8s" }}
              />
            )}
          </button>
          <button
            type="button"
            className={`relative px-3 py-1.5 rounded-md text-sm font-medium focus:outline-none focus-visible:ring focus-visible:ring-offset-2 ${
              txType === "outcome"
                ? "text-white focus-visible:ring-red-500"
                : "text-red-700 dark:text-red-300 focus-visible:ring-red-500"
            }`}
            aria-pressed={txType === "outcome"}
            onClick={() => setTxType("outcome")}
          >
            <span className="relative z-10">{t("recurringForm.outcome")}</span>
            {txType === "outcome" && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-md bg-gradient-to-r from-red-500 via-rose-500 to-red-400 animate-pulse opacity-80"
                style={{ animationDuration: "2.8s" }}
              />
            )}
          </button>
        </div>

        {appConfig.enableAccountSelection && (
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="recurring-account">
              {t("recurringForm.accountLabel")} <span className="text-red-600">*</span>
            </label>
            <select
              id="recurring-account"
              name="accountId"
              required
              value={form.accountId}
              onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))}
              className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
              aria-invalid={!!error && !form.accountId}
            >
              <option value="" disabled>
                {t("recurringForm.accountPlaceholder")}
              </option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="recurring-description">
            {t("recurringForm.descriptionLabel")} <span className="text-red-600">*</span>
          </label>
          <input
            id="recurring-description"
            name="description"
            required
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            ref={descriptionRef}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
            aria-invalid={!!error && form.description.trim() === ""}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="recurring-amount">
            {t("recurringForm.amountLabel")} <span className="text-red-600">*</span>
          </label>
          <input
            id="recurring-amount"
            name="amount"
            inputMode="decimal"
            required
            value={form.amount}
            onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
            aria-invalid={!!error && form.amount.trim() === ""}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="recurring-category">
            {t("recurringForm.categoryLabel")}
          </label>
          <select
            id="recurring-category"
            name="categoryId"
            value={form.categoryId}
            onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="">{t("recurringForm.categoryNone")}</option>
            {filteredCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="recurring-interval">
            {t("recurringForm.intervalLabel")} <span className="text-red-600">*</span>
          </label>
          <input
            id="recurring-interval"
            type="number"
            min={1}
            max={24}
            required
            value={form.intervalMonths}
            onChange={(event) => setForm((current) => ({ ...current, intervalMonths: Number(event.target.value) }))}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
            aria-invalid={!!error && form.intervalMonths < 1}
          />
          <p className="text-xs text-gray-500 dark:text-neutral-400">{t("recurringForm.intervalHelper")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex flex-1 items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            {submitLabel}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex flex-1 items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring focus-visible:ring-offset-2 focus-visible:ring-gray-400 dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              {t("recurringForm.cancel")}
            </button>
          )}
        </div>

        {error && (
          <p id="form-error" role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {inlineSuccess && (
          <p role="status" className="text-sm text-green-600">
            {inlineSuccess}
          </p>
        )}

        <div className="border-t border-gray-200 pt-3 dark:border-neutral-700">
          {!deleteConfirm ? (
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              className="text-sm font-semibold text-red-600 hover:text-red-500 focus:outline-none focus-visible:ring focus-visible:ring-red-500 focus-visible:ring-offset-2"
            >
              {t("recurringForm.deleteAction")}
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-red-600">{t("recurringForm.deletePrompt")}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="inline-flex items-center justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50 focus:outline-none focus-visible:ring focus-visible:ring-red-500 focus-visible:ring-offset-2"
                >
                  {deleteLoading ? t("recurringForm.deleteLoading") : t("recurringForm.deleteConfirm")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirm(false);
                    setDeleteError(null);
                  }}
                  className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring focus-visible:ring-offset-2 focus-visible:ring-gray-400 dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800"
                >
                  {t("recurringForm.cancel")}
                </button>
              </div>
              {deleteError && (
                <p role="alert" className="text-sm text-red-600">
                  {deleteError}
                </p>
              )}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
