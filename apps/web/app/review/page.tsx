"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useI18n } from "../../lib/i18n";

type ReviewData = {
  month: number;
  year: number;
  incomeCents: number;
  outcomeCents: number;
  savingsCents: number;
  balanceAtStartCents: number;
  balanceAtEndCents: number;
  savingsRatePct: number;
  categories: Array<{
    id: string;
    name: string;
    spentCents: number;
    budgetCents: number | null;
    transactionCount: number;
  }>;
  topExpenses: Array<{
    description: string;
    amountCents: number;
    categoryName: string | null;
    occurredAt: string;
  }>;
  prevMonth: {
    month: number;
    year: number;
    incomeCents: number;
    outcomeCents: number;
    savingsCents: number;
  } | null;
  availableMonths: Array<{ month: number; year: number }>;
};

type Verdict = "great" | "good" | "ok" | "challenging";

function getVerdict(data: ReviewData): Verdict {
  const overBudgetCount = data.categories.filter(
    (c) => c.budgetCents !== null && c.spentCents > c.budgetCents
  ).length;
  const overspent = data.outcomeCents > data.incomeCents;

  if (data.savingsRatePct >= 15 && overBudgetCount === 0 && !overspent) return "great";
  if (data.savingsRatePct >= 5 || (overBudgetCount <= 1 && !overspent)) return "good";
  if (!overspent) return "ok";
  return "challenging";
}

const VERDICT_CONFIG: Record<
  Verdict,
  {
    borderClass: string;
    badgeClass: string;
    icon: string;
    titleKey: string;
    subtitleKey: string;
  }
> = {
  great: {
    borderClass: "border-emerald-300 dark:border-emerald-700",
    badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
    icon: "✓",
    titleKey: "review.verdictGreat",
    subtitleKey: "review.verdictGreatSub"
  },
  good: {
    borderClass: "border-blue-300 dark:border-blue-700",
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
    icon: "↑",
    titleKey: "review.verdictGood",
    subtitleKey: "review.verdictGoodSub"
  },
  ok: {
    borderClass: "border-amber-300 dark:border-amber-700",
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
    icon: "~",
    titleKey: "review.verdictOk",
    subtitleKey: "review.verdictOkSub"
  },
  challenging: {
    borderClass: "border-red-300 dark:border-red-700",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
    icon: "!",
    titleKey: "review.verdictChallenging",
    subtitleKey: "review.verdictChallengingSub"
  }
};

export default function ReviewPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";

  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const paramMonth = searchParams.get("month");
  const paramYear = searchParams.get("year");

  const fetchData = useCallback(
    async (month?: string | null, year?: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (month) params.set("month", month);
        if (year) params.set("year", year);
        const res = await fetch(`/api/analytics/monthly-review?${params.toString()}`, {
          cache: "no-store"
        });
        if (!res.ok) throw new Error(`${res.status}`);
        setData(await res.json());
      } catch {
        setError(t("review.errorLoad"));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    fetchData(paramMonth, paramYear);
  }, [fetchData, paramMonth, paramYear]);

  const formatCurrency = useCallback(
    (cents: number) =>
      `${(cents / 100).toLocaleString(dateLocale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })} €`,
    [dateLocale]
  );

  const formatMonthLabel = useCallback(
    (month: number, year: number) =>
      new Date(year, month - 1, 1).toLocaleDateString(dateLocale, {
        month: "long",
        year: "numeric"
      }),
    [dateLocale]
  );

  // Month navigation: find current index in availableMonths
  const currentIndex = useMemo(() => {
    if (!data) return -1;
    return data.availableMonths.findIndex(
      (m) => m.month === data.month && m.year === data.year
    );
  }, [data]);

  const canGoNewer = currentIndex > 0;
  const canGoOlder = data ? currentIndex < data.availableMonths.length - 1 : false;

  const navigate = useCallback(
    (m: { month: number; year: number }) => {
      router.push(`/review?month=${m.month}&year=${m.year}`);
    },
    [router]
  );

  const goNewer = useCallback(() => {
    if (!data || !canGoNewer) return;
    navigate(data.availableMonths[currentIndex - 1]);
  }, [data, canGoNewer, currentIndex, navigate]);

  const goOlder = useCallback(() => {
    if (!data || !canGoOlder) return;
    navigate(data.availableMonths[currentIndex + 1]);
  }, [data, canGoOlder, currentIndex, navigate]);

  // MoM deltas
  const momDeltas = useMemo(() => {
    if (!data?.prevMonth) return null;
    const cur = data;
    const prev = data.prevMonth;
    const diff = (a: number, b: number) => ({
      absDiff: (a - b) / 100,
      pct: b !== 0 ? Math.round(((a - b) / Math.abs(b)) * 100) : null
    });
    return {
      income: diff(cur.incomeCents, prev.incomeCents),
      outcome: diff(cur.outcomeCents, prev.outcomeCents),
      savings: diff(cur.savingsCents, prev.savingsCents)
    };
  }, [data]);

  const verdict = data ? getVerdict(data) : null;
  const verdictConfig = verdict ? VERDICT_CONFIG[verdict] : null;

  return (
    <main id="maincontent" className="p-6 space-y-8">
      {/* Month navigation header */}
      <div className="flex items-center justify-between max-w-3xl">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-neutral-100">
            {t("review.title")}
          </h1>
          {data && !loading && (
            <p className="text-sm text-gray-500 dark:text-neutral-400 mt-0.5">
              {formatMonthLabel(data.month, data.year)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goOlder}
            disabled={!canGoOlder || loading}
            aria-label={t("review.prev")}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-300 hover:bg-gray-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          {data && data.availableMonths.length > 1 && (
            <select
              value={`${data.year}-${String(data.month).padStart(2, "0")}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-");
                navigate({ month: parseInt(m, 10), year: parseInt(y, 10) });
              }}
              className="rounded-md border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm text-gray-700 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {data.availableMonths.map((m) => (
                <option
                  key={`${m.year}-${m.month}`}
                  value={`${m.year}-${String(m.month).padStart(2, "0")}`}
                >
                  {formatMonthLabel(m.month, m.year)}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={goNewer}
            disabled={!canGoNewer || loading}
            aria-label={t("review.next")}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-300 hover:bg-gray-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-gray-500 dark:text-neutral-400">{t("review.loading")}</p>
      )}

      {error && !loading && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {!loading && data && (
        <>
          {/* Verdict + KPI card */}
          <section aria-labelledby="review-verdict" className="max-w-3xl">
            <div
              className={`rounded-md border-2 bg-white dark:bg-neutral-900 p-5 ${verdictConfig?.borderClass ?? ""}`}
            >
              <div className="flex items-start gap-3 mb-4">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg font-bold ${verdictConfig?.badgeClass ?? ""}`}
                  aria-hidden="true"
                >
                  {verdictConfig?.icon}
                </span>
                <div>
                  <h2 id="review-verdict" className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
                    {verdict ? t(verdictConfig!.titleKey) : ""}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-neutral-400 mt-0.5">
                    {verdict
                      ? t(verdictConfig!.subtitleKey, { rate: String(data.savingsRatePct) })
                      : ""}
                  </p>
                </div>
              </div>

              {/* KPI grid */}
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-md border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/60 p-3">
                  <dt className="text-xs font-medium text-gray-500 dark:text-neutral-400 uppercase tracking-wide">
                    {t("review.income")}
                  </dt>
                  <dd className="mt-1 text-xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatCurrency(data.incomeCents)}
                  </dd>
                </div>
                <div className="rounded-md border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/60 p-3">
                  <dt className="text-xs font-medium text-gray-500 dark:text-neutral-400 uppercase tracking-wide">
                    {t("review.expenses")}
                  </dt>
                  <dd className="mt-1 text-xl font-semibold text-red-600 dark:text-red-400 tabular-nums">
                    {formatCurrency(data.outcomeCents)}
                  </dd>
                </div>
                <div className="rounded-md border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/60 p-3">
                  <dt className="text-xs font-medium text-gray-500 dark:text-neutral-400 uppercase tracking-wide">
                    {t("review.savings")}
                  </dt>
                  <dd className="mt-1 text-xl font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                    {formatCurrency(data.savingsCents)}
                  </dd>
                </div>
                <div className="rounded-md border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/60 p-3">
                  <dt className="text-xs font-medium text-gray-500 dark:text-neutral-400 uppercase tracking-wide">
                    {t("review.savingsRate")}
                  </dt>
                  <dd
                    className={`mt-1 text-xl font-semibold tabular-nums ${
                      data.savingsRatePct >= 15
                        ? "text-emerald-600 dark:text-emerald-400"
                        : data.savingsRatePct >= 5
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {data.savingsRatePct}%
                  </dd>
                </div>
              </dl>

              {/* Balance change */}
              <div className="mt-4 flex items-center gap-3 text-sm text-gray-600 dark:text-neutral-400">
                <span>
                  {t("review.balanceAtStart")}:{" "}
                  <span className="font-medium tabular-nums text-gray-800 dark:text-neutral-200">
                    {formatCurrency(data.balanceAtStartCents)}
                  </span>
                </span>
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
                <span>
                  {t("review.balanceAtEnd")}:{" "}
                  <span
                    className={`font-medium tabular-nums ${
                      data.balanceAtEndCents >= data.balanceAtStartCents
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {formatCurrency(data.balanceAtEndCents)}
                  </span>
                </span>
              </div>
            </div>
          </section>

          {/* Category breakdown */}
          <section aria-labelledby="review-categories" className="max-w-3xl">
            <div className="rounded-md border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
              <h2 id="review-categories" className="text-lg font-medium mb-4">
                {t("review.categoriesTitle")}
              </h2>
              {data.categories.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-neutral-400">
                  {t("review.categoriesEmpty")}
                </p>
              ) : (
                <ul className="space-y-3">
                  {data.categories.map((cat) => {
                    const budget = cat.budgetCents;
                    const spent = cat.spentCents;
                    const maxBar = budget !== null ? Math.max(budget, spent) : spent;
                    const spentPct = maxBar > 0 ? Math.min(100, Math.round((spent / maxBar) * 100)) : 0;
                    const budgetPct = budget !== null && maxBar > 0 ? Math.min(100, Math.round((budget / maxBar) * 100)) : 0;
                    const over = budget !== null && spent > budget;

                    return (
                      <li
                        key={cat.id}
                        className="rounded-md border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800 p-3"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-neutral-100">
                            {cat.name}
                          </span>
                          <div className="flex items-center gap-2 text-xs tabular-nums">
                            <span
                              className={`font-semibold ${over ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-neutral-200"}`}
                            >
                              {formatCurrency(spent)}
                            </span>
                            {budget !== null && (
                              <span className="text-gray-400 dark:text-neutral-500">
                                / {formatCurrency(budget)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Horizontal bar */}
                        <div className="relative h-2 w-full rounded bg-gray-200 dark:bg-neutral-700 overflow-hidden" aria-hidden="true">
                          {budget !== null && (
                            <div
                              className="absolute inset-y-0 left-0 rounded bg-gray-300 dark:bg-neutral-600"
                              style={{ width: `${budgetPct}%` }}
                            />
                          )}
                          <div
                            className={`absolute inset-y-0 left-0 rounded transition-all ${over ? "bg-red-500" : "bg-emerald-500"}`}
                            style={{ width: `${spentPct}%` }}
                          />
                        </div>

                        <p className={`mt-1 text-[11px] ${over ? "text-red-600 dark:text-red-400" : budget !== null ? "text-gray-500 dark:text-neutral-400" : "text-gray-400 dark:text-neutral-500"}`}>
                          {budget === null
                            ? t("review.noBudget")
                            : over
                              ? t("review.overBudget", { amount: formatCurrency(spent - budget) })
                              : t("review.underBudget", { amount: formatCurrency(budget - spent) })}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* MoM comparison */}
          {momDeltas ? (
            <section aria-labelledby="review-mom" className="max-w-3xl">
              <div className="rounded-md border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
                <h2 id="review-mom" className="text-lg font-medium mb-1">
                  {t("review.momTitle")}
                </h2>
                <p className="text-xs text-gray-500 dark:text-neutral-400 mb-4">
                  {data.prevMonth
                    ? formatMonthLabel(data.prevMonth.month, data.prevMonth.year)
                    : ""}
                </p>

                <div className="grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      ["review.momIncome", momDeltas.income, false],
                      ["review.momExpenses", momDeltas.outcome, true],
                      ["review.momSavings", momDeltas.savings, false]
                    ] as const
                  ).map(([labelKey, d, invertGoodDirection]) => {
                    const positive = d.absDiff > 0;
                    const neutral = d.absDiff === 0;
                    // For expenses: positive delta (more spending) is bad
                    const isGood = neutral ? false : invertGoodDirection ? !positive : positive;
                    const colorClass = neutral
                      ? "text-gray-500 dark:text-neutral-400"
                      : isGood
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400";
                    const sign = positive ? "+" : "";

                    return (
                      <div
                        key={labelKey}
                        className="rounded-md border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 px-3 py-3"
                      >
                        <p className="text-xs text-gray-500 dark:text-neutral-400 mb-1">
                          {t(labelKey)}
                        </p>
                        <p className={`text-base font-semibold tabular-nums ${colorClass}`}>
                          {/* formatCurrency handles negative sign; we only prepend "+" for positive deltas */}
                          {sign}{formatCurrency(d.absDiff * 100)}
                        </p>
                        {d.pct !== null && (
                          <p className={`text-xs ${colorClass}`}>
                            {sign}{d.pct}%
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : (
            <section className="max-w-3xl">
              <div className="rounded-md border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
                <h2 className="text-lg font-medium mb-2">{t("review.momTitle")}</h2>
                <p className="text-sm text-gray-500 dark:text-neutral-400">{t("review.momNoPrev")}</p>
              </div>
            </section>
          )}

          {/* Top expenses */}
          <section aria-labelledby="review-top-expenses" className="max-w-3xl">
            <div className="rounded-md border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
              <h2 id="review-top-expenses" className="text-lg font-medium mb-4">
                {t("review.topExpensesTitle")}
              </h2>
              {data.topExpenses.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-neutral-400">
                  {t("review.topExpensesEmpty")}
                </p>
              ) : (
                <ol className="space-y-2">
                  {data.topExpenses.map((exp, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between gap-3 rounded-md border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 dark:bg-neutral-700 text-[11px] font-bold text-gray-600 dark:text-neutral-300"
                          aria-hidden="true"
                        >
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-neutral-100 truncate">
                            {exp.description}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-neutral-400">
                            {exp.categoryName ?? "—"}
                            {" · "}
                            {new Date(exp.occurredAt).toLocaleDateString(dateLocale, {
                              day: "numeric",
                              month: "short"
                            })}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-red-600 dark:text-red-400 tabular-nums">
                        {formatCurrency(exp.amountCents)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>

          {/* No data state */}
          {data.incomeCents === 0 &&
            data.outcomeCents === 0 &&
            data.savingsCents === 0 && (
              <section className="max-w-3xl">
                <div className="rounded-md border border-dashed border-gray-300 dark:border-neutral-700 p-8 text-center">
                  <p className="text-sm text-gray-500 dark:text-neutral-400">
                    {t("review.noData")}
                  </p>
                </div>
              </section>
            )}
        </>
      )}
    </main>
  );
}
