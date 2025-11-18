"use client";

import { fromCents, toDecimalString } from "@doewe/shared";
import { useEffect, useRef, useState } from "react";

import TransactionForm from "../../components/TransactionForm";

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
  const [editingTx, setEditingTx] = useState<Tx | null>(null);
  const editDialogRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const feedbackDismissRef = useRef<HTMLButtonElement | null>(null);
  const [categoriesById, setCategoriesById] = useState<Record<string, string>>({});

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

  const closeEditDialog = () => {
    setEditingTx(null);
    window.setTimeout(() => {
      lastFocusedRef.current?.focus();
    }, 0);
  };

  useEffect(() => {
    if (!editingTx) {
      return;
    }

    const node = editDialogRef.current;
    node?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeEditDialog();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [editingTx]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (editingTx) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
    document.body.style.overflow = previousOverflow;
  }, [editingTx]);

  const showFeedback = (message: string, variant: "success" | "error" = "success") => {
    setFeedback({ message, variant });
  };

  const handleEditSuccess = async (message?: string) => {
    await refresh();
    closeEditDialog();
    showFeedback(message ?? "Transaction updated.");
  };

  const handleDeleteSuccess = async (message?: string) => {
    await refresh();
    closeEditDialog();
    showFeedback(message ?? "Transaction deleted.");
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/categories", { cache: "no-store" });
        if (!res.ok) return;
        const data: Array<{ id: string; name: string }> = await res.json();
        setCategoriesById(Object.fromEntries(data.map(({ id, name }) => [id, name])));
      } catch {
        // ignore fetch errors for categories
      }
    })();
  }, []);

  const dialogTitleId = editingTx ? `edit-transaction-${editingTx.id}` : undefined;

  useEffect(() => {
    if (feedback) {
      feedbackDismissRef.current?.focus({ preventScroll: true });
    }
  }, [feedback]);

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
              className="rounded-lg border border-gray-200 bg-white/90 p-4 text-sm shadow-sm transition hover:border-indigo-200 focus-within:border-indigo-300 dark:border-neutral-700 dark:bg-neutral-900/90"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <p className="text-base font-medium text-gray-900 dark:text-neutral-100">
                    {t.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-neutral-400">
                    <time dateTime={t.occurredAt}>
                      {new Date(t.occurredAt).toLocaleString()}
                    </time>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
                      Account: {t.accountId}
                    </span>
                    {t.categoryId && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
                        Category: {categoriesById[t.categoryId] ?? t.categoryId}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-start">
                  <span
                    className={`text-base font-semibold ${
                      t.amountCents < 0 ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {toDecimalString(fromCents(t.amountCents))} €
                  </span>
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full text-2xl text-indigo-500 transition hover:text-indigo-600 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-indigo-300 dark:hover:text-indigo-200 dark:focus-visible:ring-offset-neutral-900"
                    onClick={(event) => {
                      lastFocusedRef.current = event.currentTarget;
                      setEditingTx(t);
                    }}
                    aria-label={`Manage transaction ${t.description || "without description"}`}
                  >
                    <span aria-hidden="true" className="leading-none">
                      ⚙
                    </span>
                  </button>
                </div>
              </div>
            </li>
          ))}
          {items.length === 0 && (
            <li className="text-sm text-gray-500 dark:text-neutral-400">No transactions yet.</li>
          )}
        </ul>
      </section>

      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={closeEditDialog} />
          <div
            ref={editDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="relative z-10 mx-4 flex w-full max-w-2xl justify-center focus:outline-none"
            tabIndex={-1}
          >
            <TransactionForm
              mode="edit"
              transaction={editingTx}
              headingId={dialogTitleId}
              onSuccess={handleEditSuccess}
              onDelete={handleDeleteSuccess}
              onClose={closeEditDialog}
            />
          </div>
        </div>
      )}

      {feedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="presentation">
          <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
          <div
            role="alertdialog"
            aria-live="assertive"
            aria-modal="true"
            aria-labelledby="feedback-title"
            className="relative z-10 w-full max-w-xs rounded-lg border border-indigo-200 bg-white p-4 text-sm shadow-lg focus:outline-none dark:border-indigo-500/40 dark:bg-neutral-900"
          >
            <h3 id="feedback-title" className="text-base font-semibold text-gray-900 dark:text-neutral-100">
              {feedback.variant === "success" ? "Success" : "Notice"}
            </h3>
            <p className="mt-2 text-sm text-gray-700 dark:text-neutral-300">{feedback.message}</p>
            <div className="mt-4 flex justify-end">
              <button
                ref={feedbackDismissRef}
                type="button"
                onClick={() => setFeedback(null)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
