"use client";

import { parseCents, fromCents, toDecimalString } from "@doewe/shared";
import { useEffect, useMemo, useState } from "react";

type Tx = {
  id: string;
  accountId: string;
  amountCents: number;
  description: string;
  occurredAt: string;
  categoryId?: string | null;
};

export default function TransactionsPage() {
  const [items, setItems] = useState<Tx[]>([]);
  const [form, setForm] = useState({ description: "", amount: "", accountId: "", categoryId: "" });
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; isIncome: boolean }>>([]);
  const [txType, setTxType] = useState<"income" | "outcome">("outcome");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    const res = await fetch("/api/transactions", { cache: "no-store" });
    if (!res.ok) {
      setError(`Failed to load: ${res.status}`);
      setItems([]);
      return;
    }
    const json: Tx[] = await res.json();
    setItems(json);
  }

  useEffect(() => {
    refresh();
    // Load accounts and categories for selects
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
      // Default values if empty
      const defaultAccount = acc.find((a) => a.id === "acc_demo") ?? acc[0];
      // Default category depends on selected type (initialized to outcome)
      const defaultCategory = (cat.find((c) => !c.isIncome) ?? cat[0]);
      setForm((f) => ({
        ...f,
        accountId: defaultAccount?.id ?? "",
        categoryId: defaultCategory?.id ?? ""
      }));
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
      // Enforce sign based on toggle: income positive, outcome negative
      const rawCents = parseCents(form.amount);
      const signedCents = txType === "income" ? Math.abs(rawCents) : -Math.abs(rawCents);
      const payload: Record<string, unknown> = {
        accountId: form.accountId,
        amountCents: signedCents,
        description: form.description,
        occurredAt: new Date().toISOString()
      };
      if (form.categoryId) payload["categoryId"] = form.categoryId;

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        setError(`Save failed: ${res.status}`);
        return;
      }
      setSuccess("Transaction saved.");
      setForm({ description: "", amount: "", accountId: form.accountId, categoryId: form.categoryId });
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main id="maincontent" className="p-6 space-y-8">
      <h1 className="text-xl font-semibold">Transactions</h1>

      <form
        onSubmit={onSubmit}
        className="space-y-4 max-w-sm mx-auto rounded-md border border-gray-200 dark:border-neutral-700 p-4 bg-white dark:bg-neutral-800"
        aria-describedby={error ? "form-error" : undefined}
      >
        {/* Income/Outcome Toggle */}
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
              // If current category is outcome-only, swap to first income one
              const first = categories.find((c) => c.isIncome);
              setForm((f) => ({ ...f, categoryId: first?.id ?? f.categoryId }));
            }}
          >
            <span className="relative z-10">Income</span>
            {txType === "income" && (
              <span aria-hidden className="absolute inset-0 rounded-md bg-gradient-to-r from-green-500 via-emerald-500 to-green-400 animate-pulse opacity-90" />
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
              // If current category is income-only, swap to first outcome one
              const first = categories.find((c) => !c.isIncome);
              setForm((f) => ({ ...f, categoryId: first?.id ?? f.categoryId }));
            }}
          >
            <span className="relative z-10">Outcome</span>
            {txType === "outcome" && (
              <span aria-hidden className="absolute inset-0 rounded-md bg-gradient-to-r from-red-500 via-rose-500 to-red-400 animate-pulse opacity-90" />
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

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="tx-amount">
            Amount (e.g. 12.34 or -5.05) <span className="text-red-600">*</span>
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

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          {loading ? "Saving…" : "Add"}
        </button>

        {error && (
          <p id="form-error" role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {success && !error && (
          <p role="status" className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
            {success}
          </p>
        )}
      </form>

      <section aria-labelledby="tx-list-heading" className="space-y-4 max-w-2xl mx-auto">
        <h2 id="tx-list-heading" className="text-lg font-medium">
          List
        </h2>
        <ul className="space-y-2">
          {items.map((t) => (
            <li
              key={t.id}
              className="rounded border border-gray-200 dark:border-neutral-700 p-3 text-sm flex flex-col gap-1"
            >
              <div className="flex justify-between">
                <span className="font-mono text-xs text-gray-600 dark:text-neutral-400">{t.id}</span>
                <span
                  className={
                    "font-semibold " +
                    (t.amountCents < 0 ? "text-red-600" : "text-green-600")
                  }
                >
                  {toDecimalString(fromCents(t.amountCents))} €
                </span>
              </div>
              <p className="text-gray-800 dark:text-neutral-200">{t.description}</p>
              <time
                dateTime={t.occurredAt}
                className="text-xs text-gray-500 dark:text-neutral-400"
              >
                {new Date(t.occurredAt).toLocaleString()}
              </time>
            </li>
          ))}
          {items.length === 0 && (
            <li className="text-sm text-gray-500 dark:text-neutral-400">No transactions yet.</li>
          )}
        </ul>
      </section>
    </main>
  );
}
