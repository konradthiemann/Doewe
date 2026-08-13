"use client";

import { fromCents, parseCents, toDecimalString } from "@doewe/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { addMonths, format, parse } from "date-fns";
import { de, enUS } from "date-fns/locale";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { useApiQuery } from "../lib/api/useApiQuery";
import { appConfig } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { plannedSavingFormSchema, type PlannedSavingFormValues } from "../lib/schemas/forms";

import { Button } from "./ui/Button";

type Account = {
  id: string;
  name: string;
};

type EditGoal = {
  id: string;
  accountId: string;
  title: string;
  month: number | null;
  year: number | null;
  amountCents: number | null;
};

type Props = {
  headingId?: string;
  onClose?: () => void;
  onSuccess?: (message?: string) => void;
  editGoal?: EditGoal;
  /** Force the schedule toggle on when opening (e.g. "set a date" on an undated goal). */
  initialScheduled?: boolean;
};

function nextMonthValue() {
  return format(addMonths(new Date(), 1), "yyyy-MM");
}

function monthYearToValue(month: number, year: number) {
  return format(new Date(year, month - 1, 1), "yyyy-MM");
}

export default function PlannedSavingForm({ headingId, onClose, onSuccess, editGoal, initialScheduled }: Props) {
  const isEditMode = !!editGoal;
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const accountsQuery = useApiQuery<Account[]>(["accounts"], "/api/accounts");
  const accounts = accountsQuery.data ?? [];
  const loadError = accountsQuery.isError ? t("savingPlan.form.errorLoadAccountsFallback") : null;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const dfLocale = locale === "de" ? de : enUS;

  const editIsScheduled = !!editGoal && editGoal.month != null && editGoal.year != null;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<PlannedSavingFormValues>({
    resolver: zodResolver(plannedSavingFormSchema),
    defaultValues: {
      title: editGoal?.title ?? "",
      amount: editGoal?.amountCents != null ? toDecimalString(fromCents(editGoal.amountCents)) : "",
      accountId: editGoal?.accountId ?? "",
      scheduled: initialScheduled ?? (editGoal ? editIsScheduled : true),
      targetMonth:
        editGoal && editGoal.month != null && editGoal.year != null
          ? monthYearToValue(editGoal.month, editGoal.year)
          : nextMonthValue(),
    },
  });

  const targetMonth = watch("targetMonth");
  const scheduled = watch("scheduled");

  useEffect(() => {
    const data = accountsQuery.data;
    if (!data) return;
    // Only set default account if accountId is still empty
    const currentAccountId = editGoal?.accountId ?? "";
    if (!currentAccountId && data[0]) {
      setValue("accountId", data[0].id);
    }
  }, [accountsQuery.data, editGoal?.accountId, setValue]);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const dueLabel = useMemo(() => {
    if (!targetMonth || targetMonth.length < 7) return t("savingPlan.form.plannedDate");
    const date = parse(targetMonth, "yyyy-MM", new Date());
    return format(date, "LLLL yyyy", { locale: dfLocale });
  }, [dfLocale, targetMonth, t]);

  async function onSubmit(values: PlannedSavingFormValues) {
    setSubmitError(null);

    // Amount is optional — an undated idea may not have a concrete target yet.
    let amountCents: number | null = null;
    const trimmedAmount = values.amount.trim();
    if (trimmedAmount !== "") {
      try {
        amountCents = parseCents(trimmedAmount);
        if (amountCents <= 0) {
          setSubmitError(t("savingPlan.form.errorAmountPositive"));
          return;
        }
      } catch (parseError) {
        setSubmitError(parseError instanceof Error ? parseError.message : t("savingPlan.form.errorAmountInvalid"));
        return;
      }
    }

    // Undated goals send null for month/year (also un-schedules on edit).
    let targetYear: number | null = null;
    let targetMonth: number | null = null;
    if (values.scheduled) {
      const [year, month] = values.targetMonth.split("-");
      targetYear = Number(year);
      targetMonth = Number(month);
    }

    try {
      const payload = {
        accountId: values.accountId,
        title: values.title,
        targetYear,
        targetMonth,
        amountCents,
      };

      const url = isEditMode ? `/api/saving-plan/${editGoal.id}` : "/api/saving-plan";
      const method = isEditMode ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const details = await res.json().catch(() => undefined);
        const errorKey = isEditMode ? "savingPlan.form.errorUpdateFailed" : "savingPlan.form.errorSaveFailed";
        const message = details?.error
          ? JSON.stringify(details.error)
          : t(errorKey, { status: res.status });
        setSubmitError(message);
        return;
      }

      void queryClient.invalidateQueries({ queryKey: ["saving-plan"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });

      const message = isEditMode ? t("savingPlan.form.updated") : t("savingPlan.form.added");
      if (!isEditMode) {
        resetField("amount");
      }
      onSuccess?.(message);
    } catch (err) {
      const fallbackKey = isEditMode ? "savingPlan.form.errorUpdate" : "savingPlan.form.errorSave";
      setSubmitError(err instanceof Error ? err.message : t(fallbackKey));
    }
  }

  const submitLabel = isSubmitting
    ? (isEditMode ? t("savingPlan.form.updating") : t("savingPlan.form.saving"))
    : (isEditMode ? t("savingPlan.form.update") : t("savingPlan.form.save"));

  const displayError = submitError ?? loadError;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      aria-describedby={displayError ? "saving-plan-error" : undefined}
      className="relative flex max-h-[calc(100vh-4rem)] w-full flex-col space-y-4 overflow-y-auto rounded-xl border border-white/30 bg-white/95 p-4 text-left shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-neutral-800/95 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={headingId} className="text-lg font-semibold">
            {isEditMode ? t("savingPlan.form.editTitle") : t("savingPlan.form.title")}
          </h3>
          <p className="text-xs text-gray-500 dark:text-neutral-400">
            {isEditMode
              ? t("savingPlan.form.editSubtitle")
              : scheduled
                ? t("savingPlan.form.subtitle")
                : t("savingPlan.form.subtitleUndated")}
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
          {...register("title")}
          ref={(el) => {
            register("title").ref(el);
            (titleRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
          }}
          id="saving-plan-title"
          aria-invalid={!!errors.title}
          className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
        />
        {errors.title && (
          <p role="alert" className="mt-1 text-xs text-red-600">{errors.title.message}</p>
        )}
      </div>

      {appConfig.enableAccountSelection && (
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="saving-plan-account">
            {t("savingPlan.form.account")} <span className="text-red-600">*</span>
          </label>
          <select
            {...register("accountId")}
            id="saving-plan-account"
            aria-invalid={!!errors.accountId}
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
          {errors.accountId && (
            <p role="alert" className="mt-1 text-xs text-red-600">{errors.accountId.message}</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg bg-indigo-50/70 px-3 py-2 text-sm text-gray-700 shadow-sm dark:bg-indigo-900/20 dark:text-neutral-200">
        <div>
          <p className="font-medium">{t("savingPlan.form.scheduleToggleTitle")}</p>
          <p className="text-xs text-gray-500 dark:text-neutral-400">
            {t("savingPlan.form.scheduleToggleDescription")}
          </p>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={scheduled}
            onChange={(event) => setValue("scheduled", event.target.checked)}
            aria-checked={scheduled}
            aria-label={t("savingPlan.form.scheduleToggleTitle")}
          />
          <span className="h-6 w-11 rounded-full bg-gray-200 transition peer-checked:bg-indigo-600 dark:bg-neutral-700" />
          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
        </label>
      </div>

      <div className={`grid gap-4 ${scheduled ? "sm:grid-cols-2" : "grid-cols-1"}`}>
        {scheduled && (
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="saving-plan-due">
              {t("savingPlan.form.targetMonth")} <span className="text-red-600">*</span>
            </label>
            <input
              {...register("targetMonth")}
              id="saving-plan-due"
              type="month"
              aria-invalid={!!errors.targetMonth}
              className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400" aria-live="polite">
              {dueLabel}
            </p>
            {errors.targetMonth && (
              <p role="alert" className="mt-1 text-xs text-red-600">{errors.targetMonth.message}</p>
            )}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="saving-plan-amount">
            {t("savingPlan.form.amount")}{" "}
            <span className="text-xs font-normal text-gray-400 dark:text-neutral-500">
              {t("savingPlan.form.amountOptional")}
            </span>
          </label>
          <input
            {...register("amount")}
            id="saving-plan-amount"
            inputMode="decimal"
            aria-invalid={!!errors.amount}
            placeholder={t("savingPlan.form.amountPlaceholder")}
            aria-describedby="saving-amount-hint"
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
          />
          <p id="saving-amount-hint" className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
            {scheduled ? t("savingPlan.form.amountHint") : t("savingPlan.form.amountUndatedHint")}
          </p>
          {errors.amount && (
            <p role="alert" className="mt-1 text-xs text-red-600">{errors.amount.message}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
        {onClose && (
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("savingPlan.form.cancel")}
          </Button>
        )}
      </div>

      {displayError && (
        <p id="saving-plan-error" role="alert" className="text-sm text-red-600">
          {displayError}
        </p>
      )}
    </form>
  );
}
