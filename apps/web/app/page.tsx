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

    (async () => {
      await Promise.all([fetchSummary(), fetchQuarterly()]);
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
  const projectedIncome = Math.max(0, summary.projectedIncomeTotal ?? (summary.incomeTotal + (summary.recurringIncomeTotal || 0)));
  const projectedOutcome = Math.max(0, summary.projectedOutcomeTotal ?? (summary.outcomeTotal + (summary.recurringOutcomeTotal || 0)));
  const totalSavingsTransfer = Math.max(0, summary.monthlySavingsActual || 0);
  const projectedSpent = projectedOutcome + totalSavingsTransfer;
  const projectedLeft = Math.max(0, projectedIncome - projectedSpent);
  const spentPercent = projectedIncome > 0 ? Math.min(100, Math.round((projectedSpent / projectedIncome) * 100)) : 0;
  const leftPercent = projectedIncome > 0 ? Math.max(0, 100 - spentPercent) : 0;
  const overspent = projectedIncome > 0 ? Math.max(0, projectedSpent - projectedIncome) : projectedSpent;
  const overspentPercent = projectedIncome > 0 ? Math.max(0, Math.round((overspent / projectedIncome) * 100)) : 0;
  const hasIncomeData = projectedIncome > 0;

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
  // Distribute colors to reduce adjacent similarity by stepping through palette
  const step = 5; // co-prime with warmPalette.length for better spread
  const outColors = outgoingLabels.map((_, i) => warmPalette[(i * step) % warmPalette.length]);

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
      {/* Account Balance & Carryover Section */}
      <section aria-labelledby="balance-overview" className="max-w-3xl">
        <div className="rounded-md border border-gray-200 dark:border-neutral-800 bg-white p-5 dark:bg-neutral-900">
          <h2 id="balance-overview" className="text-lg font-medium mb-4">
            {t("dashboard.balanceOverview")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.totalBalance")}</p>
              <p className={`text-2xl font-semibold ${summary.totalBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {formatCurrency(summary.totalBalance)}
              </p>
              <p className="text-xs text-gray-500 dark:text-neutral-400">{t("dashboard.totalBalanceHint")}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.carryoverFromLastMonth")}</p>
              <p className={`text-2xl font-semibold ${summary.carryoverFromLastMonth >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"}`}>
                {formatCurrency(summary.carryoverFromLastMonth)}
              </p>
              <p className="text-xs text-gray-500 dark:text-neutral-400">{t("dashboard.carryoverHint")}</p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="outgoing-chart" className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="rounded-md border border-gray-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
          <h2 id="outgoing-chart" className="text-lg font-medium mb-3">
            {t("dashboard.outgoingsByCategory")}
          </h2>
          {loading ? (
            <p className="text-sm text-gray-500">{t("dashboard.loading")}</p>
          ) : outgoingValues.length > 0 ? (
            <Doughnut data={doughnutData} options={doughnutOptions} />
          ) : (
            <p className="text-sm text-gray-500">{t("dashboard.noOutgoings")}</p>
          )}
        </div>

        <div className="rounded-md border border-gray-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
          <h2 id="income-usage-heading" className="text-lg font-medium mb-1">
            {t("dashboard.monthlyIncomeUsage")}
          </h2>
          <p className="text-xs text-gray-500 dark:text-neutral-400 mb-3">{t("dashboard.incomeUsageSubtitle")}</p>
          {loading ? (
            <p className="text-sm text-gray-500">{t("dashboard.loading")}</p>
          ) : hasIncomeData ? (
            <figure aria-labelledby="income-usage-heading income-usage-summary" className="space-y-4">
              {/* Progress bar: green background (income = 100%), red fill (outcome %) */}
              <div className="space-y-2">
                <div className="relative w-full h-8 rounded-full overflow-hidden bg-emerald-500 dark:bg-emerald-600">
                  <div
                    className="absolute inset-y-0 left-0 rounded-l-full bg-red-500 dark:bg-red-600 transition-all duration-500"
                    style={{ width: `${Math.min(100, spentPercent)}%` }}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={spentPercent}
                    aria-label={t("dashboard.incomeUsageTitle")}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow">
                    {spentPercent}%
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-600 dark:text-neutral-400">
                  <span>{t("dashboard.spent")}: {formatCurrency(projectedSpent)}</span>
                  <span>{t("dashboard.left")}: {formatCurrency(projectedLeft)}</span>
                </div>
              </div>
              <figcaption id="income-usage-summary" className="space-y-3 text-sm text-gray-700 dark:text-neutral-300">
                <dl className="grid gap-3 sm:grid-cols-3" aria-label={t("dashboard.incomeReportBreakdown")}>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-800 dark:border-neutral-700 dark:bg-neutral-800/70 dark:text-neutral-200">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">{t("dashboard.spent")}</dt>
                    <dd className="text-lg font-semibold text-red-600 dark:text-red-400">{formatCurrency(projectedSpent)}</dd>
                    <p className="text-xs text-slate-600 dark:text-neutral-400">
                      {t("dashboard.spentOfIncome", { percent: spentPercent })}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-800 dark:border-neutral-700 dark:bg-neutral-800/70 dark:text-neutral-200">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">{t("dashboard.left")}</dt>
                    <dd className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(projectedLeft)}</dd>
                    <p className="text-xs text-slate-600 dark:text-neutral-400">
                      {projectedLeft > 0
                        ? t("dashboard.leftAvailable", { percent: leftPercent })
                        : t("dashboard.fullyAllocated")}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-800 dark:border-neutral-700 dark:bg-neutral-800/70 dark:text-neutral-200">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">{t("dashboard.overspend")}</dt>
                    <dd className={`text-lg font-semibold ${overspent > 0 ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-neutral-400"}`}>
                      {overspent > 0 ? formatCurrency(overspent) : t("dashboard.zeroEuro")}
                    </dd>
                    <p className="text-xs text-slate-600 dark:text-neutral-400">
                      {overspent > 0
                        ? t("dashboard.overspendAboveIncome", { percent: overspentPercent })
                        : t("dashboard.noOverspend")}
                    </p>
                  </div>
                </dl>
                <p>
                  {t("dashboard.spentSummary", {
                    spent: formatCurrency(projectedSpent),
                    income: formatCurrency(projectedIncome)
                  })}
                  {projectedLeft > 0 && ` ${t("dashboard.leftSummary", { left: formatCurrency(projectedLeft) })}`}
                  {overspent > 0 && ` ${t("dashboard.overspentSummary", { overspent: formatCurrency(overspent) })}`}
                </p>
              </figcaption>
            </figure>
          ) : (
            <p className="text-sm text-gray-500">{t("dashboard.addIncomeTransactions")}</p>
          )}
        </div>
      </section>

      {/* Recurring Transactions Section */}
      <section aria-labelledby="recurring-overview" className="max-w-3xl">
        <details className="rounded-md border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 group">
          <summary className="flex items-center justify-between cursor-pointer p-5 select-none list-none [&::-webkit-details-marker]:hidden">
            <div>
              <h2 id="recurring-overview" className="text-lg font-medium mb-1">
                {t("dashboard.recurringOverview")}
              </h2>
              <p className="text-xs text-gray-500 dark:text-neutral-400">
                {t("dashboard.recurringSubtitle")}
              </p>
            </div>
            <svg className="w-5 h-5 text-gray-500 dark:text-neutral-400 transition-transform group-open:rotate-180 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                  <p className="text-2xl font-semibold text-green-600 dark:text-green-400">
                    {formatCurrency(recurringIncomeTotal)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.recurringOutcome")}</p>
                  <p className="text-2xl font-semibold text-red-600 dark:text-red-400">
                    {formatCurrency(recurringOutcomeTotal)}
                  </p>
                </div>
              </div>

              <ul className="space-y-2">
                {recurringTransactions.map((rec) => (
                  <li key={rec.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-neutral-700 dark:bg-neutral-800">
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
                    <span className={`text-sm font-semibold ml-3 ${
                      rec.amountCents < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
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

      <section aria-labelledby="savings-overview" className="max-w-3xl">
        <div className="rounded-md border border-gray-200 dark:border-neutral-800 bg-white p-5 dark:bg-neutral-900">
          <h2 id="savings-overview" className="text-lg font-medium mb-4">
            {t("dashboard.savingsOverview")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.plannedSavings")}</p>
              <p className="text-2xl font-semibold" style={{ color: plannedColor }}>{plannedSavings.toFixed(0)} €</p>
              <p className="text-xs text-gray-500 dark:text-neutral-400">{t("dashboard.targetForMonth")}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.actualSaved")}</p>
              <p className="text-2xl font-semibold" style={{ color: actualColor }}>{actualSavings.toFixed(0)} €</p>
              <p className="text-xs text-gray-500 dark:text-neutral-400">
                {t("dashboard.percentOfTarget", { percent: savingsProgress })}
              </p>
            </div>
          </div>
          <div className="mt-5">
            <p className="text-xs font-medium text-gray-500 dark:text-neutral-400">{t("dashboard.progress")}</p>
            <div className="mt-2 h-2 w-full rounded bg-gray-200 dark:bg-neutral-800" aria-hidden="true">
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
        </div>
      </section>

      {/* Quarterly Overview Section */}
      <section aria-labelledby="quarterly-overview" className="max-w-4xl">
        <div className="rounded-md border border-gray-200 dark:border-neutral-800 bg-white p-5 dark:bg-neutral-900">
          <h2 id="quarterly-overview" className="text-lg font-medium mb-1">
            {t("dashboard.quarterlyOverview")}
          </h2>
          <p className="text-xs text-gray-500 dark:text-neutral-400 mb-4">{t("dashboard.quarterlySubtitle")}</p>
          
          {quarterlyLoading ? (
            <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.quarterlyLoading")}</p>
          ) : quarterlyError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{quarterlyError}</p>
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
                        grid: { color: "rgba(203,213,225,0.4)" }
                      }
                    }
                  }}
                />
              </div>
              
              {/* Summary Table - Mobile optimized with horizontal scroll */}
              <div className="-mx-5 px-5 sm:mx-0 sm:px-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[320px] text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-neutral-700">
                        <th className="py-2 pr-2 text-left font-medium text-gray-500 dark:text-neutral-400 whitespace-nowrap"></th>
                        {quarterly.quarters.map(q => (
                          <th key={`${q.year}-${q.month}`} className="py-2 px-1 sm:px-2 text-right font-medium text-gray-500 dark:text-neutral-400 whitespace-nowrap">
                            {new Date(q.year, q.month - 1, 1).toLocaleDateString(dateLocale, { month: "short" })}
                          </th>
                        ))}
                        <th className="py-2 pl-2 text-right font-semibold text-gray-700 dark:text-neutral-200 whitespace-nowrap">{t("dashboard.quarterlyTotal")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-100 dark:border-neutral-800">
                        <td className="py-2 pr-2 text-gray-700 dark:text-neutral-300 whitespace-nowrap">{t("dashboard.quarterlyIncome")}</td>
                        {quarterly.quarters.map(q => (
                          <td key={`inc-${q.year}-${q.month}`} className="py-2 px-1 sm:px-2 text-right text-emerald-600 dark:text-emerald-400 whitespace-nowrap tabular-nums">
                            {formatCurrency(q.incomeCents / 100)}
                          </td>
                        ))}
                        <td className="py-2 pl-2 text-right font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap tabular-nums">
                          {formatCurrency(quarterly.totals.incomeCents / 100)}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100 dark:border-neutral-800">
                        <td className="py-2 pr-2 text-gray-700 dark:text-neutral-300 whitespace-nowrap">{t("dashboard.quarterlyOutcome")}</td>
                        {quarterly.quarters.map(q => (
                          <td key={`out-${q.year}-${q.month}`} className="py-2 px-1 sm:px-2 text-right text-red-600 dark:text-red-400 whitespace-nowrap tabular-nums">
                            {formatCurrency(q.outcomeCents / 100)}
                          </td>
                        ))}
                        <td className="py-2 pl-2 text-right font-semibold text-red-600 dark:text-red-400 whitespace-nowrap tabular-nums">
                          {formatCurrency(quarterly.totals.outcomeCents / 100)}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100 dark:border-neutral-800">
                        <td className="py-2 pr-2 text-gray-700 dark:text-neutral-300 whitespace-nowrap">{t("dashboard.quarterlySavings")}</td>
                        {quarterly.quarters.map(q => (
                          <td key={`sav-${q.year}-${q.month}`} className="py-2 px-1 sm:px-2 text-right text-blue-600 dark:text-blue-400 whitespace-nowrap tabular-nums">
                            {formatCurrency(q.savingsCents / 100)}
                          </td>
                        ))}
                        <td className="py-2 pl-2 text-right font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap tabular-nums">
                          {formatCurrency(quarterly.totals.savingsCents / 100)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-2 text-gray-700 dark:text-neutral-300 whitespace-nowrap">{t("dashboard.quarterlyBalance")}</td>
                        {quarterly.quarters.map(q => (
                          <td key={`bal-${q.year}-${q.month}`} className={`py-2 px-1 sm:px-2 text-right whitespace-nowrap tabular-nums ${q.balanceCents >= 0 ? "text-gray-700 dark:text-neutral-300" : "text-red-600 dark:text-red-400"}`}>
                            {formatCurrency(q.balanceCents / 100)}
                          </td>
                        ))}
                        <td className="py-2 pl-2 text-right font-semibold text-gray-700 dark:text-neutral-200 whitespace-nowrap">—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500 dark:text-neutral-400">{t("dashboard.quarterlyLoading")}</p>
          )}
        </div>
      </section>

    </main>
  );
}