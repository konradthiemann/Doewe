"use client";

import { fromCents, parseCents, toDecimalString } from "@doewe/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { createId } from "@paralleldrive/cuid2";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { createCategoryAction } from "../app/actions/categories";
import { useApiQuery } from "../lib/api/useApiQuery";
import { cn } from "../lib/cn";
import { appConfig } from "../lib/config";
import { dateInputToISO, toDateInputValue } from "../lib/dateInput";
import { useI18n } from "../lib/i18n";
import { queueOfflineTransaction, type OfflineTransactionPayload } from "../lib/offline/queueOfflineTransaction";
import { transactionFormSchema, type TransactionFormValues } from "../lib/schemas/forms";

import AttachmentManager, { uploadAttachment } from "./AttachmentManager";
import SearchableSelect from "./SearchableSelect";
import { Button, buttonVariants } from "./ui/Button";

const isReceiptScannerEnabled = process.env.NEXT_PUBLIC_RECEIPT_SCANNER_ENABLED === "1";

type TransactionDetails = {
  id: string;
  accountId: string;
  amountCents: number;
  description: string;
  occurredAt: string;
  categoryId?: string | null;
  taxRelevant?: boolean;
};

type CategoryOption = {
  id: string;
  name: string;
  isIncome: boolean;
  isTaxRelevant?: boolean;
  usageCount?: number;
};

type Props = {
  mode?: "create" | "edit";
  transaction?: TransactionDetails;
  headingId?: string;
  onSuccess?: (message?: string, options?: { keepOpen?: boolean }) => void;
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
  const queryClient = useQueryClient();

  const [txType, setTxType] = useState<"income" | "outcome">(
    transaction ? (transaction.amountCents >= 0 ? "income" : "outcome") : "outcome"
  );
  const accountsQuery = useApiQuery<Array<{ id: string; name: string }>>(["accounts"], "/api/accounts");
  const categoriesQuery = useApiQuery<CategoryOption[]>(["categories", "byUsage"], "/api/categories?sortByUsage=true");
  const savingPlanQuery = useApiQuery<{ goals: Array<{ id: string; title: string; month: number; year: number }> }>(
    ["saving-plan"],
    "/api/saving-plan",
    { enabled: mode === "create" }
  );
  const accounts = accountsQuery.data ?? [];
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const savingGoals = savingPlanQuery.data?.goals ?? [];
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryLoading, setNewCategoryLoading] = useState(false);
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [intervalMonths, setIntervalMonths] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [selectedSavingGoalId, setSelectedSavingGoalId] = useState("");
  const [taxRelevant, setTaxRelevant] = useState(transaction?.taxRelevant ?? false);
  const [taxTouched, setTaxTouched] = useState(false);
  const [taxHintOpen, setTaxHintOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentUploadError, setAttachmentUploadError] = useState<string | null>(null);
  const initialCategoryIdRef = useRef(transaction?.categoryId ?? null);
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
      occurredAt: toDateInputValue(transaction ? new Date(transaction.occurredAt) : new Date()),
    },
  });

  const categoryId = watch("categoryId");

  // Defaults im Create-Mode setzen, sobald Referenzdaten aus dem Query-Cache da sind.
  useEffect(() => {
    if (mode !== "create") return;
    const acc = accountsQuery.data;
    const cat = categoriesQuery.data;
    if (!acc || !cat) return;

    const defaultAccount = acc[0];
    const defaultCategory = (txType === "income" ? cat.find((c) => c.isIncome) : cat.find((c) => !c.isIncome)) ?? cat[0];

    if (defaultAccount && !watch("accountId")) setValue("accountId", defaultAccount.id);
    if (defaultCategory && !watch("categoryId")) setValue("categoryId", defaultCategory.id);
  }, [mode, txType, accountsQuery.data, categoriesQuery.data, setValue, watch]);

  useEffect(() => {
    if (mode === "edit" && transaction) {
      reset({
        description: transaction.description,
        amount: toDecimalString(fromCents(Math.abs(transaction.amountCents))),
        accountId: transaction.accountId,
        categoryId: transaction.categoryId ?? "",
        occurredAt: toDateInputValue(new Date(transaction.occurredAt)),
      });
      setTxType(transaction.amountCents >= 0 ? "income" : "outcome");
      setTaxRelevant(transaction.taxRelevant ?? false);
      setTaxTouched(false);
      initialCategoryIdRef.current = transaction.categoryId ?? null;
    }
  }, [mode, transaction, reset]);

  // Steuer-Schalter automatisch aktivieren, wenn eine steuerrelevante Kategorie
  // gewählt wird. Setzt nur auf true (nie zurück), respektiert manuelle
  // Übersteuerung und überspringt im Edit-Mode die initiale Kategorie, damit
  // bestehende Transaktionen beim Öffnen nicht stillschweigend umgeflaggt werden.
  useEffect(() => {
    if (taxTouched) return;
    if (!categoryId || categoryId === "__new__") return;
    if (mode === "edit" && categoryId === initialCategoryIdRef.current) return;
    const category = categories.find((c) => c.id === categoryId);
    if (category?.isTaxRelevant) setTaxRelevant(true);
  }, [categoryId, categories, taxTouched, mode]);

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

  // Nach jeder Transaktions-Mutation alle davon abgeleiteten Caches invalidieren
  // (Listen, Analytics, Sparplan-Fortschritt, Steuer-Ansicht, Kategorien-Nutzung).
  function invalidateTransactionData() {
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    void queryClient.invalidateQueries({ queryKey: ["saving-plan"] });
    void queryClient.invalidateQueries({ queryKey: ["tax"] });
    void queryClient.invalidateQueries({ queryKey: ["categories", "byUsage"] });
  }

  async function onSubmit(values: TransactionFormValues) {
    setSubmitError(null);
    setRecurringError(null);
    setAttachmentUploadError(null);

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
    let uploadWarning: string | null = null;
    let queuedOffline = false;
    const endpoint = mode === "edit" && transaction ? `/api/transactions/${transaction.id}` : "/api/transactions";
    const method = mode === "edit" ? "PATCH" : "POST";
    const payload = {
      accountId: values.accountId,
      amountCents: signedCents,
      description: values.description,
      occurredAt: dateInputToISO(
        values.occurredAt,
        mode === "edit" && transaction ? new Date(transaction.occurredAt) : new Date()
      ),
      categoryId: values.categoryId && values.categoryId !== "__new__" ? values.categoryId : undefined,
      savingGoalId: isSavingGoal && selectedSavingGoalId ? selectedSavingGoalId : undefined,
      taxRelevant: isRecurring ? undefined : taxRelevant,
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
          startDate: startDate || undefined,
        });
      } else {
        // Offline-Erfassen (Phase 3a): stabile Client-ID (cuid2) + Idempotency-Key.
        // Ohne Netz wird die Buchung in die Outbox eingereiht und optimistisch
        // angezeigt; bei Netzabbruch mitten im Request dedupliziert der Server
        // über dieselbe mutationId (MutationLog).
        const clientId = mode === "create" ? createId() : undefined;
        const mutationId = mode === "create" ? crypto.randomUUID() : undefined;
        const requestPayload = clientId ? { ...payload, id: clientId } : payload;

        let res: Response | null = null;
        if (mode === "create" && !navigator.onLine) {
          queuedOffline = true;
        } else {
          try {
            res = await fetch(endpoint, {
              method,
              headers: {
                "Content-Type": "application/json",
                ...(mutationId ? { "Idempotency-Key": mutationId } : {}),
              },
              body: JSON.stringify(requestPayload),
            });
          } catch (networkError) {
            if (mode !== "create") throw networkError;
            queuedOffline = true;
          }
        }

        if (queuedOffline && mutationId && clientId) {
          await queueOfflineTransaction(queryClient, mutationId, requestPayload as OfflineTransactionPayload);
          if (pendingFiles.length > 0) {
            // Belege brauchen den Server — offline nicht möglich, später nachreichen.
            setPendingFiles([]);
            uploadWarning = t("transactionForm.attachmentsOfflineSkipped");
            setAttachmentUploadError(uploadWarning);
          }
        } else if (res) {
          if (!res.ok) {
            setSubmitError(t("transactionForm.errorSaveFailed", { status: res.status }));
            return;
          }

          // Im Create-Mode gequeuete Belege nach dem Anlegen hochladen. Schlägt
          // ein Upload fehl, bleibt die Transaktion bestehen — der Nutzer kann
          // den Beleg über "Bearbeiten" nachreichen.
          if (mode === "create" && pendingFiles.length > 0) {
            const created: { id: string } = await res.json();
            const failed: File[] = [];
            for (const file of pendingFiles) {
              try {
                const uploadRes = await uploadAttachment(created.id, file);
                if (!uploadRes.ok) failed.push(file);
              } catch {
                failed.push(file);
              }
            }
            setPendingFiles([]);
            if (failed.length > 0) {
              uploadWarning = t("transactionForm.attachmentsUploadFailedAfterSave", { count: String(failed.length) });
              setAttachmentUploadError(uploadWarning);
            }
          }
        }
      }

      if (queuedOffline) {
        // Kein Invalidate: der Server kennt die Buchung noch nicht — die
        // optimistische Zeile bleibt bis zum Outbox-Flush im Query-Cache.
      } else {
        invalidateTransactionData();
        if (isRecurring) {
          void queryClient.invalidateQueries({ queryKey: ["recurring"] });
        }
      }

      const message = mode === "edit"
        ? t("transactionForm.updated")
        : isRecurring
          ? t("transactionForm.recurringSaved")
          : queuedOffline
            ? t("transactionForm.savedOffline")
            : t("transactionForm.saved");
      onSuccess?.(message, uploadWarning ? { keepOpen: true } : undefined);

      if (mode === "create") {
        reset((current) => ({ ...current, description: "", amount: "", occurredAt: toDateInputValue(new Date()) }));
        setTaxRelevant(false);
        setTaxTouched(false);
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
    startDate?: string | undefined;
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

      // Neue Kategorie sofort im Query-Cache verfügbar machen (sofort wählbar),
      // dann kanonisch nachladen — deckt auch die unsortierte ["categories"]-Liste ab.
      queryClient.setQueryData<CategoryOption[]>(["categories", "byUsage"], (current) => {
        const option: CategoryOption = {
          id: created.id,
          name: created.name,
          isIncome: created.isIncome,
          isTaxRelevant: created.isTaxRelevant
        };
        return current ? [option, ...current] : [option];
      });
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
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

      invalidateTransactionData();
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
            ? "bg-income/15 opacity-100 animate-pulse motion-reduce:animate-none"
            : "bg-expense/15 opacity-100 animate-pulse motion-reduce:animate-none"
        }`}
        style={{ animationDuration: "3.5s" }}
      />
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="relative flex max-h-[calc(100vh-4rem)] w-full flex-col space-y-4 overflow-y-auto rounded-card border border-line bg-surface p-4 text-left shadow-raised sm:p-6"
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
              className="rounded p-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              ×
            </button>
          )}
        </div>

        {mode === "create" && isReceiptScannerEnabled && (
          <Link
            href="/scan"
            onClick={onClose}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2 self-start")}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            {t("transactionForm.scanReceiptCta")}
          </Link>
        )}

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
                ? "text-brand-on focus-visible:ring-income"
                : "text-income focus-visible:ring-income"
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
                className="absolute inset-0 rounded-field bg-income animate-pulse opacity-90 motion-reduce:animate-none"
                style={{ animationDuration: "2.8s" }}
              />
            )}
          </button>
          <button
            type="button"
            className={cn(
              "relative px-3 py-1.5 rounded-md text-sm font-medium focus:outline-none focus-visible:ring focus-visible:ring-offset-2",
              txType === "outcome"
                ? "text-brand-on focus-visible:ring-expense"
                : "text-expense focus-visible:ring-expense"
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
                className="absolute inset-0 rounded-field bg-expense animate-pulse opacity-90 motion-reduce:animate-none"
                style={{ animationDuration: "2.8s" }}
              />
            )}
          </button>
        </div>

        {appConfig.enableAccountSelection && (
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="tx-account">
              {t("transactionForm.accountLabel")} <span className="text-danger">*</span>
            </label>
            <select
              {...register("accountId")}
              id="tx-account"
              aria-invalid={!!errors.accountId}
              className="w-full rounded-field border-line-strong bg-surface text-ink focus:border-brand focus:ring-brand"
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
              <p role="alert" className="mt-1 text-xs text-danger">{errors.accountId.message}</p>
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
                className="w-full rounded-field border-line-strong bg-surface text-ink focus:border-brand focus:ring-brand"
                aria-invalid={!!newCategoryError}
                aria-describedby={newCategoryError ? "tx-category-error" : undefined}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddCategory}
                  loading={newCategoryLoading}
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
                <p id="tx-category-error" role="alert" className="text-sm text-danger">
                  {newCategoryError}
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="tx-description">
            {t("transactionForm.descriptionLabel")} <span className="text-danger">*</span>
          </label>
          <input
            {...register("description")}
            ref={(el) => {
              register("description").ref(el);
              (descriptionRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
            }}
            id="tx-description"
            aria-invalid={!!errors.description}
            className="w-full rounded-field border-line-strong bg-surface text-ink focus:border-brand focus:ring-brand"
          />
          {errors.description && (
            <p role="alert" className="mt-1 text-xs text-danger">{errors.description.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="tx-amount">
            {t("transactionForm.amountLabel")} <span className="text-danger">*</span>
          </label>
          <input
            {...register("amount")}
            id="tx-amount"
            inputMode="decimal"
            placeholder={t("transactionForm.amountPlaceholder")}
            aria-invalid={!!errors.amount}
            aria-describedby="tx-amount-hint"
            className="w-full rounded-field border-line-strong bg-surface text-ink focus:border-brand focus:ring-brand"
          />
          <p id="tx-amount-hint" className="mt-1 text-xs text-ink-muted">
            {t("transactionForm.amountHint")}
          </p>
          {errors.amount && (
            <p role="alert" className="mt-1 text-xs text-danger">{errors.amount.message}</p>
          )}
        </div>

        {!isRecurring && (
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="tx-date">
              {t("transactionForm.dateLabel")} <span className="text-danger">*</span>
            </label>
            <input
              {...register("occurredAt")}
              id="tx-date"
              type="date"
              aria-invalid={!!errors.occurredAt}
              aria-describedby="tx-date-hint"
              className="w-full rounded-field border-line-strong bg-surface text-ink focus:border-brand focus:ring-brand"
            />
            <p id="tx-date-hint" className="mt-1 text-xs text-ink-muted">
              {t("transactionForm.dateHint")}
            </p>
            {errors.occurredAt && (
              <p role="alert" className="mt-1 text-xs text-danger">{errors.occurredAt.message}</p>
            )}
          </div>
        )}

        {!isRecurring && (
          <div className="space-y-3">
            <div className="rounded-field bg-warning-soft px-3 py-2 text-sm text-ink shadow-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {t("transactionForm.taxToggleTitle")}
                    <button
                      type="button"
                      onClick={() => setTaxHintOpen((open) => !open)}
                      aria-expanded={taxHintOpen}
                      aria-controls="tx-tax-hint"
                      aria-label={t("transactionForm.taxHintToggle")}
                      className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-warning text-xs font-semibold text-warning hover:bg-warning-soft focus:outline-none focus-visible:ring focus-visible:ring-warning"
                    >
                      i
                    </button>
                  </p>
                  <p className="text-xs text-ink-muted">
                    {t("transactionForm.taxToggleDescription")}
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={taxRelevant}
                    onChange={(event) => {
                      setTaxRelevant(event.target.checked);
                      setTaxTouched(true);
                    }}
                    aria-checked={taxRelevant}
                  />
                  <span className="h-6 w-11 rounded-full bg-surface-2 transition peer-checked:bg-warning" />
                  <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform peer-checked:translate-x-5" />
                </label>
              </div>
              {taxHintOpen && (
                <p id="tx-tax-hint" className="mt-2 text-xs text-ink-muted">
                  {t("transactionForm.taxHint")}
                </p>
              )}
            </div>
            {taxRelevant && (
              <AttachmentManager
                mode={mode}
                transactionId={transaction?.id}
                pendingFiles={pendingFiles}
                onPendingFilesChange={setPendingFiles}
              />
            )}
          </div>
        )}

        {mode === "create" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-field bg-brand-soft px-3 py-2 text-sm text-ink shadow-card">
              <div>
                <p className="font-medium">{t("transactionForm.recurringToggleTitle")}</p>
                <p className="text-xs text-ink-muted">
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
                <span className="h-6 w-11 rounded-full bg-surface-2 transition peer-checked:bg-brand" />
                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform peer-checked:translate-x-5" />
              </label>
            </div>
            <div className="flex items-center justify-between rounded-field bg-savings-soft px-3 py-2 text-sm text-ink shadow-card">
              <div>
                <p className="font-medium">{t("transactionForm.savingGoalToggleTitle")}</p>
                <p className="text-xs text-ink-muted">
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
                <span className="h-6 w-11 rounded-full bg-surface-2 transition peer-checked:bg-savings" />
                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform peer-checked:translate-x-5" />
              </label>
            </div>
            {isSavingGoal && (
              <div className="space-y-2">
                <label className="block text-sm font-medium" htmlFor="tx-saving-goal">
                  {t("transactionForm.savingGoalLabel")} <span className="text-danger">*</span>
                </label>
                <select
                  id="tx-saving-goal"
                  value={selectedSavingGoalId}
                  onChange={(event) => setSelectedSavingGoalId(event.target.value)}
                  className="w-full rounded-field border-line-strong bg-surface text-ink focus:border-savings focus:ring-savings"
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
                    {t("transactionForm.intervalLabel")} <span className="text-danger">*</span>
                  </label>
                  <input
                    id="tx-interval-months"
                    type="number"
                    min={1}
                    max={24}
                    value={intervalMonths}
                    onChange={(event) => setIntervalMonths(Number(event.target.value))}
                    className="w-full rounded-field border-line-strong bg-surface text-ink focus:border-brand focus:ring-brand"
                    aria-required="true"
                    aria-invalid={!!recurringError}
                    aria-describedby={recurringError ? "tx-recurring-error" : undefined}
                  />
                  <p className="text-xs text-ink-muted">
                    {t("transactionForm.intervalHelper")}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium" htmlFor="tx-day-of-month">
                    {t("transactionForm.dayOfMonthLabel")} <span className="text-danger">*</span>
                  </label>
                  <input
                    id="tx-day-of-month"
                    type="number"
                    min={1}
                    max={31}
                    value={dayOfMonth}
                    onChange={(event) => setDayOfMonth(Number(event.target.value))}
                    className="w-full rounded-field border-line-strong bg-surface text-ink focus:border-brand focus:ring-brand"
                    aria-required="true"
                    aria-invalid={!!recurringError}
                  />
                  <p className="text-xs text-ink-muted">
                    {t("transactionForm.dayOfMonthHelper")}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium" htmlFor="tx-start-date">
                    {t("transactionForm.startDateLabel")}
                  </label>
                  <input
                    id="tx-start-date"
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="w-full rounded-field border-line-strong bg-surface text-ink focus:border-brand focus:ring-brand"
                  />
                  <p className="text-xs text-ink-muted">
                    {t("transactionForm.startDateHelper")}
                  </p>
                </div>
                {recurringError && (
                  <p id="tx-recurring-error" role="alert" className="text-sm text-danger">
                    {recurringError}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" loading={isSubmitting} className="flex-1">
            {submitLabel}
          </Button>
          {onClose && (
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              {t("transactionForm.cancel")}
            </Button>
          )}
        </div>

        {submitError && (
          <p id="form-error" role="alert" className="text-sm text-danger">
            {submitError}
          </p>
        )}

        {attachmentUploadError && (
          <p role="alert" className="text-sm text-warning">
            {attachmentUploadError}
          </p>
        )}

        {mode === "edit" && (
          <div className="border-t border-line pt-4">
            {!deleteConfirm ? (
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirm(true);
                  setDeleteError(null);
                }}
                className="inline-flex items-center gap-2 text-sm font-semibold text-danger hover:opacity-80 focus:outline-none focus-visible:ring focus-visible:ring-danger focus-visible:ring-offset-2"
              >
                {t("transactionForm.deleteAction")}
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-ink-muted">
                  {t("transactionForm.deleteConfirmText")}
                </p>
                {deleteError && (
                  <p role="alert" className="text-sm text-danger">
                    {deleteError}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    onClick={handleDelete}
                    loading={deleteLoading}
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
