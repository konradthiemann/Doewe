"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo } from "react";

import PageContainer from "../../components/PageContainer";
import { useApiQuery } from "../../lib/api/useApiQuery";
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
  incomeCategories: Array<{
    id: string;
    name: string;
    amountCents: number;
    transactionCount: number;
  }>;
  topExpenses: Array<{
    description: string;
    amountCents: number;
    categoryName: string | null;
    occurredAt: string;
  }>;
  completedGoals: Array<{
    title: string;
    amountCents: number;
    spentCents: number;
  }>;
  completedGoalsSpentCents: number;
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
    borderClass: "border-success/40",
    badgeClass: "bg-success-soft text-success",
    icon: "✓",
    titleKey: "review.verdictGreat",
    subtitleKey: "review.verdictGreatSub"
  },
  good: {
    borderClass: "border-info/40",
    badgeClass: "bg-info-soft text-info",
    icon: "↑",
    titleKey: "review.verdictGood",
    subtitleKey: "review.verdictGoodSub"
  },
  ok: {
    borderClass: "border-warning/40",
    badgeClass: "bg-warning-soft text-warning",
    icon: "~",
    titleKey: "review.verdictOk",
    subtitleKey: "review.verdictOkSub"
  },
  challenging: {
    borderClass: "border-danger/40",
    badgeClass: "bg-danger-soft text-danger",
    icon: "!",
    titleKey: "review.verdictChallenging",
    subtitleKey: "review.verdictChallengingSub"
  }
};

function ReviewPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";

  const paramMonth = searchParams.get("month");
  const paramYear = searchParams.get("year");

  // Monat/Jahr stecken im Query-Key: Monatswechsel via UI ändert den Key,
  // react-query refetcht automatisch — kein useEffect nötig.
  const month = paramMonth ? Number(paramMonth) : null;
  const year = paramYear ? Number(paramYear) : null;
  const urlParams = new URLSearchParams();
  if (paramMonth) urlParams.set("month", paramMonth);
  if (paramYear) urlParams.set("year", paramYear);

  const reviewQuery = useApiQuery<ReviewData>(
    ["analytics", "monthly-review", month, year],
    `/api/analytics/monthly-review?${urlParams.toString()}`
  );

  const data = reviewQuery.data ?? null;
  const loading = reviewQuery.isPending;
  const error = reviewQuery.isError ? t("review.errorLoad") : null;

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
    <main id="maincontent" className="py-6 md:py-8">
      <PageContainer className="space-y-6">
      {/* Month navigation header — title left, month selector right on >= sm */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-ink">
          {t("review.title")}
        </h1>
        <div className="flex items-center gap-2 sm:w-72">
          <button
            onClick={goOlder}
            disabled={!canGoOlder || loading}
            aria-label={t("review.prev")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          {data && data.availableMonths.length > 1 ? (
            <select
              value={`${data.year}-${String(data.month).padStart(2, "0")}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-");
                navigate({ month: parseInt(m, 10), year: parseInt(y, 10) });
              }}
              className="min-w-0 flex-1 rounded-field border border-line bg-surface px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
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
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {data && !loading ? formatMonthLabel(data.month, data.year) : ""}
            </span>
          )}

          <button
            onClick={goNewer}
            disabled={!canGoNewer || loading}
            aria-label={t("review.next")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-ink-muted">{t("review.loading")}</p>
      )}

      {error && !loading && (
        <p className="text-sm text-danger">{error}</p>
      )}

      {!loading && data && (
        <>
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="min-w-0 space-y-6">
          {/* Verdict + KPI card */}
          <section aria-labelledby="review-verdict">
            <div
              className={`rounded-card border-2 bg-surface p-5 ${verdictConfig?.borderClass ?? ""}`}
            >
              <div className="flex items-start gap-3 mb-4">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg font-bold ${verdictConfig?.badgeClass ?? ""}`}
                  aria-hidden="true"
                >
                  {verdictConfig?.icon}
                </span>
                <div>
                  <h2 id="review-verdict" className="text-lg font-semibold text-ink">
                    {verdict ? t(verdictConfig!.titleKey) : ""}
                  </h2>
                  <p className="text-sm text-ink-muted mt-0.5">
                    {verdict
                      ? t(verdictConfig!.subtitleKey, { rate: String(data.savingsRatePct) })
                      : ""}
                  </p>
                </div>
              </div>

              {/* KPI grid */}
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-field border border-line bg-surface-2 p-3">
                  <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide">
                    {t("review.income")}
                  </dt>
                  <dd className="mt-1 text-xl font-semibold text-income tabular-nums">
                    {formatCurrency(data.incomeCents)}
                  </dd>
                </div>
                <div className="rounded-field border border-line bg-surface-2 p-3">
                  <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide">
                    {t("review.expenses")}
                  </dt>
                  <dd className="mt-1 text-xl font-semibold text-expense tabular-nums">
                    {formatCurrency(data.outcomeCents)}
                  </dd>
                </div>
                <div className="rounded-field border border-line bg-surface-2 p-3">
                  <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide">
                    {t("review.savings")}
                  </dt>
                  <dd className="mt-1 text-xl font-semibold text-savings tabular-nums">
                    {formatCurrency(data.savingsCents)}
                  </dd>
                </div>
                <div className="rounded-field border border-line bg-surface-2 p-3">
                  <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide">
                    {t("review.savingsRate")}
                  </dt>
                  <dd
                    className={`mt-1 text-xl font-semibold tabular-nums ${
                      data.savingsRatePct >= 15
                        ? "text-success"
                        : data.savingsRatePct >= 5
                          ? "text-warning"
                          : "text-danger"
                    }`}
                  >
                    {data.savingsRatePct}%
                  </dd>
                </div>
              </dl>

              {/* Balance change — wraps on narrow screens to avoid horizontal overflow */}
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                <span>
                  {t("review.balanceAtStart")}:{" "}
                  <span className="font-medium tabular-nums text-ink">
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
                        ? "text-income"
                        : "text-expense"
                    }`}
                  >
                    {formatCurrency(data.balanceAtEndCents)}
                  </span>
                </span>
              </div>
            </div>
          </section>

          {/* Income breakdown by source */}
          <section aria-labelledby="review-income-categories">
            <div className="rounded-card border border-line bg-surface p-5">
              <h2 id="review-income-categories" className="text-lg font-medium mb-4">
                {t("review.incomeCategoriesTitle")}
              </h2>
              {data.incomeCategories.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  {t("review.incomeCategoriesEmpty")}
                </p>
              ) : (
                <ul className="space-y-3">
                  {data.incomeCategories.map((cat) => {
                    const sharePct =
                      data.incomeCents > 0
                        ? Math.round((cat.amountCents / data.incomeCents) * 100)
                        : 0;
                    return (
                      <li
                        key={cat.id}
                        className="rounded-field border border-line bg-surface-2 p-3"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-ink">
                            {cat.name}
                          </span>
                          <div className="flex items-center gap-2 text-xs tabular-nums">
                            <span className="font-semibold text-income">
                              {formatCurrency(cat.amountCents)}
                            </span>
                            <span className="text-ink-faint">{sharePct}%</span>
                          </div>
                        </div>
                        <div className="relative h-2 w-full rounded bg-surface-2 overflow-hidden" aria-hidden="true">
                          <div
                            className="absolute inset-y-0 left-0 rounded bg-income transition-all"
                            style={{ width: `${sharePct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* Category breakdown */}
          <section aria-labelledby="review-categories">
            <div className="rounded-card border border-line bg-surface p-5">
              <h2 id="review-categories" className="text-lg font-medium mb-4">
                {t("review.categoriesTitle")}
              </h2>
              {data.categories.length === 0 ? (
                <p className="text-sm text-ink-muted">
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
                        className="rounded-field border border-line bg-surface-2 p-3"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-ink">
                            {cat.name}
                          </span>
                          <div className="flex items-center gap-2 text-xs tabular-nums">
                            <span
                              className={`font-semibold ${over ? "text-danger" : "text-ink"}`}
                            >
                              {formatCurrency(spent)}
                            </span>
                            {budget !== null && (
                              <span className="text-ink-faint">
                                / {formatCurrency(budget)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Horizontal bar */}
                        <div className="relative h-2 w-full rounded bg-surface-2 overflow-hidden" aria-hidden="true">
                          {budget !== null && (
                            <div
                              className="absolute inset-y-0 left-0 rounded bg-line-strong"
                              style={{ width: `${budgetPct}%` }}
                            />
                          )}
                          <div
                            className={`absolute inset-y-0 left-0 rounded transition-all ${over ? "bg-danger" : "bg-success"}`}
                            style={{ width: `${spentPct}%` }}
                          />
                        </div>

                        <p className={`mt-1 text-[11px] ${over ? "text-danger" : budget !== null ? "text-ink-muted" : "text-ink-faint"}`}>
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
          </div>
          <div className="min-w-0 space-y-6">

          {/* MoM comparison */}
          {momDeltas ? (
            <section aria-labelledby="review-mom">
              <div className="rounded-card border border-line bg-surface p-5">
                <h2 id="review-mom" className="text-lg font-medium mb-1">
                  {t("review.momTitle")}
                </h2>
                <p className="text-xs text-ink-muted mb-4">
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
                      ? "text-ink-muted"
                      : isGood
                        ? "text-success"
                        : "text-danger";
                    const sign = positive ? "+" : "";

                    return (
                      <div
                        key={labelKey}
                        className="rounded-field border border-line bg-surface-2 px-3 py-3"
                      >
                        <p className="text-xs text-ink-muted mb-1">
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
            <section>
              <div className="rounded-card border border-line bg-surface p-5">
                <h2 className="text-lg font-medium mb-2">{t("review.momTitle")}</h2>
                <p className="text-sm text-ink-muted">{t("review.momNoPrev")}</p>
              </div>
            </section>
          )}

          {/* Top expenses */}
          <section aria-labelledby="review-top-expenses">
            <div className="rounded-card border border-line bg-surface p-5">
              <h2 id="review-top-expenses" className="text-lg font-medium mb-4">
                {t("review.topExpensesTitle")}
              </h2>
              {data.topExpenses.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  {t("review.topExpensesEmpty")}
                </p>
              ) : (
                <ol className="space-y-2">
                  {data.topExpenses.map((exp, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between gap-3 rounded-field border border-line bg-surface-2 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-bold text-ink-muted"
                          aria-hidden="true"
                        >
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink truncate">
                            {exp.description}
                          </p>
                          <p className="text-xs text-ink-muted">
                            {exp.categoryName ?? "—"}
                            {" · "}
                            {new Date(exp.occurredAt).toLocaleDateString(dateLocale, {
                              day: "numeric",
                              month: "short"
                            })}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-expense tabular-nums">
                        {formatCurrency(exp.amountCents)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>

          {/* Completed saving goals */}
          {data.completedGoals.length > 0 && (
            <section aria-labelledby="review-completed-goals">
              <div className="rounded-card border border-line bg-surface p-5">
                <h2 id="review-completed-goals" className="text-lg font-medium mb-4">
                  {t("review.completedGoalsTitle")}
                </h2>
                <ul className="space-y-2">
                  {data.completedGoals.map((goal, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between gap-3 rounded-field border border-line bg-surface-2 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink truncate">
                          {goal.title}
                        </p>
                        {goal.spentCents !== goal.amountCents && (
                          <p className="text-xs text-ink-muted">
                            {t("review.completedGoalTarget", { amount: formatCurrency(goal.amountCents) })}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-savings tabular-nums">
                        {formatCurrency(goal.spentCents)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm text-ink-muted">
                  {t("review.completedGoalsTotal", {
                    amount: formatCurrency(data.completedGoalsSpentCents)
                  })}
                </p>
              </div>
            </section>
          )}

          {/* No data state */}
          {data.incomeCents === 0 &&
            data.outcomeCents === 0 &&
            data.savingsCents === 0 && (
              <section>
                <div className="rounded-md border border-dashed border-line-strong p-8 text-center">
                  <p className="text-sm text-ink-muted">
                    {t("review.noData")}
                  </p>
                </div>
              </section>
            )}
          </div>
          </div>
        </>
      )}
      </PageContainer>
    </main>
  );
}

export default function ReviewPageWithSuspense() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<main className="p-6"><p className="text-sm text-ink-muted">{t("review.loading")}</p></main>}>
      <ReviewPage />
    </Suspense>
  );
}
