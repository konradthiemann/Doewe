"use client";

import { fromCents, toDecimalString } from "@doewe/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import RecurringTransactionForm from "../../components/RecurringTransactionForm";
import TransactionForm from "../../components/TransactionForm";
import { useI18n } from "../../lib/i18n";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";

type Tx = {
  id: string;
  accountId: string;
  amountCents: number;
  description: string;
  occurredAt: string;
  categoryId?: string | null;
};

type RecurringTx = {
  id: string;
  accountId: string;
  amountCents: number;
  description: string;
  categoryId?: string | null;
  frequency: string;
  intervalMonths?: number | null;
  nextOccurrence: string;
};

type RecurringSkip = {
  recurringId: string;
  year: number;
  month: number;
};

type ActiveTab = "transactions" | "recurring";

function TransactionsPage() {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<Tx[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingTx, setEditingTx] = useState<Tx | null>(null);
  const [recurringItems, setRecurringItems] = useState<RecurringTx[]>([]);
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<RecurringTx | null>(null);
  const editDialogRef = useRef<HTMLDivElement>(null);
  const createDialogRef = useRef<HTMLDivElement>(null);
  const recurringDialogRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const feedbackDismissRef = useRef<HTMLButtonElement | null>(null);
  const [categoriesById, setCategoriesById] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("transactions");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [skipsCurrent, setSkipsCurrent] = useState<Set<string>>(new Set());
  const [skipsNext, setSkipsNext] = useState<Set<string>>(new Set());
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";

  const tabs: Array<{ id: ActiveTab; label: string }> = useMemo(() => (
    [
      { id: "transactions", label: t("transactions.tabTransactions") },
      { id: "recurring", label: t("transactions.tabRecurring") }
    ]
  ), [t]);

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    const nextIndex = event.key === "ArrowRight"
      ? (currentIndex + 1) % tabs.length
      : (currentIndex - 1 + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  };

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/transactions", { cache: "no-store" });
    if (!res.ok) {
      setError(t("errors.failedLoad", { status: res.status }));
      setItems([]);
      return;
    }
    const json: Tx[] = await res.json();
    setItems(json);
  }, [t]);

  const refreshRecurring = useCallback(async () => {
    setRecurringError(null);
    const res = await fetch("/api/recurring-transactions", { cache: "no-store" });
    if (!res.ok) {
      setRecurringError(t("errors.failedLoadRecurring", { status: res.status }));
      setRecurringItems([]);
      return;
    }
    const json: RecurringTx[] = await res.json();
    setRecurringItems(json);
  }, [t]);

  const now = useMemo(() => new Date(), []);
  const currentYear = useMemo(() => now.getFullYear(), [now]);
  const currentMonth = useMemo(() => now.getMonth() + 1, [now]);
  const nextDate = useMemo(() => new Date(currentYear, currentMonth, 1), [currentYear, currentMonth]);
  const nextYear = useMemo(() => nextDate.getFullYear(), [nextDate]);
  const nextMonth = useMemo(() => nextDate.getMonth() + 1, [nextDate]);

  const monthIndex = useCallback((year: number, month: number) => year * 12 + (month - 1), []);

  const occursInMonth = useCallback((recurring: RecurringTx, year: number, month: number) => {
    const base = new Date(recurring.nextOccurrence);
    const baseIndex = monthIndex(base.getFullYear(), base.getMonth() + 1);
    const targetIndex = monthIndex(year, month);
    const interval = recurring.intervalMonths ?? 1;
    const diff = targetIndex - baseIndex;
    return diff >= 0 && diff % interval === 0;
  }, [monthIndex]);

  const closeEditDialog = useCallback(() => {
    setEditingTx(null);
    window.setTimeout(() => {
      lastFocusedRef.current?.focus();
    }, 0);
  }, []);

  const closeCreateDialog = useCallback(() => {
    setCreating(false);
    router.replace("/transactions", { scroll: false });
    window.setTimeout(() => {
      searchInputRef.current?.focus({ preventScroll: true });
    }, 0);
  }, [router]);

  const closeRecurringDialog = useCallback(() => {
    setEditingRecurring(null);
    window.setTimeout(() => {
      lastFocusedRef.current?.focus();
    }, 0);
  }, []);

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
  }, [closeEditDialog, editingTx]);

  useEffect(() => {
    if (!editingRecurring) {
      return;
    }

    const node = recurringDialogRef.current;
    node?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRecurringDialog();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeRecurringDialog, editingRecurring]);

  useEffect(() => {
    if (!creating) {
      return;
    }

    const node = createDialogRef.current;
    node?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCreateDialog();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeCreateDialog, creating]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (editingTx || creating || editingRecurring) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
    document.body.style.overflow = previousOverflow;
  }, [editingTx, creating, editingRecurring]);

  const showFeedback = (message: string, variant: "success" | "error" = "success") => {
    setFeedback({ message, variant });
  };

  const handleEditSuccess = async (message?: string) => {
    await refresh();
    closeEditDialog();
      showFeedback(message ?? t("transactionForm.updated"));
  };

  const handleDeleteSuccess = async (message?: string) => {
    await refresh();
    closeEditDialog();
      showFeedback(message ?? t("transactionForm.deleted"));
  };

  const handleRecurringEditSuccess = async (message?: string) => {
    await refreshRecurring();
    closeRecurringDialog();
    showFeedback(message ?? t("recurringForm.updated"));
  };

  const handleRecurringDeleteSuccess = async (message?: string) => {
    await refreshRecurring();
    closeRecurringDialog();
    showFeedback(message ?? t("recurringForm.deleted"));
  };

  const handleCreateSuccess = async (message?: string) => {
    await refresh();
    await refreshRecurring();
    closeCreateDialog();
    showFeedback(message ?? t("transactionForm.saved"));
  };

  async function loadSkips(year: number, month: number, setter: (value: Set<string>) => void) {
    const res = await fetch(`/api/recurring-transactions/skips?year=${year}&month=${month}`, { cache: "no-store" });
    if (!res.ok) {
      return;
    }
    const json: RecurringSkip[] = await res.json();
    setter(new Set(json.map((skip) => skip.recurringId)));
  }

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    refreshRecurring();
    loadSkips(currentYear, currentMonth, setSkipsCurrent);
    loadSkips(nextYear, nextMonth, setSkipsNext);
  }, [currentMonth, currentYear, nextMonth, nextYear, refreshRecurring]);

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
  const createDialogTitleId = creating ? "create-transaction" : undefined;

  useEffect(() => {
    if (feedback) {
      feedbackDismissRef.current?.focus({ preventScroll: true });
    }
  }, [feedback]);

  useEffect(() => {
    const shouldCreate = searchParams.get("new") === "1";
    if (shouldCreate) {
      setCreating(true);
    } else {
      setCreating(false);
    }
  }, [searchParams]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((t) => {
      const description = t.description?.toLowerCase?.() ?? "";
      const account = t.accountId?.toLowerCase?.() ?? "";
      const categoryName = t.categoryId ? (categoriesById[t.categoryId]?.toLowerCase?.() ?? "") : "";
      const amount = toDecimalString(fromCents(t.amountCents)).toLowerCase();
      const occurred = new Date(t.occurredAt).toLocaleString(dateLocale).toLowerCase();

      return [description, account, categoryName, amount, occurred].some((value) => value.includes(normalizedQuery));
    });
  }, [categoriesById, dateLocale, items, normalizedQuery]);

  const currentRecurring = useMemo(() => {
    return recurringItems.filter((rec) => {
      if (!occursInMonth(rec, currentYear, currentMonth)) return false;
      return !skipsCurrent.has(rec.id);
    });
  }, [currentMonth, currentYear, occursInMonth, recurringItems, skipsCurrent]);

  const nextRecurring = useMemo(() => {
    return recurringItems.filter((rec) => occursInMonth(rec, nextYear, nextMonth));
  }, [nextMonth, nextYear, occursInMonth, recurringItems]);

  const currentRecurringTotalCents = useMemo(() => {
    return currentRecurring.reduce((total, rec) => total + rec.amountCents, 0);
  }, [currentRecurring]);

  const toggleSkip = async (recurringId: string, shouldRun: boolean) => {
    const payload = { recurringId, year: nextYear, month: nextMonth };
    if (!shouldRun) {
      setSkipsNext((current) => new Set(current).add(recurringId));
      const res = await fetch("/api/recurring-transactions/skips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        setRecurringError(t("errors.failedSkip", { status: res.status }));
        setSkipsNext((current) => {
          const next = new Set(current);
          next.delete(recurringId);
          return next;
        });
      }
      return;
    }

    setSkipsNext((current) => {
      const next = new Set(current);
      next.delete(recurringId);
      return next;
    });
    const res = await fetch("/api/recurring-transactions/skips", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      setRecurringError(t("errors.failedUnskip", { status: res.status }));
      setSkipsNext((current) => new Set(current).add(recurringId));
    }
  };

  return (
    <main id="maincontent" className="p-6 space-y-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold">{t("transactions.title")}</h1>
          {activeTab === "transactions" && (
            <form
              role="search"
              className="w-full sm:w-72"
              onSubmit={(event) => {
                event.preventDefault();
                searchInputRef.current?.blur();
              }}
            >
              <label htmlFor="transaction-search" className="sr-only">
                {t("transactions.searchLabel")}
              </label>
              <div className="relative">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400 dark:text-neutral-500"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M9 14.25a5.25 5.25 0 1 0 0-10.5 5.25 5.25 0 0 0 0 10.5Zm6 1.5-2.9-2.9"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <input
                  ref={searchInputRef}
                  id="transaction-search"
                  type="search"
                  inputMode="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("transactions.searchPlaceholder")}
                  className="w-full rounded-full border border-gray-300 bg-white/90 px-10 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-neutral-600 dark:bg-neutral-900/90 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus-visible:ring-offset-neutral-900"
                />
              </div>
            </form>
          )}
        </div>
        <div role="tablist" aria-label={t("transactions.tabsLabel")}
             className="flex gap-2" onKeyDown={handleTabKeyDown}>
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tab-panel-${tab.id}`}
              id={`tab-${tab.id}`}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
                activeTab === tab.id
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "transactions" && (
        <section
          className="space-y-4 max-w-2xl mx-auto"
          id="tab-panel-transactions"
          role="tabpanel"
          aria-labelledby="tab-transactions"
          tabIndex={0}
        >
          <h2 id="tx-list-heading" className="sr-only">
            {t("transactions.listHeading")}
          </h2>
          {error && (
            <p id="form-error" role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          {recurringError && (
            <p role="alert" className="text-sm text-red-600">
              {recurringError}
            </p>
          )}

          {currentRecurring.length > 0 && (
            <details className="group rounded-lg border border-indigo-200 bg-indigo-50/70 p-4 text-sm shadow-sm dark:border-indigo-500/40 dark:bg-indigo-900/20">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-indigo-700 dark:text-indigo-200">{t("transactions.recurringSummaryTitle")}</p>
                  <p className="text-xs text-indigo-600 dark:text-indigo-300">{t("transactions.recurringSummarySubtitle")}</p>
                </div>
                <span className="flex items-center gap-2">
                  <span
                    className={`text-base font-semibold ${
                      currentRecurringTotalCents < 0 ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {toDecimalString(fromCents(currentRecurringTotalCents))} €
                  </span>
                  <svg
                    aria-hidden="true"
                    className="h-3.5 w-3.5 text-indigo-500 transition-transform duration-200 group-open:rotate-90"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M7 5L12 10L7 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </summary>
              <ul className="mt-3 space-y-2">
                {currentRecurring.map((rec) => (
                  <li key={rec.id} className="flex flex-col gap-1 rounded-md border border-indigo-100 bg-white/70 p-3 dark:border-indigo-900/40 dark:bg-neutral-900/70">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 dark:text-neutral-100">{rec.description}</p>
                      <span
                        className={`text-sm font-semibold ${
                          rec.amountCents < 0 ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {toDecimalString(fromCents(rec.amountCents))} €
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-neutral-400">
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200">
                        {t("transactions.recurringBadge")}
                      </span>
                      <span>{t("transactions.everyMonths", { count: rec.intervalMonths ?? 1 })}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <details className="group rounded-lg border border-gray-200 bg-white/90 p-4 text-sm shadow-sm dark:border-neutral-700 dark:bg-neutral-900/90">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-gray-900 dark:text-neutral-100">{t("transactions.upcomingRecurring")}</p>
              </div>
              <span className="flex items-center gap-2 text-xs text-gray-500 dark:text-neutral-400">
                {nextDate.toLocaleDateString(dateLocale, { month: "long", year: "numeric" })}
                <svg
                  aria-hidden="true"
                  className="h-3.5 w-3.5 text-gray-400 transition-transform duration-200 group-open:rotate-90 dark:text-neutral-400"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M7 5L12 10L7 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </summary>
            {nextRecurring.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500 dark:text-neutral-400">{t("transactions.noRecurringScheduled")}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {nextRecurring.map((rec) => {
                  const checked = !skipsNext.has(rec.id);
                  return (
                    <li key={rec.id} className="flex items-center justify-between gap-3 rounded-md border border-gray-100 bg-gray-50/80 p-3 dark:border-neutral-800 dark:bg-neutral-800/60">
                      <label className="flex items-center gap-3 text-sm text-gray-800 dark:text-neutral-100">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => toggleSkip(rec.id, event.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus-visible:ring-indigo-500"
                        />
                        <span>{rec.description}</span>
                      </label>
                      <span className={`text-sm font-semibold ${rec.amountCents < 0 ? "text-red-600" : "text-green-600"}`}>
                        {toDecimalString(fromCents(rec.amountCents))} €
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </details>

          <ul className="space-y-2">
            {filteredItems.map((tx) => (
              <li
                key={tx.id}
                className="rounded-lg border border-gray-200 bg-white/90 p-4 text-sm shadow-sm transition hover:border-indigo-200 focus-within:border-indigo-300 dark:border-neutral-700 dark:bg-neutral-900/90"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <p className="text-base font-medium text-gray-900 dark:text-neutral-100">
                      {tx.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-neutral-400">
                      <time dateTime={tx.occurredAt}>
                        {new Date(tx.occurredAt).toLocaleString(dateLocale)}
                      </time>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
                        {t("transactions.accountLabel")}: {tx.accountId}
                      </span>
                      {tx.categoryId && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
                          {t("transactions.categoryLabel")}: {categoriesById[tx.categoryId] ?? tx.categoryId}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-start">
                    <span
                      className={`text-base font-semibold ${
                        tx.amountCents < 0 ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {toDecimalString(fromCents(tx.amountCents))} €
                    </span>
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-2xl text-indigo-500 transition hover:text-indigo-600 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-indigo-300 dark:hover:text-indigo-200 dark:focus-visible:ring-offset-neutral-900"
                      onClick={(event) => {
                        lastFocusedRef.current = event.currentTarget;
                        setEditingTx(tx);
                      }}
                      aria-label={t("transactions.manageTransaction", {
                        description: tx.description || t("transactions.withoutDescription")
                      })}
                    >
                      <span aria-hidden="true" className="leading-none">
                        ⚙
                      </span>
                    </button>
                  </div>
                </div>
              </li>
            ))}
            {items.length === 0 && !error && (
              <li className="text-sm text-gray-500 dark:text-neutral-400">{t("transactions.noTransactionsYet")}</li>
            )}
            {items.length > 0 && filteredItems.length === 0 && normalizedQuery && (
              <li className="text-sm text-gray-500 dark:text-neutral-400" role="status">
                {t("transactions.noSearchMatches")}
              </li>
            )}
          </ul>
        </section>
      )}

      {activeTab === "recurring" && (
        <section
          className="space-y-4 max-w-2xl mx-auto"
          id="tab-panel-recurring"
          role="tabpanel"
          aria-labelledby="tab-recurring"
          tabIndex={0}
        >
          <h2 className="text-lg font-semibold">{t("transactions.recurringSectionTitle")}</h2>
          {recurringError && (
            <p role="alert" className="text-sm text-red-600">
              {recurringError}
            </p>
          )}
          <ul className="space-y-2">
            {recurringItems.map((rec) => (
              <li key={rec.id} className="rounded-lg border border-gray-200 bg-white/90 p-4 text-sm shadow-sm dark:border-neutral-700 dark:bg-neutral-900/90">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <p className="text-base font-medium text-gray-900 dark:text-neutral-100">{rec.description}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-neutral-400">
                      <span>{t("transactions.everyMonths", { count: rec.intervalMonths ?? 1 })}</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
                        {t("transactions.nextLabel", { date: new Date(rec.nextOccurrence).toLocaleDateString(dateLocale) })}
                      </span>
                      {rec.categoryId && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
                          {t("transactions.categoryLabel")}: {categoriesById[rec.categoryId] ?? rec.categoryId}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-start">
                    <span className={`text-base font-semibold ${rec.amountCents < 0 ? "text-red-600" : "text-green-600"}`}>
                      {toDecimalString(fromCents(rec.amountCents))} €
                    </span>
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-2xl text-indigo-500 transition hover:text-indigo-600 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-indigo-300 dark:hover:text-indigo-200 dark:focus-visible:ring-offset-neutral-900"
                      onClick={(event) => {
                        lastFocusedRef.current = event.currentTarget;
                        setEditingRecurring(rec);
                      }}
                      aria-label={t("transactions.manageRecurring", {
                        description: rec.description || t("transactions.withoutDescription")
                      })}
                    >
                      <span aria-hidden="true" className="leading-none">
                        ⚙
                      </span>
                    </button>
                  </div>
                </div>
              </li>
            ))}
            {recurringItems.length === 0 && (
              <li className="text-sm text-gray-500 dark:text-neutral-400">{t("transactions.noRecurringYet")}</li>
            )}
          </ul>
        </section>
      )}

      {editingTx && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
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

      {creating && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={closeCreateDialog} />
          <div
            ref={createDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={createDialogTitleId}
            className="relative z-10 mx-4 flex w-full max-w-2xl justify-center focus:outline-none"
            tabIndex={-1}
          >
            <TransactionForm
              headingId={createDialogTitleId}
              onSuccess={handleCreateSuccess}
              onClose={closeCreateDialog}
            />
          </div>
        </div>
      )}

      {editingRecurring && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={closeRecurringDialog} />
          <div
            ref={recurringDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`edit-recurring-${editingRecurring.id}`}
            className="relative z-10 mx-4 flex w-full max-w-2xl justify-center focus:outline-none"
            tabIndex={-1}
          >
            <RecurringTransactionForm
              recurring={{
                id: editingRecurring.id,
                accountId: editingRecurring.accountId,
                amountCents: editingRecurring.amountCents,
                description: editingRecurring.description,
                categoryId: editingRecurring.categoryId ?? null,
                intervalMonths: editingRecurring.intervalMonths ?? 1
              }}
              headingId={`edit-recurring-${editingRecurring.id}`}
              onSuccess={handleRecurringEditSuccess}
              onDelete={handleRecurringDeleteSuccess}
              onClose={closeRecurringDialog}
            />
          </div>
        </div>
      )}

      {feedback && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center" role="presentation">
          <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
          <div
            role="alertdialog"
            aria-live="assertive"
            aria-modal="true"
            aria-labelledby="feedback-title"
            className="relative z-10 w-full max-w-xs rounded-lg border border-indigo-200 bg-white p-4 text-sm shadow-lg focus:outline-none dark:border-indigo-500/40 dark:bg-neutral-900"
          >
            <h3 id="feedback-title" className="text-base font-semibold text-gray-900 dark:text-neutral-100">
              {feedback.variant === "success" ? t("transactions.successTitle") : t("transactions.noticeTitle")}
            </h3>
            <p className="mt-2 text-sm text-gray-700 dark:text-neutral-300">{feedback.message}</p>
            <div className="mt-4 flex justify-end">
              <button
                ref={feedbackDismissRef}
                type="button"
                onClick={() => setFeedback(null)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                {t("transactions.ok")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function TransactionsPageWithSuspense() {
  const { t } = useI18n();

  return (
    <Suspense fallback={<main className="p-6"><p className="text-sm text-gray-500">{t("transactions.loading")}</p></main>}>
      <TransactionsPage />
    </Suspense>
  );
}
