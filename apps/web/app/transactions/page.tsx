"use client";

import { parseCents, fromCents, toDecimalString } from "@doewe/shared";
import { useEffect, useState } from "react";

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
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const [acc, cat]: [Array<{ id: string; name: string }>, Array<{ id: string; name: string }>] = await Promise.all([
        accRes.json(),
        catRes.json()
      ]);
      setAccounts(acc);
      setCategories(cat);
      // Default values if empty
      const defaultAccount = acc.find((a) => a.id === "acc_demo") ?? acc[0];
      const defaultCategory = cat[0];
      setForm((f) => ({
        ...f,
        accountId: defaultAccount?.id ?? "",
        categoryId: defaultCategory?.id ?? ""
      }));
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        accountId: form.accountId,
        amountCents: parseCents(form.amount),
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
        className="space-y-4 max-w-sm rounded-md border border-gray-200 dark:border-neutral-700 p-4 bg-white dark:bg-neutral-800"
        aria-describedby={error ? "form-error" : undefined}
      >
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
            {categories.map((c) => (
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
      </form>

      <section aria-labelledby="tx-list-heading" className="space-y-4">
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
