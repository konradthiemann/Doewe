"use client";

import { useEffect, useState } from "react";

type Tx = {
  id: string;
  accountId: string;
  amount: number;
  description: string;
  occurredAt: string;
  categoryId?: string;
};

export default function TransactionsPage() {
  const [items, setItems] = useState<Tx[]>([]);
  const [form, setForm] = useState({ description: "", amount: "" });
  const [loading, setLoading] = useState(false);

  async function refresh() {
    const res = await fetch("/api/transactions", { cache: "no-store" });
    const json = await res.json();
    setItems(json.data ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: form.description, amount: form.amount })
      });
      setForm({ description: "", amount: "" });
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, display: "grid", gap: 16 }}>
      <h1>Transactions</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
        <label>
          Description
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            required
          />
        </label>
        <label>
          Amount (e.g. 12.34 or -5.05)
          <input
            type="text"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            required
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Add"}
        </button>
      </form>

      <section>
        <h2>List</h2>
        <ul>
          {items.map((t) => (
            <li key={t.id}>
              <code>{t.id}</code> — {t.description} — cents: {t.amount} — {new Date(t.occurredAt).toLocaleString()}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
