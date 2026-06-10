"use client";

import { fromCents, parseCents, toDecimalString } from "@doewe/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { createCategoryAction } from "../app/actions/categories";
import { appConfig } from "../lib/config";
import { cn } from "../lib/cn";
import { useI18n } from "../lib/i18n";
import { transactionFormSchema, type TransactionFormValues } from "../lib/schemas/forms";

import SearchableSelect from "./SearchableSelect";
import { Button } from "./ui/Button";

type TransactionDetails = {
  id: string;
  accountId: string;
  amountCents: number;
  description: string;
  occurredAt: string;
  categoryId?: string | null;
};

type Props = {
  mode?: "create" | "edit";
  transaction?: TransactionDetails;
  headingId?: string;
  onSuccess?: (message?: string) => void;
  onClose?: () => void;
  onDelete?: (message?: string) => void;
};

export default function TransactionForm({
  mode = "create",
  transaction,
  headingId,
  onSuccess,
  onClose,
  onDelete,
}: Props) {
  const { t } = useI18n();

  const [txType, setTxType] = useState<"income" | "outcome">(
    transaction ? (transaction.amountCents >= 0 ? "income" : "outcome") : "outcome"
  );
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; isIncome: boolean; usageCount?: number }>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryLoading, setNewCategoryLoading] = useState(false);
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [intervalMonths, setIntervalMonths] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [selectedSavingGoalId, setSelectedSavingGoalId] = useState("");
  const [savingGoals, setSavingGoals] = useState<Array<{ id: string; title: string; month: number; year: number }>>([]);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const newCategoryRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      description: transaction?.description ?? "",
      amount: transaction ? toDecimalString(fromCents(Math.abs(transaction.amountCents))) : "",
      accountId: transaction?.accountId ?? "",
      categoryId: transaction?.categoryId ?? "",
    },
  });

  const categoryId = watch("categoryId");

  useEffect(() => {
    if (mode !== "create") return;
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/saving-plan", { cache: "no-store" });
        if (!res.ok) return;
        const json: { goals: Array<{ id: string; title: string; month: number; year: number }> } = await res.json();
        if (!active) return;
        setSavingGoals(json.goals);
      } catch {
        // non-critical, ignore
      }
    })();
    return () => { active = false; };
  }, [mode]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [accRes, catRes] = await Promise.all([
          fetch("/api/accounts", { cache: "no-store" }),
          fetch("/api/categories?sortByUsage=true", { cache: "no-store" }),
        ]);

        if (!accRes.ok || !catRes.ok) {
          throw new Error(t("transactionForm.errorLoadRef"));
        }

        const [acc, cat]: [
          Array<{ id: string; name: string }>,
          Array<{ id: string; name: string; isIncome: boolean; usageCount?: number }>
        ] = await Promise.all([accRes.json(), catRes.json()]);

        if (!active) return;

        setAccounts(acc);
        setCategories(cat);

        if (mode === "create") {
          const defaultAccount = acc[0];
          const defaultCategory = (txType === "income" ? cat.find((c) => c.isIncome) : cat.find((c) => !c.isIncome)) ?? cat[0];

          if (defaultAccount && !watch("accountId")) setValue("accountId", defaultAccount.id);
          if (defaultCategory && !watch("categoryId")) setValue("categoryId", defaultCategory.id);
        }
      } catch (err) {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : t("transactionForm.errorLoadRefFallback"));
      }
    })();

    return () => {
      active = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, t, txType]);

  useEffect(() => {
    if (mode === "edit" && transaction) {
      reset({
        description: transaction.description,
        amount: toDecimalString(fromCents(Math.abs(transaction.amountCents))),
        accountId: transaction.accountId,
        categoryId: transaction.categoryId ?? "",
      });
      setTxType(transaction.amountCents >= 0 ? "income" : "outcome");
    }
  }, [mode, transaction, reset]);

  useEffect(() => {
    if (showNewCategory) {
      newCategoryRef.current?.focus();
    }
  }, [showNewCategory]);

  useEffect(() => {
    descriptionRef.current?.focus();
  }, [mode, transaction?.id]);

  const filteredCategories = useMemo(() => {
    const base = categories.filter((c) => (txType === "income" ? c.isIncome : !c.isIncome));
    if (mode === "edit" && transaction?.categoryId) {
      const current = categories.find((c) => c.id === transaction.categoryId);
      if (current && !base.some((c) => c.id === current.id)) {
        return [...base, current];
      }
    }
    return base;
  }, [categories, mode, transaction?.categoryId, txType]);

  useEffect(() => {
    if (!categoryId || categoryId === "" || categoryId === "__new__" || categories.length === 0) return;

    const allowed = categories.filter((c) => (txType === "income" ? c.isIncome : !c.isIncome));
    if (!allowed.some((c) => c.id === categoryId)) {
      setValue("categoryId", allowed[0]?.id ?? "");
    }
  }, [categories, categoryId, txType, setValue]);

  async function onSubmit(values: TransactionFormValues) {
    setSubmitError(null);
    setInlineSuccess(null);
    setRecurringError(null);

    let rawCents: number;
    try {
      rawCents = parseCents(values.amount);
    } catch (parseError) {
      setSubmitError(parseError instanceof Error ? parseError.message : t("transactionForm.errorInvalidAmount"));
      return;
    }

    if (isRecurring && intervalMonths < 1) {
      setRecurringError(t("transactionForm.errorInterval"));
      return;
    }

    if (isRecurring && (dayOfMonth < 1 || dayOfMonth > 31)) {
      setRecurringError(t("transactionForm.errorDayOfMonth"));
      return;
    }

    const signedCents = txType === "income" ? Math.abs(rawCents) : -Math.abs(rawCents);
    const endpoint = mode === "edit" && transaction ? `/api/transactions/${transaction.id}` : "/api/transactions";
    const method = mode === "edit" ? "PATCH" : "POST";
    const payload = {
      accountId: values.accountId,
      amountCents: signedCents,
      description: values.description,
      occurredAt: mode === "edit" && transaction ? transaction.occurredAt : new Date().toISOString(),
      categoryId: values.categoryId && values.categoryId !== "__new__" ? values.categoryId : undefined,
      savingGoalId: isSavingGoal && selectedSavingGoalId ? selectedSavingGoalId : undefined,
    };

    try {
      if (mode === "create" && isRecurring) {
        await handleRecurringSubmit({
          accountId: payload.accountId,
          categoryId: payload.categoryId,
          amountCents: payload.amountCents,
          description: payload.description,
          intervalMonths,
          dayOfMonth,
        });
      } else {
        const res = await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          setSubmitError(t("transactionForm.errorSaveFailed", { status: res.status }));
          return;
        }
      }

      const message = mode === "edit"
        ? t("transactionForm.updated")
        : isRecurring
          ? t("transactionForm.recurringSaved")
          : t("transactionForm.saved");
      setInlineSuccess(message);
      onSuccess?.(message);

      if (mode === "create") {
        reset((current) => ({ ...current, description: "", amount: "" }));
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t("transactionForm.errorSave"));
    }
  }

  async function handleRecurringSubmit(payload: {
    accountId: string;
    categoryId?: string | undefined;
    amountCents: number;
    description: string;
    intervalMonths: number;
    dayOfMonth: number;
  }) {
    const res = await fetch("/api/recurring-transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const details = await res.json().catch(() => null);
      const message = details?.error ? JSON.stringify(details.error) : t("transactionForm.errorSaveFailed", { status: res.status });
      throw new Error(message);
    }
  }

  async function handleAddCategory() {
    setNewCategoryError(null);
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      setNewCategoryError(t("transactionForm.errorCategoryName"));
      return;
    }

    setNewCategoryLoading(true);
    try {
      const result = await createCategoryAction({ name: trimmed, isIncome: txType === "income" });

      if (result?.serverError) {
        setNewCategoryError(String(result.serverError));
        return;
      }

      const created = result?.data;
      if (!created) {
        setNewCategoryError(t("transactionForm.errorAddCategory"));
        return;
      }

      setCategories((current) => [created, ...current]);
      setValue("categoryId", created.id);
      setNewCategoryName("");
      setShowNewCategory(false);
    } catch (err) {
      setNewCategoryError(err instanceof Error ? err.message : t("transactionForm.errorAddCategory"));
    } finally {
      setNewCategoryLoading(false);
    }
  }

  async function handleDelete() {
    if (!transaction) return;
    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        setDeleteError(t("transactionForm.errorDeleteFailed", { status: res.status }));
        setDeleteLoading(false);
        return;
      }

      const message = t("transactionForm.deleted");
      onDelete?.(message);
      onClose?.();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t("transactionForm.errorDelete"));
    } finally {
      setDeleteLoading(false);
    }
  }

  const submitLabel = isSubmitting
    ? t("transactionForm.saving")
    : mode === "edit"
      ? t("transactionForm.save")
      : t("transactionForm.add");

  return (
    <div className="relative mx-auto w-full max-w-lg sm:max-w-xl">
      <div
        aria-hidden
        className={`pointer-events-none absolute -inset-1 rounded-xl blur-sm transition-opacity duration-700 ${
          txType === "income"
            ? "bg-gradient-to-r from-green-500/20 via-emerald-400/20 to-green-400/20 opacity-100 animate-pulse"
            : "bg-gradient-to-r from-rose-500/20 via-red-400/20 to-rose-400/20 opacity-100 animate-pulse"
        }`}
        style={{ animationDuration: "3.5s" }}
      />
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="relative flex max-h-[calc(100vh-4rem)] w-full flex-col space-y-4 overflow-y-auto rounded-xl border border-white/40 bg-white/95 p-4 text-left shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-neutral-800/95 sm:p-6"
        aria-describedby={submitError ? "form-error" : undefined}
      >
        <div className="flex items-center justify-between">
          <h3 id={headingId} className="text-base font-semibold">
            {mode === "edit" ? t("transactionForm.editTitle") : t("transactionForm.addTitle")}
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
          aria-label={t("transactionForm.typeLabel")}
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
            onClick={() => {
              setTxType("income");
              const first = categories.find((c) => c.isIncome);
              setValue("categoryId", first?.id ?? categoryId);
            }}
          >
            <span className="relative z-10">{t("transactionForm.income")}</span>
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
            onClick={() => {
              setTxType("outcome");
              const first = categories.find((c) => !c.isIncome);
              setValue("categoryId", first?.id ?? categoryId);
            }}
          >
            <span className="relative z-10">{t("transactionForm.outcome")}</span>
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
            <label className="block text-sm font-medium mb-1" htmlFor="tx-account">
              {t("transactionForm.accountLabel")} <span className="text-red-600">*</span>
            </label>
            <select
              {...register("accountId")}
              id="tx-account"
              aria-invalid={!!errors.accountId}
              className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="" disabled>
                {t("transactionForm.accountPlaceholder")}
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
          <label className="block text-sm font-medium mb-1" htmlFor="tx-category">
            {t("transactionForm.categoryLabel")}
          </label>
          <SearchableSelect
            id="tx-category"
            name="categoryId"
            value={categoryId ?? ""}
            options={filteredCategories.map((category) => ({
              id: category.id,
              label: category.name,
              usageCount: category.usageCount,
            }))}
            placeholder={t("transactionForm.categoryNone")}
            searchPlaceholder={t("transactionForm.categorySearchPlaceholder")}
            noResultsText={t("transactionForm.categoryNoResults")}
            addNewLabel={t("transactionForm.categoryAddNew")}
            onChange={(value) => {
              setShowNewCategory(false);
              setNewCategoryError(null);
              setValue("categoryId", value);
            }}
            onAddNew={() => {
              setShowNewCategory(true);
              setValue("categoryId", "__new__");
            }}
            aria-describedby={newCategoryError ? "tx-category-error" : undefined}
          />
          {showNewCategory && (
            <div className="mt-2 space-y-2">
              <label className="block text-sm font-medium" htmlFor="tx-category-new">
                {t("transactionForm.categoryNewLabel")}
              </label>
              <input
                id="tx-category-new"
                ref={newCategoryRef}
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
                aria-invalid={!!newCategoryError}
                aria-describedby={newCategoryError ? "tx-category-error" : undefined}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddCategory}
                  disabled={newCategoryLoading}
                >
                  {newCategoryLoading ? t("transactionForm.saving") : t("transactionForm.categoryAddButton")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setShowNewCategory(false);
                    setNewCategoryName("");
                    setNewCategoryError(null);
                    setValue("categoryId", "");
                  }}
                >
                  {t("transactionForm.categoryCancel")}
                </Button>
              </div>
              {newCategoryError && (
                <p id="tx-category-error" role="alert" className="text-sm text-red-600">
                  {newCategoryError}
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="tx-description">
            {t("transactionForm.descriptionLabel")} <span className="text-red-600">*</span>
          </label>
          <input
            {...register("description")}
            ref={(el) => {
              register("description").ref(el);
              (descriptionRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
            }}
            id="tx-description"
            aria-invalid={!!errors.description}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
          />
          {errors.description && (
            <p role="alert" className="mt-1 text-xs text-red-600">{errors.description.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="tx-amount">
            {t("transactionForm.amountLabel")} <span className="text-red-600">*</span>
          </label>
          <input
            {...register("amount")}
            id="tx-amount"
            inputMode="decimal"
            placeholder={t("transactionForm.amountPlaceholder")}
            aria-invalid={!!errors.amount}
            aria-describedby="tx-amount-hint"
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
          />
          <p id="tx-amount-hint" className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
            {t("transactionForm.amountHint")}
          </p>
          {errors.amount && (
            <p role="alert" className="mt-1 text-xs text-red-600">{errors.amount.message}</p>
          )}
        </div>

        {mode === "create" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-indigo-50/70 px-3 py-2 text-sm text-gray-700 shadow-sm dark:bg-indigo-900/20 dark:text-neutral-200">
              <div>
                <p className="font-medium">{t("transactionForm.recurringToggleTitle")}</p>
                <p className="text-xs text-gray-500 dark:text-neutral-400">
                  {t("transactionForm.recurringToggleDescription")}
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={isRecurring}
                  onChange={(event) => setIsRecurring(event.target.checked)}
                  aria-checked={isRecurring}
                />
                <span className="h-6 w-11 rounded-full bg-gray-200 transition peer-checked:bg-indigo-600 dark:bg-neutral-700" />
                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
              </label>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-emerald-50/70 px-3 py-2 text-sm text-gray-700 shadow-sm dark:bg-emerald-900/20 dark:text-neutral-200">
              <div>
                <p className="font-medium">{t("transactionForm.savingGoalToggleTitle")}</p>
                <p className="text-xs text-gray-500 dark:text-neutral-400">
                  {t("transactionForm.savingGoalToggleDescription")}
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={isSavingGoal}
                  onChange={(event) => {
                    setIsSavingGoal(event.target.checked);
                    if (!event.target.checked) setSelectedSavingGoalId("");
                  }}
                  aria-checked={isSavingGoal}
                />
                <span className="h-6 w-11 rounded-full bg-gray-200 transition peer-checked:bg-emerald-600 dark:bg-neutral-700" />
                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
              </label>
            </div>
            {isSavingGoal && (
              <div className="space-y-2">
                <label className="block text-sm font-medium" htmlFor="tx-saving-goal">
                  {t("transactionForm.savingGoalLabel")} <span className="text-red-600">*</span>
                </label>
                <select
                  id="tx-saving-goal"
                  value={selectedSavingGoalId}
                  onChange={(event) => setSelectedSavingGoalId(event.target.value)}
                  className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-emerald-500 focus:ring-emerald-500"
                >
                  <option value="" disabled>
                    {t("transactionForm.savingGoalPlaceholder")}
                  </option>
                  {savingGoals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.title} ({goal.year}-{String(goal.month).padStart(2, "0")})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {isRecurring && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium" htmlFor="tx-interval-months">
                    {t("transactionForm.intervalLabel")} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="tx-interval-months"
                    type="number"
                    min={1}
                    max={24}
                    value={intervalMonths}
                    onChange={(event) => setIntervalMonths(Number(event.target.value))}
                    className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
                    aria-required="true"
                    aria-invalid={!!recurringError}
                    aria-describedby={recurringError ? "tx-recurring-error" : undefined}
                  />
                  <p className="text-xs text-gray-500 dark:text-neutral-400">
                    {t("transactionForm.intervalHelper")}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium" htmlFor="tx-day-of-month">
                    {t("transactionForm.dayOfMonthLabel")} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="tx-day-of-month"
                    type="number"
                    min={1}
                    max={31}
                    value={dayOfMonth}
                    onChange={(event) => setDayOfMonth(Number(event.target.value))}
                    className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
                    aria-required="true"
                    aria-invalid={!!recurringError}
                  />
                  <p className="text-xs text-gray-500 dark:text-neutral-400">
                    {t("transactionForm.dayOfMonthHelper")}
                  </p>
                </div>
                {recurringError && (
                  <p id="tx-recurring-error" role="alert" className="text-sm text-red-600">
                    {recurringError}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={isSubmitting} className="flex-1">
            {submitLabel}
          </Button>
          {onClose && (
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              {t("transactionForm.cancel")}
            </Button>
          )}
        </div>

        {submitError && (
          <p id="form-error" role="alert" className="text-sm text-red-600">
            {submitError}
          </p>
        )}

        {inlineSuccess && (
          <p role="status" className="text-sm text-green-600">
            {inlineSuccess}
          </p>
        )}

        {mode === "edit" && (
          <div className="border-t border-gray-200 pt-4 dark:border-neutral-700">
            {!deleteConfirm ? (
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirm(true);
                  setDeleteError(null);
                }}
                className="inline-flex items-center gap-2 text-sm font-semibold text-red-600 hover:text-red-700 focus:outline-none focus-visible:ring focus-visible:ring-red-500 focus-visible:ring-offset-2"
              >
                {t("transactionForm.deleteAction")}
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-700 dark:text-neutral-300">
                  {t("transactionForm.deleteConfirmText")}
                </p>
                {deleteError && (
                  <p role="alert" className="text-sm text-red-600">
                    {deleteError}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    onClick={handleDelete}
                    disabled={deleteLoading}
                    className="flex-1"
                  >
                    {deleteLoading ? t("transactionForm.deleteLoading") : t("transactionForm.delete")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setDeleteConfirm(false);
                      setDeleteError(null);
                    }}
                    className="flex-1"
                  >
                    {t("transactionForm.cancelDelete")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
