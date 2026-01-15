"use client";

import { fromCents, parseCents, toDecimalString } from "@doewe/shared";
import { useEffect, useMemo, useRef, useState } from "react";

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
  onDelete
}: Props) {
  const [form, setForm] = useState(() => ({
    description: transaction?.description ?? "",
    amount: transaction ? toDecimalString(fromCents(Math.abs(transaction.amountCents))) : "",
    accountId: transaction?.accountId ?? "",
    categoryId: transaction?.categoryId ?? ""
  }));

  const [txType, setTxType] = useState<"income" | "outcome">(
    transaction ? (transaction.amountCents >= 0 ? "income" : "outcome") : "outcome"
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
          throw new Error("Unable to load reference data.");
        }

        const [acc, cat]: [Array<{ id: string; name: string }>, Array<{ id: string; name: string; isIncome: boolean }>]
          = await Promise.all([accRes.json(), catRes.json()]);

        if (!active) return;

        setAccounts(acc);
        setCategories(cat);

        if (mode === "create") {
          const defaultAccount = acc[0];
          const defaultCategory = (txType === "income" ? cat.find((c) => c.isIncome) : cat.find((c) => !c.isIncome)) ?? cat[0];

          setForm((current) => ({
            ...current,
            accountId: current.accountId || (defaultAccount?.id ?? ""),
            categoryId: current.categoryId || (defaultCategory?.id ?? "")
          }));
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load reference data.");
      }
    })();

    return () => {
      active = false;
    };
  }, [mode, txType]);

  useEffect(() => {
    if (mode === "edit" && transaction) {
      setForm({
        description: transaction.description,
        amount: toDecimalString(fromCents(Math.abs(transaction.amountCents))),
        accountId: transaction.accountId,
        categoryId: transaction.categoryId ?? ""
      });
      setTxType(transaction.amountCents >= 0 ? "income" : "outcome");
    }
  }, [mode, transaction]);

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
    if (form.categoryId === "" || categories.length === 0) {
      return;
    }

    setForm((current) => {
      if (current.categoryId === "") {
        return current;
      }

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
      setError(parseError instanceof Error ? parseError.message : "Invalid amount entered.");
      return;
    }

    setLoading(true);

    const signedCents = txType === "income" ? Math.abs(rawCents) : -Math.abs(rawCents);
    const endpoint = mode === "edit" && transaction ? `/api/transactions/${transaction.id}` : "/api/transactions";
    const method = mode === "edit" ? "PATCH" : "POST";
    const payload = {
      accountId: form.accountId,
      amountCents: signedCents,
      description: form.description,
      occurredAt: mode === "edit" && transaction ? transaction.occurredAt : new Date().toISOString(),
      categoryId: form.categoryId || undefined
    };

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        setError(`Save failed: ${res.status}`);
        return;
      }

      const message = mode === "edit" ? "Transaction updated." : "Transaction saved.";
      setInlineSuccess(message);
      onSuccess?.(message);

      if (mode === "create") {
        setForm((current) => ({ ...current, description: "", amount: "" }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save transaction.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!transaction) return;
    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        setDeleteError(`Delete failed: ${res.status}`);
        setDeleteLoading(false);
        return;
      }

      const message = "Transaction deleted.";
      onDelete?.(message);
      onClose?.();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete transaction.");
    } finally {
      setDeleteLoading(false);
    }
  }

  const submitLabel = loading ? "Saving…" : mode === "edit" ? "Save" : "Add";

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
        onSubmit={handleSubmit}
        className="relative flex max-h-[calc(100vh-4rem)] w-full flex-col space-y-4 overflow-y-auto rounded-xl border border-white/40 bg-white/95 p-4 text-left shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-neutral-800/95 sm:p-6"
        aria-describedby={error ? "form-error" : undefined}
      >
        <div className="flex items-center justify-between">
          <h3 id={headingId} className="text-base font-semibold">
            {mode === "edit" ? "Edit transaction" : "Add transaction"}
          </h3>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"
            >
              ×
            </button>
          )}
        </div>

        <div className="flex items-center justify-center gap-2" role="group" aria-label="Transaction type">
          <button
            type="button"
            className={`relative px-3 py-1.5 rounded-md text-sm font-medium focus:outline-none focus-visible:ring focus-visible:ring-offset-2 ${
              txType === "income"
                ? "text-white focus-visible:ring-green-500"
                : "text-green-700 dark:text-green-300 focus-visible:ring-green-500"
            }`}
            aria-pressed={txType === "income"}
            onClick={() => {
              setTxType("income");
              const first = categories.find((c) => c.isIncome);
              setForm((current) => ({ ...current, categoryId: first?.id ?? current.categoryId }));
            }}
          >
            <span className="relative z-10">Income</span>
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
            onClick={() => {
              setTxType("outcome");
              const first = categories.find((c) => !c.isIncome);
              setForm((current) => ({ ...current, categoryId: first?.id ?? current.categoryId }));
            }}
          >
            <span className="relative z-10">Outcome</span>
            {txType === "outcome" && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-md bg-gradient-to-r from-red-500 via-rose-500 to-red-400 animate-pulse opacity-80"
                style={{ animationDuration: "2.8s" }}
              />
            )}
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="tx-account">
            Account <span className="text-red-600">*</span>
          </label>
          <select
            id="tx-account"
            name="accountId"
            required
            value={form.accountId}
            onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
            aria-invalid={!!error && !form.accountId}
          >
            <option value="" disabled>
              Select account
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="tx-category">
            Category
          </label>
          <select
            id="tx-category"
            name="categoryId"
            value={form.categoryId}
            onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="">(none)</option>
            {filteredCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="tx-description">
            Description <span className="text-red-600">*</span>
          </label>
          <input
            id="tx-description"
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
          <label className="block text-sm font-medium mb-1" htmlFor="tx-amount">
            Amount (e.g. 12.34) <span className="text-red-600">*</span>
          </label>
          <input
            id="tx-amount"
            name="amount"
            inputMode="decimal"
            required
            value={form.amount}
            onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
            aria-invalid={!!error && form.amount.trim() === ""}
          />
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
              Cancel
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
                Delete transaction
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-700 dark:text-neutral-300">
                  This action cannot be undone. Are you sure you want to delete this transaction?
                </p>
                {deleteError && (
                  <p role="alert" className="text-sm text-red-600">
                    {deleteError}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleteLoading}
                    className="inline-flex flex-1 items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50 focus:outline-none focus-visible:ring focus-visible:ring-red-500 focus-visible:ring-offset-2"
                  >
                    {deleteLoading ? "Deleting…" : "Delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteConfirm(false);
                      setDeleteError(null);
                    }}
                    className="inline-flex flex-1 items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring focus-visible:ring-offset-2 focus-visible:ring-gray-400 dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800"
                  >
                    Cancel delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
