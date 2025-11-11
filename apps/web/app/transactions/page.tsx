"use client";

import { fromCents, toDecimalString } from "@doewe/shared";
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
  }, []);

  return (
    <main id="maincontent" className="p-6 space-y-8">
      <h1 className="text-xl font-semibold">Transactions</h1>
      <section aria-labelledby="tx-list-heading" className="space-y-4 max-w-2xl mx-auto">
        <h2 id="tx-list-heading" className="text-lg font-medium">
          List
        </h2>
        {error && (
          <p id="form-error" role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
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
