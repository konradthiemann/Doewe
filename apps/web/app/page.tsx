"use client";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  Title,
  BarElement,
  type ChartOptions
} from "chart.js";
import ChartDataLabels, { type Context as DataLabelsContext } from "chartjs-plugin-datalabels";
import { useEffect, useMemo, useState } from "react";
import { Doughnut, Bar } from "react-chartjs-2";

import { useI18n } from "../lib/i18n";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  Title,
  BarElement,
  ChartDataLabels
);

export default function HomePage() {
  const { locale, t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const dateLocale = locale === "de" ? "de-DE" : "en-US";
  const [summary, setSummary] = useState<{
    totalBalance: number;
    carryoverFromLastMonth: number;
    incomeTotal: number;
    outcomeTotal: number;
    remaining: number;
    plannedSavings: number;
    monthlySavingsActual: number;
    outgoingByCategory: Array<{ id: string; name: string; amount: number }>;
    categoryBudgets?: Array<{ categoryId: string; name: string; budget: number; spent: number; diff: number }>;
    recurringTransactions?: Array<{
      id: string;
      description: string;
      amountCents: number;
      categoryId: string | null;
      dayOfMonth: number | null;
    }>;
    recurringIncomeTotal?: number;
    recurringOutcomeTotal?: number;
    projectedIncomeTotal?: number;
    projectedOutcomeTotal?: number;
    projectedRemaining?: number;
  }>({
    totalBalance: 0,
    carryoverFromLastMonth: 0,
    incomeTotal: 0,
    outcomeTotal: 0,
    remaining: 0,
    plannedSavings: 0,
    monthlySavingsActual: 0,
    outgoingByCategory: [],
    categoryBudgets: [],
    recurringTransactions: [],
    recurringIncomeTotal: 0,
    recurringOutcomeTotal: 0,
    projectedIncomeTotal: 0,
    projectedOutcomeTotal: 0,
    projectedRemaining: 0
  });

  const [quarterly, setQuarterly] = useState<{
    quarters: Array<{ month: number; year: number; incomeCents: number; outcomeCents: number; savingsCents: number; balanceCents: number }>;
    totals: { incomeCents: number; outcomeCents: number; savingsCents: number };
  } | null>(null);
  const [quarterlyLoading, setQuarterlyLoading] = useState(true);
  const [quarterlyError, setQuarterlyError] = useState<string | null>(null);

  const [savingPlan, setSavingPlan] = useState<{
    totals: { availableCents: number; totalTargetCents: number; suggestedMonthlyCents: number };
    nextDeadline: { month: number; year: number } | null;
  } | null>(null);

  useEffect(() => {
    async function fetchSummary() {
      const res = await fetch("/api/analytics/summary", { cache: "no-store" });
      const data = res.ok ? await res.json() : undefined;
      if (data) setSummary(data);
    }

    async function fetchQuarterly() {
      setQuarterlyLoading(true);
      setQuarterlyError(null);
      try {
        const res = await fetch("/api/analytics/quarterly", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setQuarterly(data);
      } catch {
        setQuarterlyError(t("dashboard.quarterlyError"));
      } finally {
        setQuarterlyLoading(false);
      }
    }

    async function fetchSavingPlan() {
      try {
        const res = await fetch("/api/saving-plan", { cache: "no-store" });
        if (!res.ok) return;
        const data: {
          goals: Array<{ month: number; year: number }>;
          totals: { availableCents: number; totalTargetCents: number; suggestedMonthlyCents: number };
        } = await res.json();
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const upcoming = (data.goals || [])
          .filter((g) => g.year > currentYear || (g.year === currentYear && g.month >= currentMonth))
          .sort((a, b) => (a.year - b.year) * 12 + (a.month - b.month));
        setSavingPlan({
          totals: data.totals,
          nextDeadline: upcoming[0] ? { month: upcoming[0].month, year: upcoming[0].year } : null
        });
      } catch {
        // silent: saving plan is enhancement data, summary is the fallback
      }
    }

    (async () => {
      await Promise.all([fetchSummary(), fetchQuarterly(), fetchSavingPlan()]);
      setLoading(false);
    })();
  }, [t]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  const outgoingLabels = useMemo(
    () => summary.outgoingByCategory.map((c) => c.name),
    [summary.outgoingByCategory]
  );
  const outgoingValues = useMemo(
    () => summary.outgoingByCategory.map((c) => c.amount),
    [summary.outgoingByCategory]
  );

  // Projected totals for current month (including recurring transactions)
  const carryover = summary.carryoverFromLastMonth || 0;
  const projectedIncome = Math.max(0, summary.projectedIncomeTotal ?? (summary.incomeTotal + (summary.recurringIncomeTotal || 0)));
  const projectedOutcome = Math.max(0, summary.projectedOutcomeTotal ?? (summary.outcomeTotal + (summary.recurringOutcomeTotal || 0)));
  const totalSavingsTransfer = Math.max(0, summary.monthlySavingsActual || 0);
  const projectedSpent = projectedOutcome + totalSavingsTransfer;
  const projectedExpenses = projectedOutcome;
  // Available budget = carryover from previous month + income of current month (incl. recurring).
  // Carryover is intentionally NOT floored at 0 so a negative carryover reduces the budget honestly.
  const availableBudget = carryover + projectedIncome;
  const projectedLeft = availableBudget - projectedSpent;
  const expensesPercent = availableBudget > 0 ? Math.min(100, Math.round((projectedExpenses / availableBudget) * 100)) : 0;
  const savedPercent = availableBudget > 0 ? Math.min(100 - expensesPercent, Math.round((totalSavingsTransfer / availableBudget) * 100)) : 0;
  const leftPercent = availableBudget > 0 ? Math.max(0, 100 - expensesPercent - savedPercent) : 0;
  const overspent = Math.max(0, projectedSpent - availableBudget);
  const overspentPercent = availableBudget > 0 ? Math.max(0, Math.round((overspent / availableBudget) * 100)) : 0;
  const hasIncomeData = projectedIncome > 0 || carryover !== 0;
  const budgetUnderwater = availableBudget <= 0;

  // Savings rate: share of projected income transferred to savings this month
  const savingsRate = projectedIncome > 0
    ? Math.max(0, Math.round((totalSavingsTransfer / projectedIncome) * 100))
    : 0;

  // Saving-plan recommendation: suggested monthly savings vs. actual
  const suggestedMonthly = savingPlan ? savingPlan.totals.suggestedMonthlyCents / 100 : 0;
  const savingShortfall = Math.max(0, suggestedMonthly - totalSavingsTransfer);
  const savingOnTrack = suggestedMonthly > 0 ? totalSavingsTransfer >= suggestedMonthly : totalSavingsTransfer > 0;

  // Category budgets: budgets set at category level vs. actual spent (incl. recurring)
  const categoryBudgets = summary.categoryBudgets || [];
  const overBudgetCategories = categoryBudgets.filter((c) => c.diff > 0);

  // MoM deltas from the quarterly series. The last entry is the current month.
  const momDeltas = useMemo(() => {
    if (!quarterly || quarterly.quarters.length < 2) return null;
    const arr = quarterly.quarters;
    const cur = arr[arr.length - 1];
    const prev = arr[arr.length - 2];
    const diff = (a: number, b: number) => {
      const absDiff = (a - b) / 100;
      const pct = b !== 0 ? Math.round(((a - b) / Math.abs(b)) * 100) : null;
      return { absDiff, pct };
    };
    return {
      income: diff(cur.incomeCents, prev.incomeCents),
      outcome: diff(cur.outcomeCents, prev.outcomeCents),
      savings: diff(cur.savingsCents, prev.savingsCents)
    };
  }, [quarterly]);

  // Warm palette (reds/oranges/yellows) for outgoings only – avoids greens/blues/purples
  const warmPalette = [
    "#EF4444", // red-500
    "#F97316", // orange-500
    "#F59E0B", // amber-500
    "#F43F5E", // rose-500
    "#FB923C", // orange-400
    "#FACC15", // yellow-400
    "#EAB308", // yellow-500
    "#DC2626", // red-600
    "#F87171", // red-400
    "#FDBA74", // orange-300
    "#FDE68A", // yellow-300
    "#FCA5A5"  // rose-300
  ];
  const step = 5; // co-prime with warmPalette.length for better spread
  const outColors = outgoingLabels.map((_, i) => warmPalette[(i * step) % warmPalette.length]);

  const doughnutData = {
    labels: outgoingLabels,
    datasets: [
      {
        label: "€",
        data: outgoingValues,
        backgroundColor: outColors,
        borderWidth: 0
      }
    ]
  };

  // Planned vs Actual savings
  const plannedSavings = summary.plannedSavings;
  const actualSavings = summary.monthlySavingsActual || 0;
  const plannedColor = "#6366F1"; // indigo
  const actualColor = "#16A34A"; // green
  const savingsProgress = plannedSavings > 0 ? Math.min(100, Math.round((actualSavings / plannedSavings) * 100)) : 0;

  const doughnutOptions: ChartOptions<"doughnut"> = {
    plugins: {
      legend: {
        position: isMobile ? "bottom" : "right",
        align: isMobile ? "center" : "start",
        labels: {
          boxWidth: isMobile ? 12 : 18,
          font: { size: isMobile ? 10 : 12 }
        }
      },
      datalabels: {
        display: !isMobile,
        color: "#111827",
        formatter: (_val: number, ctx: DataLabelsContext) => {
          if (isMobile) return "";
          const labels = (ctx.chart.data.labels || []) as string[];
          const i = typeof ctx.dataIndex === "number" ? ctx.dataIndex : 0;
          return labels[i] || "";
        },
        font: { weight: "bold" as const }
      }
    }
  };

  const formatCurrency = (value: number) =>
    `${value.toLocaleString(dateLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

  const recurringTransactions = summary.recurringTransactions || [];
  const recurringIncomeTotal = summary.recurringIncomeTotal || 0;
  const recurringOutcomeTotal = summary.recurringOutcomeTotal || 0;

  return (
    <main id="maincontent" className="p-6 space-y-8">

      {/* Page Header */}
      <header className="max-w-5xl">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-neutral-100">
          {t("page.dashboard")}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-neutral-400">
          {new Date().toLocaleDateString(dateLocale, { month: "long", year: "numeric" })}
        </p>
      </header>

      {/* HERO: Monthly Budget — the most important number front and center */}
      <section aria-labelledby="monthly-hero" className="max-w-3xl">
        <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white p-6 dark:bg-neutral-900">
          <h2 id="monthly-hero" className="text-sm font-semibold uppercase tracking-widest text-gray-400 dark:text-neutral-500 mb-4">
            {t("dashboard.monthlyIncomeUsage")}
          </h2>

          {budgetUnderwater && !loading && (
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300" role="alert">
              {t("dashboard.budgetUnderwaterWarning")}
            </div>
          )}

          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-12 rounded-xl bg-gray-100 dark:bg-neutral-800" />
              <div className="h-4 rounded-full bg-gray-100 dark:bg-neutral-800" />
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-neutral-800" />)}
              </div>
            </div>
          ) : hasIncomeData ? (
            <>
              {/* Big remaining number */}
              <div className="mb-5">
                <p className="text-xs font-medium uppercase tracking-widest text-gray-400 dark:text-neutral-500 mb-1">
                  {t("dashboard.left")}
                </p>
                <p className={`text-5xl font-bold tabular-nums leading-none ${projectedLeft >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {formatCurrency(projectedLeft)}
                </p>
                {overspent > 0 && (
                  <p className="mt-1.5 text-sm font-medium text-red-600 dark:text-red-400">
                    {t("dashboard.overspendAboveBudget", { percent: overspentPercent })}
                  </p>
                )}
                {projectedLeft >= 0 && leftPercent > 0 && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
                    {t("dashboard.leftAvailable", { percent: leftPercent })}
                  </p>
                )}
              </div>

              {/* Segmented progress bar */}
              <div
                className="relative w-full h-4 rounded-full overflow-hidden bg-emerald-100 dark:bg-emerald-900/30 mb-2"
                role="img"
                aria-label={t("dashboard.incomeUsageTitle")}
              >
                <div
                  className="absolute inset-y-0 left-0 bg-red-400 dark:bg-red-500 transition-all duration-700"
                  style={{ width: `${Math.min(100, expensesPercent)}%` }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={expensesPercent}
                  aria-label={t("dashboard.spent")}
                />
                {totalSavingsTransfer > 0 && (
                  <div
                    className="absolute inset-y-0 bg-blue-400 dark:bg-blue-500 transition-all duration-700"
                    style={{ left: `${Math.min(100, expensesPercent)}%`, width: `${Math.min(100 - expensesPercent, savedPercent)}%` }}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={savedPercent}
                    aria-label={t("dashboard.saved")}
                  />
                )}
              </div>
              <div className="mb-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-neutral-400">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-red-400 dark:bg-red-500" aria-hidden="true" />
                  {t("dashboard.spent")}
                </span>
                {totalSavingsTransfer > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-blue-400 dark:bg-blue-500" aria-hidden="true" />
                    {t("dashboard.saved")}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 dark:bg-emerald-500" aria-hidden="true" />
                  {t("dashboard.left")}
                </span>
              </div>

              {/* 3 metric pills */}
              <dl className="grid grid-cols-3 gap-3" aria-label={t("dashboard.incomeReportBreakdown")}>
                <div className="rounded-xl bg-gray-50 dark:bg-neutral-800/60 px-3 py-3 text-center">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-neutral-400">
                    {t("dashboard.quarterlyIncome")}
                  </dt>
                  <dd className="mt-0.5 text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(projectedIncome)}
                  </dd>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-neutral-800/60 px-3 py-3 text-center">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-neutral-400">
                    {t("dashboard.spent")}
                  </dt>
                  <dd className="mt-0.5 text-lg font-bold tabular-nums text-red-600 dark:text-red-400">
                    {formatCurrency(projectedExpenses)}
                  </dd>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-neutral-800/60 px-3 py-3 text-center">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-neutral-400">
                    {t("dashboard.saved")}
                  </dt>
                  <dd className={`mt-0.5 text-lg font-bold tabular-nums ${totalSavingsTransfer > 0 ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-neutral-500"}`}>
                    {formatCurrency(totalSavingsTransfer)}
                  </dd>
                </div>
              </dl>

              <p className="mt-3 text-xs text-gray-400 dark:text-neutral-500">
                {t("dashboard.budgetBreakdown", {
                  carryover: formatCurrency(carryover),
                  income: formatCurrency(projectedIncome),
                  budget: formatCurrency(availableBudget)
                })}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">
              {t("dashboard.addIncomeTransactions")}
            </p>
          )}
        </div>
      </section>

      {/* Secondary KPIs: Balance, Carryover, Savings Rate, Saved This Month */}
      <section aria-labelledby="balance-overview" className="max-w-5xl">
        <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white p-5 dark:bg-neutral-900">
          <h2 id="balance-overview" className="text-sm font-semibold uppercase tracking-widest text-gray-400 dark:text-neutral-500 mb-4">
            {t("dashboard.balanceOverview")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.totalBalance")}</p>
              <p className={`text-2xl font-semibold tabular-nums ${summary.totalBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {formatCurrency(summary.totalBalance)}
              </p>
              <p className="text-xs text-gray-500 dark:text-neutral-400">{t("dashboard.totalBalanceHint")}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.carryoverFromLastMonth")}</p>
              <p className={`text-2xl font-semibold tabular-nums ${carryover >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"}`}>
                {formatCurrency(carryover)}
              </p>
              <p className="text-xs text-gray-500 dark:text-neutral-400">
                {carryover < 0 ? t("dashboard.carryoverNegativeHint") : t("dashboard.carryoverHint")}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.savingsRate")}</p>
              <p className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{savingsRate}%</p>
              <p className="text-xs text-gray-500 dark:text-neutral-400">{t("dashboard.savingsRateHint")}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.savedThisMonth")}</p>
              <p className="text-2xl font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                {formatCurrency(actualSavings)}
              </p>
              <p className="text-xs text-gray-500 dark:text-neutral-400">
                {plannedSavings > 0
                  ? t("dashboard.percentOfTarget", { percent: savingsProgress })
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Category Budgets */}
      <section aria-labelledby="category-budgets" className="max-w-3xl">
        <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white p-5 dark:bg-neutral-900">
          <h2 id="category-budgets" className="text-lg font-medium mb-1">
            {t("dashboard.categoryBudgetsTitle")}
          </h2>
          <p className="text-xs text-gray-500 dark:text-neutral-400 mb-4">{t("dashboard.categoryBudgetsSubtitle")}</p>
          {loading ? (
            <div className="space-y-2 animate-pulse">
              {[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-neutral-800" />)}
            </div>
          ) : categoryBudgets.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.categoryBudgetsEmpty")}</p>
          ) : (
            <>
              {overBudgetCategories.length === 0 && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-3">{t("dashboard.categoryBudgetsAllOk")}</p>
              )}
              <ul className="space-y-2">
                {categoryBudgets
                  .slice()
                  .sort((a, b) => b.diff - a.diff)
                  .map((c) => {
                    const pct = c.budget > 0 ? Math.min(200, Math.round((c.spent / c.budget) * 100)) : 0;
                    const over = c.diff > 0;
                    return (
                      <li key={c.categoryId} className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-neutral-700 dark:bg-neutral-800">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium text-gray-900 dark:text-neutral-100">{c.name}</span>
                          <span className={`text-xs font-semibold tabular-nums ${over ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                            {formatCurrency(c.spent)} / {formatCurrency(c.budget)}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-neutral-900 overflow-hidden" aria-hidden="true">
                          <div
                            className={`h-2 rounded-full transition-all duration-500 ${over ? "bg-red-500" : "bg-emerald-500"}`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <p className={`mt-1 text-[11px] ${over ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-neutral-400"}`}>
                          {over
                            ? t("dashboard.categoryBudgetOverBy", { amount: formatCurrency(c.diff) })
                            : t("dashboard.categoryBudgetUnderBy", { amount: formatCurrency(-c.diff) })}
                        </p>
                      </li>
                    );
                  })}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* Spending by Category */}
      <section aria-labelledby="outgoing-chart" className="max-w-xl">
        <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 p-5 bg-white dark:bg-neutral-900">
          <h2 id="outgoing-chart" className="text-lg font-medium mb-4">
            {t("dashboard.outgoingsByCategory")}
          </h2>
          {loading ? (
            <div className="h-64 rounded-xl bg-gray-100 dark:bg-neutral-800 animate-pulse" />
          ) : outgoingValues.length > 0 ? (
            <Doughnut data={doughnutData} options={doughnutOptions} />
          ) : (
            <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.noOutgoings")}</p>
          )}
        </div>
      </section>

      {/* Savings Status */}
      <section aria-labelledby="savings-overview" className="max-w-3xl">
        <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white p-5 dark:bg-neutral-900">
          <h2 id="savings-overview" className="text-lg font-medium mb-4">
            {t("dashboard.savingsOverview")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3 mb-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.plannedSavings")}</p>
              <p className="text-2xl font-semibold tabular-nums" style={{ color: plannedColor }}>{plannedSavings.toFixed(0)} €</p>
              <p className="text-xs text-gray-500 dark:text-neutral-400">{t("dashboard.targetForMonth")}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.actualSaved")}</p>
              <p className="text-2xl font-semibold tabular-nums" style={{ color: actualColor }}>{actualSavings.toFixed(0)} €</p>
              <p className="text-xs text-gray-500 dark:text-neutral-400">
                {t("dashboard.percentOfTarget", { percent: savingsProgress })}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.recommendedSavings")}</p>
              <p className={`text-2xl font-semibold tabular-nums ${savingOnTrack ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                {suggestedMonthly.toFixed(0)} €
              </p>
              <p className="text-xs text-gray-500 dark:text-neutral-400">{t("dashboard.recommendedSavingsHint")}</p>
            </div>
          </div>
          <div className="mb-3">
            <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-neutral-800" aria-hidden="true">
              <div
                className="h-2 rounded-full transition-all duration-500"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={savingsProgress}
                aria-label={t("dashboard.savingsProgressLabel")}
                style={{ width: `${savingsProgress}%`, backgroundColor: actualColor }}
              />
            </div>
          </div>
          {savingPlan && suggestedMonthly > 0 && (
            <div className={`rounded-xl border px-3 py-2.5 text-sm ${savingOnTrack
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            }`}>
              <p className="font-medium">
                {savingOnTrack
                  ? t("dashboard.savingOnTrack")
                  : t("dashboard.savingShortfall", { shortfall: formatCurrency(savingShortfall) })}
              </p>
              {savingPlan.nextDeadline && (
                <p className="mt-0.5 text-xs opacity-80">
                  {t("dashboard.savingNextDeadline", {
                    date: new Date(savingPlan.nextDeadline.year, savingPlan.nextDeadline.month - 1, 1)
                      .toLocaleDateString(dateLocale, { month: "long", year: "numeric" })
                  })}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Monthly Trend — collapsible, no data table */}
      <section aria-labelledby="quarterly-overview" className="max-w-4xl">
        <details className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 group">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl p-5 select-none [&::-webkit-details-marker]:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900">
            <div>
              <h2 id="quarterly-overview" className="text-lg font-medium">
                {t("dashboard.quarterlyOverview")}
              </h2>
              <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">{t("dashboard.quarterlySubtitle")}</p>
            </div>
            <svg className="w-5 h-5 shrink-0 ml-2 text-gray-500 dark:text-neutral-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </summary>

          <div className="space-y-5 px-5 pb-5">
            {quarterlyLoading ? (
              <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.quarterlyLoading")}</p>
            ) : quarterlyError ? (
              <p className="text-sm text-red-600 dark:text-red-400">{quarterlyError}</p>
            ) : quarterly && quarterly.quarters.length > 0 ? (
              <>
                {/* MoM deltas */}
                {momDeltas && (
                  <div className="grid gap-2 sm:grid-cols-3" aria-label={t("dashboard.momDelta")}>
                    <p className="col-span-full text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-neutral-400">
                      {t("dashboard.momDelta")}
                    </p>
                    {([
                      ["quarterlyIncome", momDeltas.income],
                      ["quarterlyOutcome", momDeltas.outcome],
                      ["quarterlySavings", momDeltas.savings]
                    ] as const).map(([labelKey, d]) => {
                      const positive = d.absDiff > 0;
                      const neutral = d.absDiff === 0;
                      const goodDirection = labelKey === "quarterlyOutcome" ? !positive : positive;
                      const colorClass = neutral
                        ? "text-gray-500 dark:text-neutral-400"
                        : goodDirection
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400";
                      const sign = positive ? "+" : "";
                      return (
                        <div key={labelKey} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-800">
                          <p className="text-xs text-gray-500 dark:text-neutral-400">{t(`dashboard.${labelKey}`)}</p>
                          <p className={`text-sm font-semibold tabular-nums ${colorClass}`}>
                            {d.pct !== null
                              ? t("dashboard.momDeltaAbs", { delta: `${sign}${formatCurrency(d.absDiff)}`, pct: `${sign}${d.pct}` })
                              : t("dashboard.momDeltaAbsOnly", { delta: `${sign}${formatCurrency(d.absDiff)}` })}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Bar chart */}
                <div className="h-48 sm:h-64">
                  <Bar
                    data={{
                      labels: quarterly.quarters.map(q => {
                        const date = new Date(q.year, q.month - 1, 1);
                        return date.toLocaleDateString(dateLocale, { month: "short", year: "numeric" });
                      }),
                      datasets: [
                        {
                          label: t("dashboard.quarterlyIncome"),
                          data: quarterly.quarters.map(q => q.incomeCents / 100),
                          backgroundColor: "#16A34A",
                          borderRadius: 4
                        },
                        {
                          label: t("dashboard.quarterlyOutcome"),
                          data: quarterly.quarters.map(q => q.outcomeCents / 100),
                          backgroundColor: "#DC2626",
                          borderRadius: 4
                        },
                        {
                          label: t("dashboard.quarterlySavings"),
                          data: quarterly.quarters.map(q => q.savingsCents / 100),
                          backgroundColor: "#3B82F6",
                          borderRadius: 4
                        }
                      ]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: "bottom",
                          labels: { boxWidth: isMobile ? 12 : 18, font: { size: isMobile ? 10 : 12 } }
                        },
                        datalabels: { display: false }
                      },
                      scales: {
                        x: { grid: { display: false } },
                        y: {
                          beginAtZero: true,
                          ticks: {
                            callback: (value) => `${Number(value).toLocaleString(dateLocale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`
                          },
                          grid: { color: "rgba(203,213,225,0.4)" }
                        }
                      }
                    }}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.quarterlyLoading")}</p>
            )}
          </div>
        </details>
      </section>

      {/* Recurring Transactions */}
      <section aria-labelledby="recurring-overview" className="max-w-3xl">
        <details className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 group">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl p-5 select-none [&::-webkit-details-marker]:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900">
            <div>
              <h2 id="recurring-overview" className="text-lg font-medium mb-1">
                {t("dashboard.recurringOverview")}
              </h2>
              <p className="text-xs text-gray-500 dark:text-neutral-400">
                {t("dashboard.recurringSubtitle")}
              </p>
            </div>
            <svg className="w-5 h-5 shrink-0 ml-2 text-gray-500 dark:text-neutral-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="px-5 pb-5">
            {loading ? (
              <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.loading")}</p>
            ) : recurringTransactions.length > 0 ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 mb-4">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.recurringIncome")}</p>
                    <p className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(recurringIncomeTotal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.recurringOutcome")}</p>
                    <p className="text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400">
                      {formatCurrency(recurringOutcomeTotal)}
                    </p>
                  </div>
                </div>
                <ul className="space-y-2">
                  {recurringTransactions.map((rec) => (
                    <li key={rec.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-neutral-700 dark:bg-neutral-800">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-neutral-100 truncate">
                          {rec.description}
                        </p>
                        {rec.dayOfMonth && (
                          <p className="text-xs text-gray-500 dark:text-neutral-400">
                            {t("dashboard.recurringDay", { day: rec.dayOfMonth })}
                          </p>
                        )}
                      </div>
                      <span className={`text-sm font-semibold tabular-nums ml-3 ${
                        rec.amountCents < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                      }`}>
                        {formatCurrency(rec.amountCents / 100)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.noRecurring")}</p>
            )}
          </div>
        </details>
      </section>

    </main>
  );
}
