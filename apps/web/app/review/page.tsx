"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useRef, useState } from "react";

import PageContainer from "../../components/PageContainer";
import { CategoryBreakdown, type ReviewCategory, type ReviewCategoryTransaction } from "../../components/review/CategoryBreakdown";
import TransactionForm from "../../components/TransactionForm";
import { CollapsibleSection } from "../../components/ui/CollapsibleSection";
import { Dialog } from "../../components/ui/Dialog";
import { useToast } from "../../components/ui/Toast";
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
  categories: ReviewCategory[];
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
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editingTx, setEditingTx] = useState<ReviewCategoryTransaction | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const openEditDialog = useCallback((tx: ReviewCategoryTransaction) => {
    lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditingTx(tx);
  }, []);

  const closeEditDialog = useCallback(() => {
    setEditingTx(null);
    window.setTimeout(() => lastFocusedRef.current?.focus(), 0);
  }, []);

  // Same invalidation as the transactions page; react-query refetches active views.
  const invalidateTransactionData = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    void queryClient.invalidateQueries({ queryKey: ["saving-plan"] });
    void queryClient.invalidateQueries({ queryKey: ["tax"] });
  }, [queryClient]);

  const handleEditSuccess = (message?: string) => {
    invalidateTransactionData();
    closeEditDialog();
    toast.success(message ?? t("transactionForm.updated"));
  };

  const handleDeleteSuccess = (message?: string) => {
    invalidateTransactionData();
    closeEditDialog();
    toast.success(message ?? t("transactionForm.deleted"));
  };

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
          {/* Verdict + KPI card */}
          <section aria-labelledby="review-verdict">
            <div
              className={`rounded-card border-2 bg-surface p-5 ${verdictConfig?.borderClass ?? ""}`}
            >
              <div className="mb-4 flex items-start gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg font-bold ${verdictConfig?.badgeClass ?? ""}`}
                  aria-hidden="true"
                >
                  {verdictConfig?.icon}
                </span>
                <div className="min-w-0">
                  <h2 id="review-verdict" className="text-base font-semibold text-ink">
                    {verdict ? t(verdictConfig!.titleKey) : ""}
                  </h2>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {verdict
                      ? t(verdictConfig!.subtitleKey, { rate: String(data.savingsRatePct) })
                      : ""}
                  </p>
                </div>
              </div>

              {/* KPI grid: 2x2 below sm, 4 equal tiles from sm; values never wrap */}
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="min-w-0 rounded-field border border-line bg-surface-2 p-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                    {t("review.income")}
                  </dt>
                  <dd className="mt-1 whitespace-nowrap text-base font-semibold tabular-nums text-income sm:text-lg">
                    {formatCurrency(data.incomeCents)}
                  </dd>
                </div>
                <div className="min-w-0 rounded-field border border-line bg-surface-2 p-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                    {t("review.expenses")}
                  </dt>
                  <dd className="mt-1 whitespace-nowrap text-base font-semibold tabular-nums text-expense sm:text-lg">
                    {formatCurrency(data.outcomeCents)}
                  </dd>
                </div>
                <div className="min-w-0 rounded-field border border-line bg-surface-2 p-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                    {t("review.savings")}
                  </dt>
                  <dd className="mt-1 whitespace-nowrap text-base font-semibold tabular-nums text-savings sm:text-lg">
                    {formatCurrency(data.savingsCents)}
                  </dd>
                </div>
                <div className="min-w-0 rounded-field border border-line bg-surface-2 p-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                    {t("review.savingsRate")}
                  </dt>
                  <dd
                    className={`mt-1 whitespace-nowrap text-base font-semibold tabular-nums sm:text-lg ${
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

              {/* Balance change footer */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line pt-3 text-sm text-ink-muted">
                <span className="whitespace-nowrap">
                  {t("review.balanceAtStart")}:{" "}
                  <span className="font-medium tabular-nums text-ink">
                    {formatCurrency(data.balanceAtStartCents)}
                  </span>
                </span>
                <span className="whitespace-nowrap">
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

          {/* Category breakdown — the main part, full width */}
          <section aria-labelledby="review-categories">
            <div className="rounded-card border border-line bg-surface p-5">
              <h2 id="review-categories" className="mb-4 text-lg font-medium">
                {t("review.categoriesTitle")}
              </h2>
              {data.categories.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  {t("review.categoriesEmpty")}
                </p>
              ) : (
                <CategoryBreakdown
                  categories={data.categories}
                  outcomeCents={data.outcomeCents}
                  formatCurrency={formatCurrency}
                  dateLocale={dateLocale}
                  onEditTransaction={openEditDialog}
                />
              )}
            </div>
          </section>

          {/* Income breakdown by source (collapsed) */}
          <CollapsibleSection
            id="review-income-categories"
            title={t("review.incomeCategoriesTitle")}
          >
            {data.incomeCategories.length === 0 ? (
              <p className="text-sm text-ink-muted">
                {t("review.incomeCategoriesEmpty")}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {data.incomeCategories.map((cat) => {
                  const sharePct =
                    data.incomeCents > 0
                      ? Math.round((cat.amountCents / data.incomeCents) * 100)
                      : 0;
                  return (
                    <li
                      key={cat.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto_3rem] items-center gap-x-3 py-2.5 text-sm"
                    >
                      <span className="truncate font-medium text-ink">{cat.name}</span>
                      <span className="whitespace-nowrap text-right font-semibold tabular-nums text-income">
                        {formatCurrency(cat.amountCents)}
                      </span>
                      <span className="text-right text-xs tabular-nums text-ink-muted">
                        {sharePct}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CollapsibleSection>

          {/* Top expenses (collapsed) */}
          <CollapsibleSection
            id="review-top-expenses"
            title={t("review.topExpensesTitle")}
          >
            {data.topExpenses.length === 0 ? (
              <p className="text-sm text-ink-muted">
                {t("review.topExpensesEmpty")}
              </p>
            ) : (
              <ol className="divide-y divide-line">
                {data.topExpenses.map((exp, idx) => (
                  <li
                    key={idx}
                    className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5"
                  >
                    <span
                      className="text-xs font-bold tabular-nums text-ink-muted"
                      aria-hidden="true"
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {exp.description}
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        {exp.categoryName ?? "—"}
                        {" · "}
                        {new Date(exp.occurredAt).toLocaleDateString(dateLocale, {
                          day: "numeric",
                          month: "short"
                        })}
                      </p>
                    </div>
                    <span className="whitespace-nowrap text-right text-sm font-semibold tabular-nums text-expense">
                      {formatCurrency(exp.amountCents)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CollapsibleSection>

          {/* MoM comparison (collapsed; little signal in a review) */}
          <CollapsibleSection id="review-mom" title={t("review.momTitle")}>
            {momDeltas ? (
              <>
                <p className="mb-3 text-xs text-ink-muted">
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
                        className="min-w-0 rounded-field border border-line bg-surface-2 px-3 py-3"
                      >
                        <p className="mb-1 text-xs text-ink-muted">
                          {t(labelKey)}
                        </p>
                        <p className={`whitespace-nowrap text-base font-semibold tabular-nums ${colorClass}`}>
                          {/* formatCurrency handles negative sign; we only prepend "+" for positive deltas */}
                          {sign}{formatCurrency(d.absDiff * 100)}
                        </p>
                        {d.pct !== null && (
                          <p className={`text-xs tabular-nums ${colorClass}`}>
                            {sign}{d.pct}%
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-sm text-ink-muted">{t("review.momNoPrev")}</p>
            )}
          </CollapsibleSection>

          {/* Completed saving goals */}
          {data.completedGoals.length > 0 && (
            <section aria-labelledby="review-completed-goals">
              <div className="rounded-card border border-line bg-surface p-5">
                <h2 id="review-completed-goals" className="mb-4 text-lg font-medium">
                  {t("review.completedGoalsTitle")}
                </h2>
                <ul className="divide-y divide-line">
                  {data.completedGoals.map((goal, idx) => (
                    <li
                      key={idx}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {goal.title}
                        </p>
                        {goal.spentCents !== goal.amountCents && (
                          <p className="text-xs text-ink-muted">
                            {t("review.completedGoalTarget", { amount: formatCurrency(goal.amountCents) })}
                          </p>
                        )}
                      </div>
                      <span className="whitespace-nowrap text-right text-sm font-semibold tabular-nums text-savings">
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
                <div className="rounded-card border border-dashed border-line-strong p-8 text-center">
                  <p className="text-sm text-ink-muted">
                    {t("review.noData")}
                  </p>
                </div>
              </section>
            )}
        </>
      )}
      </PageContainer>

      {/* Edit booking dialog (the review list only contains expenses) */}
      <Dialog
        open={!!editingTx}
        onOpenChange={(open) => {
          if (!open) closeEditDialog();
        }}
        title={t("transactionForm.editTitle")}
      >
        {editingTx && (
          <TransactionForm
            mode="edit"
            transaction={{
              id: editingTx.id,
              accountId: editingTx.accountId,
              // Review amounts are positive expense values; the form expects the signed DB amount.
              amountCents: -editingTx.amountCents,
              description: editingTx.description,
              occurredAt: editingTx.occurredAt,
              categoryId: editingTx.categoryId,
              taxRelevant: editingTx.taxRelevant
            }}
            headingId={`edit-transaction-${editingTx.id}`}
            onSuccess={handleEditSuccess}
            onDelete={handleDeleteSuccess}
            onClose={closeEditDialog}
          />
        )}
      </Dialog>
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
