"use client";

import { fromCents, parseCents, toDecimalString } from "@doewe/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { cn } from "../lib/cn";
import { appConfig } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { recurringTransactionFormSchema, type RecurringTransactionFormValues } from "../lib/schemas/forms";

import { Button } from "./ui/Button";

type RecurringDetails = {
  id: string;
  accountId: string;
  amountCents: number;
  description: string;
  categoryId?: string | null;
  intervalMonths: number;
  dayOfMonth?: number;
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
  onDelete,
}: Props) {
  const { t } = useI18n();
  const [txType, setTxType] = useState<"income" | "outcome">(
    recurring.amountCents >= 0 ? "income" : "outcome"
  );
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; isIncome: boolean }>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const descriptionRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RecurringTransactionFormValues>({
    resolver: zodResolver(recurringTransactionFormSchema),
    defaultValues: {
      description: recurring.description,
      amount: toDecimalString(fromCents(Math.abs(recurring.amountCents))),
      accountId: recurring.accountId,
      categoryId: recurring.categoryId ?? "",
      intervalMonths: recurring.intervalMonths || 1,
      dayOfMonth: recurring.dayOfMonth ?? 1,
    },
  });

  const categoryId = watch("categoryId");

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [accRes, catRes] = await Promise.all([
          fetch("/api/accounts", { cache: "no-store" }),
          fetch("/api/categories", { cache: "no-store" }),
        ]);

        if (!accRes.ok || !catRes.ok) {
          throw new Error(t("recurringForm.errorLoadRef"));
        }

        const [acc, cat]: [
          Array<{ id: string; name: string }>,
          Array<{ id: string; name: string; isIncome: boolean }>
        ] = await Promise.all([accRes.json(), catRes.json()]);

        if (!active) return;

        setAccounts(acc);
        setCategories(cat);
      } catch (err) {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : t("recurringForm.errorLoadRefFallback"));
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
    if (!categoryId || categories.length === 0) return;

    const allowed = categories.filter((c) => (txType === "income" ? c.isIncome : !c.isIncome));
    if (!allowed.some((c) => c.id === categoryId)) {
      setValue("categoryId", allowed[0]?.id ?? "");
    }
  }, [categories, categoryId, txType, setValue]);

  async function onSubmit(values: RecurringTransactionFormValues) {
    setSubmitError(null);
    setInlineSuccess(null);

    let rawCents: number;
    try {
      rawCents = parseCents(values.amount);
    } catch (parseError) {
      setSubmitError(parseError instanceof Error ? parseError.message : t("recurringForm.errorInvalidAmount"));
      return;
    }

    const signedCents = txType === "income" ? Math.abs(rawCents) : -Math.abs(rawCents);
    const payload = {
      accountId: values.accountId,
      amountCents: signedCents,
      description: values.description,
      categoryId: values.categoryId || undefined,
      intervalMonths: values.intervalMonths,
      dayOfMonth: values.dayOfMonth,
    };

    try {
      const res = await fetch(`/api/recurring-transactions/${recurring.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setSubmitError(t("recurringForm.errorSaveFailed", { status: res.status }));
        return;
      }

      const message = t("recurringForm.updated");
      setInlineSuccess(message);
      onSuccess?.(message);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t("recurringForm.errorSave"));
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

  const submitLabel = isSubmitting ? t("recurringForm.saving") : t("recurringForm.save");

  return (
    <div className="relative mx-auto w-full max-w-lg sm:max-w-xl">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-1 rounded-xl blur-sm transition-opacity duration-700 bg-gradient-to-r from-indigo-500/20 via-purple-400/20 to-indigo-400/20 opacity-100"
      />
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="relative flex max-h-[calc(100vh-4rem)] w-full flex-col space-y-4 overflow-y-auto rounded-xl border border-white/40 bg-white/95 p-4 text-left shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-neutral-800/95 sm:p-6"
        aria-describedby={submitError ?? loadError ? "form-error" : undefined}
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
            className={cn(
              "relative px-3 py-1.5 rounded-md text-sm font-medium focus:outline-none focus-visible:ring focus-visible:ring-offset-2",
              txType === "income"
                ? "text-white focus-visible:ring-green-500"
                : "text-green-700 dark:text-green-300 focus-visible:ring-green-500"
            )}
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
            className={cn(
              "relative px-3 py-1.5 rounded-md text-sm font-medium focus:outline-none focus-visible:ring focus-visible:ring-offset-2",
              txType === "outcome"
                ? "text-white focus-visible:ring-red-500"
                : "text-red-700 dark:text-red-300 focus-visible:ring-red-500"
            )}
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
              {...register("accountId")}
              id="recurring-account"
              aria-invalid={!!errors.accountId}
              className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
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
            {errors.accountId && (
              <p role="alert" className="mt-1 text-xs text-red-600">{errors.accountId.message}</p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="recurring-description">
            {t("recurringForm.descriptionLabel")} <span className="text-red-600">*</span>
          </label>
          <input
            {...register("description")}
            ref={(el) => {
              register("description").ref(el);
              (descriptionRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
            }}
            id="recurring-description"
            aria-invalid={!!errors.description}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
          />
          {errors.description && (
            <p role="alert" className="mt-1 text-xs text-red-600">{errors.description.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="recurring-amount">
            {t("recurringForm.amountLabel")} <span className="text-red-600">*</span>
          </label>
          <input
            {...register("amount")}
            id="recurring-amount"
            inputMode="decimal"
            placeholder={t("recurringForm.amountPlaceholder")}
            aria-invalid={!!errors.amount}
            aria-describedby="recurring-amount-hint"
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
          />
          <p id="recurring-amount-hint" className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
            {t("recurringForm.amountHint")}
          </p>
          {errors.amount && (
            <p role="alert" className="mt-1 text-xs text-red-600">{errors.amount.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="recurring-category">
            {t("recurringForm.categoryLabel")}
          </label>
          <select
            {...register("categoryId")}
            id="recurring-category"
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
            {...register("intervalMonths", { valueAsNumber: true })}
            id="recurring-interval"
            type="number"
            min={1}
            max={24}
            aria-invalid={!!errors.intervalMonths}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
          />
          <p className="text-xs text-gray-500 dark:text-neutral-400">{t("recurringForm.intervalHelper")}</p>
          {errors.intervalMonths && (
            <p role="alert" className="mt-1 text-xs text-red-600">{errors.intervalMonths.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="recurring-dayofmonth">
            {t("recurringForm.dayOfMonthLabel")} <span className="text-red-600">*</span>
          </label>
          <input
            {...register("dayOfMonth", { valueAsNumber: true })}
            id="recurring-dayofmonth"
            type="number"
            min={1}
            max={31}
            aria-invalid={!!errors.dayOfMonth}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
          />
          <p className="text-xs text-gray-500 dark:text-neutral-400">{t("recurringForm.dayOfMonthHelper")}</p>
          {errors.dayOfMonth && (
            <p role="alert" className="mt-1 text-xs text-red-600">{errors.dayOfMonth.message}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={isSubmitting} className="flex-1">
            {submitLabel}
          </Button>
          {onClose && (
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              {t("recurringForm.cancel")}
            </Button>
          )}
        </div>

        {(submitError ?? loadError) && (
          <p id="form-error" role="alert" className="text-sm text-red-600">
            {submitError ?? loadError}
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
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteLoading}
                >
                  {deleteLoading ? t("recurringForm.deleteLoading") : t("recurringForm.deleteConfirm")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDeleteConfirm(false);
                    setDeleteError(null);
                  }}
                >
                  {t("recurringForm.cancel")}
                </Button>
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
