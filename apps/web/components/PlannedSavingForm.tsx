"use client";

import { parseCents } from "@doewe/shared";
import { useEffect, useMemo, useRef, useState } from "react";

type Account = {
  id: string;
  name: string;
};

type Props = {
  headingId?: string;
  onClose?: () => void;
  onSuccess?: (message?: string) => void;
};

function nextMonthValue() {
  const today = new Date();
  const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

export default function PlannedSavingForm({ headingId, onClose, onSuccess }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState(() => ({
    title: "",
    amount: "",
    accountId: "",
    targetMonth: nextMonthValue()
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/accounts", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Failed to load accounts (${res.status})`);
        }
        const data: Account[] = await res.json();
        if (!active) return;
        setAccounts(data);
        const defaultAccount = data.find((account) => account.id === "acc_demo") ?? data[0];
        setForm((current) => ({ ...current, accountId: current.accountId || defaultAccount?.id || "" }));
      } catch (fetchError) {
        if (!active) return;
        setError(fetchError instanceof Error ? fetchError.message : "Unable to load accounts.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const dueLabel = useMemo(() => {
    const [year, month] = form.targetMonth.split("-");
    if (!year || !month) return "Planned date";
    const date = new Date(Number(year), Number(month) - 1);
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [form.targetMonth]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInlineSuccess(null);

    const [year, month] = form.targetMonth.split("-");
    if (!year || !month) {
      setError("Please choose a target month.");
      return;
    }

    let amountCents: number;
    try {
      amountCents = parseCents(form.amount);
      if (amountCents <= 0) {
        setError("Amount must be greater than zero.");
        return;
      }
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Invalid amount value.");
      return;
    }

    if (!form.accountId) {
      setError("Select an account for this plan.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        accountId: form.accountId,
        title: form.title,
        targetYear: Number(year),
        targetMonth: Number(month),
        amountCents
      };

      const res = await fetch("/api/saving-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const details = await res.json().catch(() => undefined);
        const message = details?.error ? JSON.stringify(details.error) : `Save failed (${res.status}).`;
        setError(message);
        return;
      }

      const message = "Planned saving added.";
      setInlineSuccess(message);
      setForm((current) => ({ ...current, amount: "" }));
      onSuccess?.(message);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save planned saving.");
    } finally {
      setLoading(false);
    }
  }

  const submitLabel = loading ? "Saving…" : "Save plan";

  return (
    <form
      onSubmit={handleSubmit}
      aria-describedby={error ? "saving-plan-error" : undefined}
      className="relative flex max-h-[calc(100vh-4rem)] w-full flex-col space-y-4 overflow-y-auto rounded-xl border border-white/30 bg-white/95 p-4 text-left shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-neutral-800/95 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={headingId} className="text-lg font-semibold">
            Add planned saving
          </h3>
          <p className="text-xs text-gray-500 dark:text-neutral-400">Set a goal amount and the month you want to reach it.</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
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
          Goal name <span className="text-red-600">*</span>
        </label>
        <input
          ref={titleRef}
          id="saving-plan-title"
          name="title"
          required
          value={form.title}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="saving-plan-account">
          Account <span className="text-red-600">*</span>
        </label>
        <select
          id="saving-plan-account"
          name="accountId"
          required
          value={form.accountId}
          onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))}
          className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="saving-plan-due">
            Target month <span className="text-red-600">*</span>
          </label>
          <input
            id="saving-plan-due"
            name="targetMonth"
            type="month"
            required
            value={form.targetMonth}
            onChange={(event) => setForm((current) => ({ ...current, targetMonth: event.target.value }))}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400" aria-live="polite">
            {dueLabel}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="saving-plan-amount">
            Amount <span className="text-red-600">*</span>
          </label>
          <input
            id="saving-plan-amount"
            name="amount"
            inputMode="decimal"
            required
            value={form.amount}
            onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
            className="w-full rounded-md border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
            aria-invalid={!!error && form.amount.trim() === ""}
            placeholder="e.g. 600"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900"
        >
          {submitLabel}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800 dark:focus-visible:ring-offset-neutral-900"
          >
            Cancel
          </button>
        )}
      </div>

      {error && (
        <p id="saving-plan-error" role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {inlineSuccess && (
        <p role="status" className="text-sm text-emerald-600">
          {inlineSuccess}
        </p>
      )}
    </form>
  );
}
