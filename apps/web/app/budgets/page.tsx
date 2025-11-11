"use client";

import { parseCents, fromCents, toDecimalString } from "@doewe/shared";
import { useEffect, useState } from "react";

type Budget = {
  id: string;
  accountId: string;
  categoryId?: string | null;
  month: number;
  year: number;
  amountCents: number;
};

export default function BudgetsPage() {
  const now = new Date();
  const [items, setItems] = useState<Budget[]>([]);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState({
    accountId: "",
    categoryId: "",
    month: now.getMonth() + 1 + "",
    year: now.getFullYear() + "",
    amount: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    const res = await fetch("/api/budgets", { cache: "no-store" });
    if (!res.ok) {
      setError(`Failed to load: ${res.status}`);
      setItems([]);
      return;
    }
    const json: Budget[] = await res.json();
    setItems(json);
  }

  useEffect(() => {
    // Load budgets
    refresh();
    // Load accounts and categories
    (async () => {
      const [accRes, catRes] = await Promise.all([
        fetch("/api/accounts", { cache: "no-store" }),
        fetch("/api/categories", { cache: "no-store" })
      ]);
      const [acc, cat]: [Array<{ id: string; name: string }>, Array<{ id: string; name: string }>] =
        await Promise.all([accRes.json(), catRes.json()]);
      setAccounts(acc);
      setCategories(cat);
      const defaultAccount = acc.find((a) => a.id === "acc_demo") ?? acc[0];
      setForm((f) => ({ ...f, accountId: defaultAccount?.id ?? f.accountId }));
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        accountId: form.accountId,
        month: Number(form.month),
        year: Number(form.year),
        amountCents: parseCents(form.amount)
      };
      if (form.categoryId) payload["categoryId"] = form.categoryId;

      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        setError(`Save failed: ${res.status}`);
        return;
      }
      setForm((f) => ({ ...f, amount: "" }));
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main id="maincontent" className="p-6 space-y-8">
      <h1 className="text-xl font-semibold">Budgets</h1>

      <form
        onSubmit={onSubmit}
        className="space-y-4 max-w-sm rounded-md border border-gray-200 dark:border-neutral-700 p-4 bg-white dark:bg-neutral-800"
        aria-describedby={error ? "form-error" : undefined}
      >
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="budget-account">
            Account <span className="text-red-600">*</span>
          </label>
          <select
            id="budget-account"
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
          <label className="block text-sm font-medium mb-1" htmlFor="budget-category">
            Category (optional)
          </label>
          <select
            id="budget-category"
            name="categoryId"
            value={form.categoryId}
            onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="">(none)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="budget-month">
              Month <span className="text-red-600">*</span>
            </label>
            <input
              id="budget-month"
              name="month"
              type="number"
              min={1}
              max={12}
              required
              value={form.month}
              onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}
              className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="budget-year">
              Year <span className="text-red-600">*</span>
            </label>
            <input
              id="budget-year"
              name="year"
              type="number"
              min={1970}
              max={9999}
              required
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
              className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="budget-amount">
            Amount (goal) <span className="text-red-600">*</span>
          </label>
          <input
            id="budget-amount"
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
      </form>

      <section aria-labelledby="budget-list-heading" className="space-y-4">
        <h2 id="budget-list-heading" className="text-lg font-medium">
          List
        </h2>
        <ul className="space-y-2">
          {items.map((b) => (
            <li
              key={b.id}
              className="rounded border border-gray-200 dark:border-neutral-700 p-3 text-sm flex flex-col gap-1"
            >
              <div className="flex justify-between">
                <span className="text-gray-700 dark:text-neutral-200">
                  {b.year}-{String(b.month).padStart(2, "0")}
                </span>
                <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                  {toDecimalString(fromCents(b.amountCents))} €
                </span>
              </div>
              <div className="text-xs text-gray-600 dark:text-neutral-400">
                account: <code className="font-mono">{b.accountId}</code> {b.categoryId ? (
                  <>
                    | category: <code className="font-mono">{b.categoryId}</code>
                  </>
                ) : null}
              </div>
            </li>
          ))}
          {items.length === 0 && (
            <li className="text-sm text-gray-500 dark:text-neutral-400">No budgets yet.</li>
          )}
        </ul>
      </section>
    </main>
  );
}
