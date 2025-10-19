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
  const [form, setForm] = useState({ description: "", amount: "" });
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
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = {
        accountId: "acc_demo",
        amountCents: parseCents(form.amount), // e.g. "12.34" -> 1234
        description: form.description,
        occurredAt: new Date().toISOString()
      };

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const msg = `Save failed: ${res.status}`;
        setError(msg);
        return;
      }

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
        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </form>

      <section>
        <h2>List</h2>
        <ul>
          {items.map((t) => (
            <li key={t.id}>
              <code>{t.id}</code> — {t.description} — cents: {t.amountCents} — EUR:{" "}
              {toDecimalString(fromCents(t.amountCents))} — {new Date(t.occurredAt).toLocaleString()}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
