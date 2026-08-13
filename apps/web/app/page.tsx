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
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Doughnut, Bar } from "react-chartjs-2";

import PageContainer from "../components/PageContainer";
import { Skeleton } from "../components/ui/Skeleton";
import { useApiQuery } from "../lib/api/useApiQuery";
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

type SummaryData = {
  totalBalance: number;
  carryoverFromLastMonth: number;
  incomeTotal: number;
  outcomeTotal: number;
  remaining: number;
  plannedSavings: number;
  completedGoals?: Array<{ title: string; target: number; spent: number; completedAt: string }>;
  completedGoalsSpent?: number;
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
};

type QuarterlyData = {
  quarters: Array<{ month: number; year: number; incomeCents: number; outcomeCents: number; savingsCents: number; balanceCents: number }>;
  totals: { incomeCents: number; outcomeCents: number; savingsCents: number };
};

type SavingPlanData = {
  goals: Array<{ month: number; year: number }>;
  totals: { availableCents: number; totalTargetCents: number; suggestedMonthlyCents: number };
};

const EMPTY_SUMMARY: SummaryData = {
  totalBalance: 0,
  carryoverFromLastMonth: 0,
  incomeTotal: 0,
  outcomeTotal: 0,
  remaining: 0,
  plannedSavings: 0,
  completedGoals: [],
  completedGoalsSpent: 0,
  monthlySavingsActual: 0,
  outgoingByCategory: [],
  categoryBudgets: [],
  recurringTransactions: [],
  recurringIncomeTotal: 0,
  recurringOutcomeTotal: 0,
  projectedIncomeTotal: 0,
  projectedOutcomeTotal: 0,
  projectedRemaining: 0
};

export default function HomePage() {
  const { locale, t } = useI18n();
  const [isMobile, setIsMobile] = useState(false);
  const dateLocale = locale === "de" ? "de-DE" : "en-US";

  // Phase 2 „Offline lesen": Daten kommen aus dem persistierten Query-Cache —
  // offline zeigt das Dashboard den letzten geladenen Stand.
  const summaryQuery = useApiQuery<SummaryData>(["analytics", "summary"], "/api/analytics/summary");
  const quarterlyQuery = useApiQuery<QuarterlyData>(["analytics", "quarterly"], "/api/analytics/quarterly");
  const savingPlanQuery = useApiQuery<SavingPlanData>(["saving-plan"], "/api/saving-plan");

  const summary = summaryQuery.data ?? EMPTY_SUMMARY;
  const loading = summaryQuery.isPending;
  const quarterly = quarterlyQuery.data ?? null;
  const quarterlyLoading = quarterlyQuery.isPending;
  const quarterlyError = quarterlyQuery.isError ? t("dashboard.quarterlyError") : null;

  // Sparplan: nächste Deadline aus den datierten Zielen ableiten
  const savingPlan = useMemo(() => {
    const data = savingPlanQuery.data;
    if (!data) return null;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const upcoming = (data.goals || [])
      .filter((g) => g.year > currentYear || (g.year === currentYear && g.month >= currentMonth))
      .sort((a, b) => (a.year - b.year) * 12 + (a.month - b.month));
    return {
      totals: data.totals,
      nextDeadline: upcoming[0] ? { month: upcoming[0].month, year: upcoming[0].year } : null
    };
  }, [savingPlanQuery.data]);

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
  // Net savings this month: positive = money set aside, negative = withdrawn back to spending.
  const savingsNet = summary.monthlySavingsActual || 0;
  const totalSavingsTransfer = Math.max(0, savingsNet); // deposits, shown as "saved"
  const savingsWithdrawn = Math.max(0, -savingsNet); // withdrawals returning to the budget
  const projectedSpent = projectedOutcome + totalSavingsTransfer;
  // Expenses-only and savings-only percentages for the segmented progress bar
  const projectedExpenses = projectedOutcome;
  // Available budget = carryover from previous month + income of current month (incl. recurring)
  // + any savings withdrawn back into everyday spending this month.
  // Carryover is intentionally NOT floored at 0 so a negative carryover reduces the budget honestly.
  const availableBudget = carryover + projectedIncome + savingsWithdrawn;
  const projectedLeft = availableBudget - projectedSpent;
  const spentPercent = availableBudget > 0 ? Math.min(100, Math.round((projectedSpent / availableBudget) * 100)) : 0;
  const expensesPercent = availableBudget > 0 ? Math.min(100, Math.round((projectedExpenses / availableBudget) * 100)) : 0;
  const savedPercent = availableBudget > 0 ? Math.min(100 - expensesPercent, Math.round((totalSavingsTransfer / availableBudget) * 100)) : 0;
  const overspent = Math.max(0, projectedSpent - availableBudget);
  const overspentPercent = availableBudget > 0 ? Math.max(0, Math.round((overspent / availableBudget) * 100)) : 0;
  const hasIncomeData = projectedIncome > 0 || carryover !== 0;
  const budgetUnderwater = availableBudget <= 0;

  // Core KPIs derived from the summary numbers above.
  // Savings rate: how much of projected income is transferred to savings this month.
  const savingsRate = projectedIncome > 0
    ? Math.max(0, Math.round((totalSavingsTransfer / projectedIncome) * 100))
    : 0;
  // Fixed-cost ratio: recurring expenses as share of projected income (proxy for financial obligation load).
  const recurringOutcome = summary.recurringOutcomeTotal || 0;
  const fixedCostRatio = projectedIncome > 0
    ? Math.max(0, Math.round((recurringOutcome / projectedIncome) * 100))
    : 0;

  // Saving-plan recommendation: suggested monthly savings vs. actual.
  const suggestedMonthly = savingPlan ? savingPlan.totals.suggestedMonthlyCents / 100 : 0;
  const savingShortfall = Math.max(0, suggestedMonthly - totalSavingsTransfer);
  const savingOnTrack = suggestedMonthly > 0 ? totalSavingsTransfer >= suggestedMonthly : totalSavingsTransfer > 0;

  // Category budgets: budgets set at category level vs. actual spent (incl. recurring).
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

  // Calm categorical palette aus den Tokens (brand, savings, expense, warning,
  // ink-faint + ruhige Zwischentöne). Ersetzt die alte Warm-Palette.
  const categoryPalette = [
    "#2a6f65", // brand
    "#4e6fa3", // savings
    "#a85a51", // expense
    "#8a6116", // warning
    "#8b8b86", // ink-faint
    "#35857a", // brand-hover
    "#6a86b8", // savings hell
    "#c07d74", // expense hell
    "#a97e2a", // warning hell
    "#5c5c58"  // ink-muted
  ];
  // Distribute colors to reduce adjacent similarity by stepping through palette
  const step = 3; // co-prime with palette length for better spread
  const outColors = outgoingLabels.map((_, i) => categoryPalette[(i * step) % categoryPalette.length]);

  // Doughnut chart shows only outcome categories
  const doughnutLabels = outgoingLabels;
  const doughnutValues = outgoingValues;
  const doughnutColors = outColors;

  const doughnutData = {
    labels: doughnutLabels,
    datasets: [
      {
        label: "€",
        data: doughnutValues,
        backgroundColor: doughnutColors,
        borderWidth: 0
      }
    ]
  };

  // Planned vs Actual savings cards
  const plannedSavings = summary.plannedSavings;
  const actualSavings = summary.monthlySavingsActual || 0;
  const plannedColor = "#4e6fa3"; // savings
  const actualColor = "#2e7d54"; // income
  const savingsProgress = plannedSavings > 0 ? Math.max(0, Math.min(100, Math.round((actualSavings / plannedSavings) * 100))) : 0;

  // Saving goals completed this month (by completion/withdrawal date)
  const completedGoals = summary.completedGoals || [];
  const completedGoalsSpent = summary.completedGoalsSpent || 0;

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
        color: "#5c5c58",
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

  // "Steht noch an": Daueraufträge mit Fälligkeitstag ab heute (Restmonat)
  const todayOfMonth = new Date().getDate();
  const upcomingRecurring = recurringTransactions
    .filter((rec) => rec.dayOfMonth != null && rec.dayOfMonth >= todayOfMonth)
    .sort((a, b) => (a.dayOfMonth ?? 0) - (b.dayOfMonth ?? 0));

  // Budgets: kritischste zuerst; nur Top 3 offen, Rest einklappbar
  const sortedBudgets = categoryBudgets.slice().sort((a, b) => b.diff - a.diff);
  const topBudgets = sortedBudgets.slice(0, 3);
  const moreBudgets = sortedBudgets.slice(3);

  // Leerer Account (Erstnutzung): Hero zeigt Willkommens-Einstieg statt 0-Werten
  const showWelcome = !loading && !hasIncomeData && projectedSpent === 0 && recurringTransactions.length === 0;

  const renderBudgetItem = (c: { categoryId: string; name: string; budget: number; spent: number; diff: number }) => {
    const pct = c.budget > 0 ? Math.min(200, Math.round((c.spent / c.budget) * 100)) : 0;
    const over = c.diff > 0;
    return (
      <li key={c.categoryId} className="rounded-field border border-line bg-surface-2 p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-ink">{c.name}</span>
          <span className={`text-xs font-semibold tabular-nums ${over ? "text-danger" : "text-ink-muted"}`}>
            {formatCurrency(c.spent)} / {formatCurrency(c.budget)}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-surface overflow-hidden" aria-hidden="true">
          <div
            className={`h-2 rounded-full ${over ? "bg-danger" : pct >= 85 ? "bg-warning" : "bg-brand"}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <p className={`mt-1 text-[11px] ${over ? "text-danger" : "text-ink-muted"}`}>
          {over
            ? t("dashboard.categoryBudgetOverBy", { amount: formatCurrency(c.diff) })
            : t("dashboard.categoryBudgetUnderBy", { amount: formatCurrency(-c.diff) })}
        </p>
      </li>
    );
  };

  const renderRecurringItem = (rec: { id: string; description: string; amountCents: number; dayOfMonth: number | null }) => (
    <li key={rec.id} className="flex items-center justify-between rounded-field border border-line bg-surface-2 p-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">
          {rec.description}
        </p>
        {rec.dayOfMonth && (
          <p className="text-xs text-ink-muted">
            {t("dashboard.recurringDay", { day: rec.dayOfMonth })}
          </p>
        )}
      </div>
      <span className={`text-sm font-semibold tabular-nums ml-3 ${
        rec.amountCents < 0 ? "text-expense" : "text-income"
      }`}>
        {formatCurrency(rec.amountCents / 100)}
      </span>
    </li>
  );

  return (
    <main id="maincontent" className="py-6 md:py-8">
      <PageContainer className="space-y-6">
      {/* Hero: "Verfügbar bis Monatsende" — beantwortet die Monatsfrage auf einen Blick */}
      <section aria-labelledby="hero-left">
        <div className="rounded-card border border-line bg-surface p-5 shadow-card">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-9 w-56" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ) : showWelcome ? (
            <div className="space-y-3">
              <h2 id="hero-left" className="text-lg font-semibold text-ink">
                {t("dashboard.welcomeTitle")}
              </h2>
              <p className="text-sm text-ink-muted">{t("dashboard.welcomeBody")}</p>
              <Link
                href="/transactions"
                className="inline-flex items-center justify-center rounded-field bg-brand px-4 py-2 text-sm font-semibold text-brand-on shadow-card transition duration-quick ease-calm hover:bg-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                {t("dashboard.welcomeCta")}
              </Link>
            </div>
          ) : (
            <>
              <h2 id="hero-left" className="text-sm font-medium text-ink-muted">
                {t("dashboard.heroTitle")}
              </h2>
              <p className={`mt-1 text-amount-hero font-bold tabular-nums ${projectedLeft >= 0 ? "text-income" : "text-expense"}`}>
                {formatCurrency(projectedLeft)}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">{t("dashboard.heroHint")}</p>
              {budgetUnderwater && (
                <div className="mt-3 rounded-field border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">
                  {t("dashboard.budgetUnderwaterWarning")}
                </div>
              )}
              {hasIncomeData && (
                <div className="mt-4 space-y-2">
                  <div className="relative h-3 w-full overflow-hidden rounded-full bg-income">
                    <div
                      className="absolute inset-y-0 left-0 rounded-l-full bg-ink-faint transition-all duration-500 motion-reduce:transition-none"
                      style={{ width: `${Math.min(100, expensesPercent)}%` }}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={expensesPercent}
                      aria-label={t("dashboard.spent")}
                    />
                    {totalSavingsTransfer > 0 && (
                      <div
                        className="absolute inset-y-0 bg-savings transition-all duration-500 motion-reduce:transition-none"
                        style={{ left: `${Math.min(100, expensesPercent)}%`, width: `${Math.min(100 - expensesPercent, savedPercent)}%` }}
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={savedPercent}
                        aria-label={t("dashboard.saved")}
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3 text-xs text-ink-muted">
                    <span>{t("dashboard.spent")}: {formatCurrency(projectedExpenses)}</span>
                    {totalSavingsTransfer > 0 && (
                      <span className="text-savings">{t("dashboard.saved")}: {formatCurrency(totalSavingsTransfer)}</span>
                    )}
                    <span>{t("dashboard.left")}: {formatCurrency(projectedLeft)}</span>
                  </div>
                  <p className="text-xs text-ink-muted">
                    {savingsWithdrawn > 0
                      ? t("dashboard.budgetBreakdownWithWithdrawal", {
                          carryover: formatCurrency(carryover),
                          income: formatCurrency(projectedIncome),
                          withdrawn: formatCurrency(savingsWithdrawn),
                          budget: formatCurrency(availableBudget)
                        })
                      : t("dashboard.budgetBreakdown", {
                          carryover: formatCurrency(carryover),
                          income: formatCurrency(projectedIncome),
                          budget: formatCurrency(availableBudget)
                        })}
                  </p>
                  {overspent > 0 && (
                    <p className="text-xs font-medium text-danger">
                      {t("dashboard.overspendAboveBudget", { percent: overspentPercent })} ({formatCurrency(overspent)})
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Kern-KPIs — 2-spaltig ab Mobile (kein Einspalter-Scrollen mehr) */}
      <section aria-label={t("dashboard.balanceOverview")}>
        {loading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="min-w-0 rounded-card border border-line bg-surface p-3 shadow-card">
              <p className="text-xs text-ink-muted">{t("dashboard.spent")}</p>
              <p className="mt-0.5 text-amount font-semibold tabular-nums text-expense">{formatCurrency(projectedSpent)}</p>
              <p className="text-[11px] text-ink-faint">{t("dashboard.spentOfBudget", { percent: spentPercent })}</p>
            </div>
            <div className="min-w-0 rounded-card border border-line bg-surface p-3 shadow-card">
              <p className="text-xs text-ink-muted">{t("dashboard.saved")}</p>
              <p className="mt-0.5 text-amount font-semibold tabular-nums text-savings">{formatCurrency(totalSavingsTransfer)}</p>
              <p className="text-[11px] text-ink-faint">{t("dashboard.savingsRate")}: {savingsRate}%</p>
            </div>
            <div className="min-w-0 rounded-card border border-line bg-surface p-3 shadow-card">
              <p className="text-xs text-ink-muted">{t("dashboard.totalBalance")}</p>
              <p className={`mt-0.5 text-amount font-semibold tabular-nums ${summary.totalBalance >= 0 ? "text-income" : "text-expense"}`}>
                {formatCurrency(summary.totalBalance)}
              </p>
              <p className="text-[11px] text-ink-faint">{t("dashboard.totalBalanceHint")}</p>
            </div>
            <div className="min-w-0 rounded-card border border-line bg-surface p-3 shadow-card">
              <p className="text-xs text-ink-muted">{t("dashboard.fixedCostRatio")}</p>
              <p className={`mt-0.5 text-amount font-semibold tabular-nums ${fixedCostRatio >= 70 ? "text-danger" : fixedCostRatio >= 50 ? "text-warning" : "text-ink"}`}>
                {fixedCostRatio}%
              </p>
              <p className="text-[11px] text-ink-faint">{t("dashboard.fixedCostRatioHint")}</p>
            </div>
          </div>
        )}
      </section>

      {/* Category Budgets — nach oben gezogen: wichtigste Info für tägliche Haushaltsplanung */}
      <section aria-labelledby="category-budgets">
        <div className="rounded-card border border-line bg-surface p-5 shadow-card">
          <h2 id="category-budgets" className="text-lg font-medium mb-1">
            {t("dashboard.categoryBudgetsTitle")}
          </h2>
          <p className="text-xs text-ink-muted mb-4">{t("dashboard.categoryBudgetsSubtitle")}</p>
          {loading ? (
            <div className="grid gap-2 lg:grid-cols-2">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : categoryBudgets.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("dashboard.categoryBudgetsEmpty")}</p>
          ) : (
            <>
              {overBudgetCategories.length === 0 && (
                <p className="text-xs text-income mb-3">{t("dashboard.categoryBudgetsAllOk")}</p>
              )}
              <ul className="grid gap-2 lg:grid-cols-2">
                {topBudgets.map(renderBudgetItem)}
              </ul>
              {moreBudgets.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer select-none text-sm font-medium text-brand">
                    {t("dashboard.budgetsShowAll", { count: moreBudgets.length })}
                  </summary>
                  <ul className="mt-2 grid gap-2 lg:grid-cols-2">
                    {moreBudgets.map(renderBudgetItem)}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      </section>

      {/* Ausgaben nach Kategorie (Doughnut) */}
      <section aria-labelledby="outgoing-chart">
        <div className="rounded-card border border-line p-4 bg-surface shadow-card">
          <h2 id="outgoing-chart" className="text-lg font-medium mb-3">
            {t("dashboard.outgoingsByCategory")}
          </h2>
          {loading ? (
            <div className="mx-auto w-full max-w-md space-y-3">
              <Skeleton className="mx-auto h-44 w-44 rounded-full" />
              <Skeleton className="h-3 w-full" />
            </div>
          ) : outgoingValues.length > 0 ? (
            <div className="mx-auto w-full max-w-md">
              <Doughnut data={doughnutData} options={doughnutOptions} />
            </div>
          ) : (
            <p className="text-sm text-ink-muted">{t("dashboard.noOutgoings")}</p>
          )}
        </div>
      </section>

      {/* Recurring + Savings — paired side by side on lg+ */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      {/* Recurring Transactions Section — "Steht noch an" sichtbar, Gesamtliste einklappbar */}
      <section aria-labelledby="recurring-overview">
        <div className="rounded-card border border-line bg-surface p-5 shadow-card">
          <h2 id="recurring-overview" className="text-lg font-medium mb-1">
            {t("dashboard.recurringOverview")}
          </h2>
          <p className="text-xs text-ink-muted mb-3">
            {t("dashboard.recurringSubtitle")}
          </p>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : recurringTransactions.length > 0 ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                {t("dashboard.upcomingTitle")}
              </p>
              {upcomingRecurring.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {upcomingRecurring.slice(0, 5).map(renderRecurringItem)}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">{t("dashboard.upcomingNone")}</p>
              )}
              <details className="mt-4">
                <summary className="cursor-pointer select-none text-sm font-medium text-brand">
                  {t("dashboard.recurringShowAll", { count: recurringTransactions.length })}
                </summary>
                <div className="mt-3">
                  <div className="grid gap-4 sm:grid-cols-2 mb-4">
                    <div>
                      <p className="text-sm text-ink-muted">{t("dashboard.recurringIncome")}</p>
                      <p className="text-amount-lg font-semibold tabular-nums text-income">
                        {formatCurrency(recurringIncomeTotal)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-ink-muted">{t("dashboard.recurringOutcome")}</p>
                      <p className="text-amount-lg font-semibold tabular-nums text-expense">
                        {formatCurrency(recurringOutcomeTotal)}
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {recurringTransactions.map(renderRecurringItem)}
                  </ul>
                </div>
              </details>
            </>
          ) : (
            <p className="text-sm text-ink-muted">{t("dashboard.noRecurring")}</p>
          )}
        </div>
      </section>

      <section aria-labelledby="savings-overview">
        <div className="rounded-card border border-line bg-surface p-5 shadow-card">
          <h2 id="savings-overview" className="text-lg font-medium mb-4">
            {t("dashboard.savingsOverview")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-ink-muted">{t("dashboard.plannedSavings")}</p>
              <p className="text-amount-lg font-semibold tabular-nums" style={{ color: plannedColor }}>{plannedSavings.toFixed(0)} €</p>
              <p className="text-xs text-ink-muted">{t("dashboard.targetForMonth")}</p>
            </div>
            <div>
              <p className="text-sm text-ink-muted">{t("dashboard.actualSaved")}</p>
              <p className="text-amount-lg font-semibold tabular-nums" style={{ color: actualSavings >= 0 ? actualColor : "#8a6116" }}>{actualSavings.toFixed(0)} €</p>
              <p className="text-xs text-ink-muted">
                {actualSavings >= 0
                  ? t("dashboard.percentOfTarget", { percent: savingsProgress })
                  : t("dashboard.savingsNetWithdrawn")}
              </p>
            </div>
            <div>
              <p className="text-sm text-ink-muted">{t("dashboard.recommendedSavings")}</p>
              <p className={`text-amount-lg font-semibold tabular-nums ${savingOnTrack ? "text-income" : "text-warning"}`}>
                {suggestedMonthly.toFixed(0)} €
              </p>
              <p className="text-xs text-ink-muted">{t("dashboard.recommendedSavingsHint")}</p>
            </div>
          </div>
          <div className="mt-5">
            <p className="text-xs font-medium text-ink-muted">{t("dashboard.progress")}</p>
            <div className="mt-2 h-2 w-full rounded bg-surface-2" aria-hidden="true">
              <div
                className="h-2 rounded"
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
            <div className={`mt-4 rounded-field border px-3 py-2 text-xs ${savingOnTrack
              ? "border-success/30 bg-success-soft text-success"
              : "border-warning/30 bg-warning-soft text-warning"
            }`}>
              <p className="font-medium">
                {savingOnTrack
                  ? t("dashboard.savingOnTrack")
                  : t("dashboard.savingShortfall", { shortfall: formatCurrency(savingShortfall) })}
              </p>
              {savingPlan.nextDeadline && (
                <p className="mt-0.5 text-[11px] opacity-80">
                  {t("dashboard.savingNextDeadline", {
                    date: new Date(savingPlan.nextDeadline.year, savingPlan.nextDeadline.month - 1, 1)
                      .toLocaleDateString(dateLocale, { month: "long", year: "numeric" })
                  })}
                </p>
              )}
            </div>
          )}
          {completedGoals.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="text-sm font-medium text-ink">
                {t("dashboard.completedGoalsTitle")}
              </p>
              <ul className="mt-2 space-y-2">
                {completedGoals.map((goal, idx) => {
                  const diff = goal.spent - goal.target;
                  return (
                    <li key={idx} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink-muted">{goal.title}</p>
                        <p className="text-xs text-ink-muted">
                          {new Date(goal.completedAt).toLocaleDateString(dateLocale, { day: "numeric", month: "long" })}
                          {" · "}
                          {t("dashboard.completedGoalTarget", { amount: formatCurrency(goal.target) })}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-savings">
                          {formatCurrency(goal.spent)}
                        </p>
                        {diff !== 0 && (
                          <p className={`text-xs ${diff > 0 ? "text-warning" : "text-income"}`}>
                            {diff > 0
                              ? t("dashboard.completedGoalOver", { amount: formatCurrency(diff) })
                              : t("dashboard.completedGoalUnder", { amount: formatCurrency(-diff) })}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs text-ink-muted">
                {t("dashboard.completedGoalsTotal", { amount: formatCurrency(completedGoalsSpent) })}
              </p>
            </div>
          )}
        </div>
      </section>
      </div>

      {/* Quarterly Overview Section — eingeklappt: die Tiefe lebt auf /review */}
      <section aria-labelledby="quarterly-overview">
        <details className="rounded-card border border-line bg-surface shadow-card group">
          <summary className="flex items-center justify-between cursor-pointer p-5 select-none list-none [&::-webkit-details-marker]:hidden">
            <div>
              <h2 id="quarterly-overview" className="text-lg font-medium mb-1">
                {t("dashboard.quarterlyOverview")}
              </h2>
              <p className="text-xs text-ink-muted">{t("dashboard.quarterlySubtitle")}</p>
            </div>
            <svg className="w-5 h-5 text-ink-muted transition-transform group-open:rotate-180 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="px-5 pb-5">

          {quarterlyLoading ? (
            <p className="text-sm text-ink-muted">{t("dashboard.quarterlyLoading")}</p>
          ) : quarterlyError ? (
            <p className="text-sm text-danger">{quarterlyError}</p>
          ) : quarterly && quarterly.quarters.length > 0 ? (
            <>
              {/* Bar Chart - Responsive height */}
              <div className="h-48 sm:h-64 mb-4 sm:mb-6">
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
                        backgroundColor: "#2e7d54",
                        borderRadius: 4
                      },
                      {
                        label: t("dashboard.quarterlyOutcome"),
                        data: quarterly.quarters.map(q => q.outcomeCents / 100),
                        backgroundColor: "#a85a51",
                        borderRadius: 4
                      },
                      {
                        label: t("dashboard.quarterlySavings"),
                        data: quarterly.quarters.map(q => q.savingsCents / 100),
                        backgroundColor: "#4e6fa3",
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
                      datalabels: {
                        display: false
                      }
                    },
                    scales: {
                      x: { grid: { display: false } },
                      y: {
                        beginAtZero: true,
                        ticks: {
                          callback: (value) => `${Number(value).toLocaleString(dateLocale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`
                        },
                        grid: { color: "rgba(139,139,134,0.35)" }
                      }
                    }
                  }}
                />
              </div>
              
              {/* MoM deltas (F): current month vs. previous month */}
              {momDeltas && (
                <div className="mb-4 grid gap-2 sm:grid-cols-3" aria-label={t("dashboard.momDelta")}>
                  <p className="col-span-full text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                    {t("dashboard.momDelta")}
                  </p>
                  {([
                    ["quarterlyIncome", momDeltas.income, "emerald"],
                    ["quarterlyOutcome", momDeltas.outcome, "red"],
                    ["quarterlySavings", momDeltas.savings, "blue"]
                  ] as const).map(([labelKey, d, _color]) => {
                    const positive = d.absDiff > 0;
                    const neutral = d.absDiff === 0;
                    // For income/savings: positive = good (green). For outcome: positive = bad (red).
                    const goodDirection = labelKey === "quarterlyOutcome" ? !positive : positive;
                    const colorClass = neutral
                      ? "text-ink-muted"
                      : goodDirection
                        ? "text-income"
                        : "text-expense";
                    const sign = positive ? "+" : "";
                    return (
                      <div key={labelKey} className="rounded-field border border-line bg-surface-2 px-3 py-2">
                        <p className="text-xs text-ink-muted">{t(`dashboard.${labelKey}`)}</p>
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

              {/* Summary Table - Mobile optimized with horizontal scroll */}
              <div className="-mx-5 px-5 sm:mx-0 sm:px-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[320px] text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-line">
                        <th className="py-2 pr-2 text-left font-medium text-ink-muted whitespace-nowrap"></th>
                        {quarterly.quarters.map(q => (
                          <th key={`${q.year}-${q.month}`} className="py-2 px-1 sm:px-2 text-right font-medium text-ink-muted whitespace-nowrap">
                            {new Date(q.year, q.month - 1, 1).toLocaleDateString(dateLocale, { month: "short" })}
                          </th>
                        ))}
                        <th className="py-2 pl-2 text-right font-semibold text-ink whitespace-nowrap">{t("dashboard.quarterlyTotal")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-line">
                        <td className="py-2 pr-2 text-ink-muted whitespace-nowrap">{t("dashboard.quarterlyIncome")}</td>
                        {quarterly.quarters.map(q => (
                          <td key={`inc-${q.year}-${q.month}`} className="py-2 px-1 sm:px-2 text-right text-income whitespace-nowrap tabular-nums">
                            {formatCurrency(q.incomeCents / 100)}
                          </td>
                        ))}
                        <td className="py-2 pl-2 text-right font-semibold text-income whitespace-nowrap tabular-nums">
                          {formatCurrency(quarterly.totals.incomeCents / 100)}
                        </td>
                      </tr>
                      <tr className="border-b border-line">
                        <td className="py-2 pr-2 text-ink-muted whitespace-nowrap">{t("dashboard.quarterlyOutcome")}</td>
                        {quarterly.quarters.map(q => (
                          <td key={`out-${q.year}-${q.month}`} className="py-2 px-1 sm:px-2 text-right text-expense whitespace-nowrap tabular-nums">
                            {formatCurrency(q.outcomeCents / 100)}
                          </td>
                        ))}
                        <td className="py-2 pl-2 text-right font-semibold text-expense whitespace-nowrap tabular-nums">
                          {formatCurrency(quarterly.totals.outcomeCents / 100)}
                        </td>
                      </tr>
                      <tr className="border-b border-line">
                        <td className="py-2 pr-2 text-ink-muted whitespace-nowrap">{t("dashboard.quarterlySavings")}</td>
                        {quarterly.quarters.map(q => (
                          <td key={`sav-${q.year}-${q.month}`} className="py-2 px-1 sm:px-2 text-right text-savings whitespace-nowrap tabular-nums">
                            {formatCurrency(q.savingsCents / 100)}
                          </td>
                        ))}
                        <td className="py-2 pl-2 text-right font-semibold text-savings whitespace-nowrap tabular-nums">
                          {formatCurrency(quarterly.totals.savingsCents / 100)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-2 text-ink-muted whitespace-nowrap">{t("dashboard.quarterlyBalance")}</td>
                        {quarterly.quarters.map(q => (
                          <td key={`bal-${q.year}-${q.month}`} className={`py-2 px-1 sm:px-2 text-right whitespace-nowrap tabular-nums ${q.balanceCents >= 0 ? "text-ink-muted" : "text-expense"}`}>
                            {formatCurrency(q.balanceCents / 100)}
                          </td>
                        ))}
                        <td className="py-2 pl-2 text-right font-semibold text-ink whitespace-nowrap">—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-muted">{t("dashboard.quarterlyLoading")}</p>
          )}
          </div>
        </details>
      </section>

      </PageContainer>
    </main>
  );
}