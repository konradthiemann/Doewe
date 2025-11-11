"use client";

import { parseCents } from "@doewe/shared";
import { useEffect, useMemo, useState } from "react";

type Props = {
  onSuccess?: () => void;
  onClose?: () => void;
};

export default function TransactionForm({ onSuccess, onClose }: Props) {
  const [form, setForm] = useState({ description: "", amount: "", accountId: "", categoryId: "" });
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; isIncome: boolean }>>([]);
  const [txType, setTxType] = useState<"income" | "outcome">("outcome");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      const [accRes, catRes] = await Promise.all([
        fetch("/api/accounts", { cache: "no-store" }),
        fetch("/api/categories", { cache: "no-store" })
      ]);
      const [acc, cat]: [Array<{ id: string; name: string }>, Array<{ id: string; name: string; isIncome: boolean }>] = await Promise.all([
        accRes.json(),
        catRes.json()
      ]);
      setAccounts(acc);
      setCategories(cat);
      const defaultAccount = acc.find((a) => a.id === "acc_demo") ?? acc[0];
      const defaultCategory = cat.find((c) => !c.isIncome) ?? cat[0];
      setForm((f) => ({ ...f, accountId: defaultAccount?.id ?? "", categoryId: defaultCategory?.id ?? "" }));
    })();
  }, []);

  const filteredCategories = useMemo(() => {
    return categories.filter((c) => (txType === "income" ? c.isIncome : !c.isIncome));
  }, [categories, txType]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const rawCents = parseCents(form.amount);
      const signedCents = txType === "income" ? Math.abs(rawCents) : -Math.abs(rawCents);

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: form.accountId,
          amountCents: signedCents,
          description: form.description,
          occurredAt: new Date().toISOString(),
          categoryId: form.categoryId || undefined
        })
      });

      if (!res.ok) {
        setError(`Save failed: ${res.status}`);
        return;
      }
      setSuccess("Transaction saved.");
      setShowSuccess(true);
      onSuccess?.();
      window.setTimeout(() => setShowSuccess(false), 2200);
      window.setTimeout(() => setSuccess(null), 2800);
      setForm((f) => ({ ...f, description: "", amount: "" }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative max-w-sm mx-auto">
      {/* Shimmery glow border depending on type */}
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
        onSubmit={onSubmit}
        className="relative space-y-4 rounded-xl border border-white/40 dark:border-white/10 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm shadow-lg p-4"
        aria-describedby={error ? "form-error" : undefined}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Add transaction</h3>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10">
              ✕
            </button>
          )}
        </div>
        {/* Toggle */}
        <div className="flex items-center justify-center gap-2" role="group" aria-label="Transaction type">
          <button
            type="button"
            className={`relative px-3 py-1.5 rounded-md text-sm font-medium focus:outline-none focus-visible:ring focus-visible:ring-offset-2 ${
              txType === "income" ? "text-white focus-visible:ring-green-500" : "text-green-700 dark:text-green-300 focus-visible:ring-green-500"
            }`}
            aria-pressed={txType === "income"}
            onClick={() => {
              setTxType("income");
              const first = categories.find((c) => c.isIncome);
              setForm((f) => ({ ...f, categoryId: first?.id ?? f.categoryId }));
            }}
          >
            <span className="relative z-10">Income</span>
            {txType === "income" && (
              <span aria-hidden className="absolute inset-0 rounded-md bg-gradient-to-r from-green-500 via-emerald-500 to-green-400 animate-pulse opacity-80" style={{ animationDuration: "2.8s" }} />
            )}
          </button>
          <button
            type="button"
            className={`relative px-3 py-1.5 rounded-md text-sm font-medium focus:outline-none focus-visible:ring focus-visible:ring-offset-2 ${
              txType === "outcome" ? "text-white focus-visible:ring-red-500" : "text-red-700 dark:text-red-300 focus-visible:ring-red-500"
            }`}
            aria-pressed={txType === "outcome"}
            onClick={() => {
              setTxType("outcome");
              const first = categories.find((c) => !c.isIncome);
              setForm((f) => ({ ...f, categoryId: first?.id ?? f.categoryId }));
            }}
          >
            <span className="relative z-10">Outcome</span>
            {txType === "outcome" && (
              <span aria-hidden className="absolute inset-0 rounded-md bg-gradient-to-r from-red-500 via-rose-500 to-red-400 animate-pulse opacity-80" style={{ animationDuration: "2.8s" }} />
            )}
          </button>
        </div>

        {/* Account */}
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="tx-account">
            Account <span className="text-red-600">*</span>
          </label>
          <select
            id="tx-account"
            name="accountId"
            required
            value={form.accountId}
            onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
            aria-invalid={!!error && !form.accountId}
          >
            <option value="" disabled>
              Select account
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="tx-category">
            Category
          </label>
          <select
            id="tx-category"
            name="categoryId"
            value={form.categoryId}
            onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="">(none)</option>
            {filteredCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="tx-description">
            Description <span className="text-red-600">*</span>
          </label>
          <input
            id="tx-description"
            name="description"
            required
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
            aria-invalid={!!error && form.description.trim() === ""}
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="tx-amount">
            Amount (e.g. 12.34) <span className="text-red-600">*</span>
          </label>
          <input
            id="tx-amount"
            name="amount"
            required
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
            aria-invalid={!!error && form.amount.trim() === ""}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            {loading ? "Saving…" : "Add"}
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className="text-sm px-3 py-2 rounded-md border border-gray-300 dark:border-neutral-600">
              Cancel
            </button>
          )}
        </div>

        {error && (
          <p id="form-error" role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {/* Floating success */}
        {success && (
          <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
            <div
              role="status"
              aria-live="polite"
              className={`pointer-events-auto rounded-md px-4 py-2 shadow-lg text-sm font-medium border 
                bg-white/95 dark:bg-neutral-800/95 border-green-200 dark:border-green-800 
                text-green-800 dark:text-green-200 transform-gpu transition-all duration-500 ease-out 
                ${showSuccess ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}`}
            >
              {success}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
