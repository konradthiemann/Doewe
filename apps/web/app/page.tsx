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
  }>({ totalBalance: 0, carryoverFromLastMonth: 0, incomeTotal: 0, outcomeTotal: 0, remaining: 0, plannedSavings: 0, monthlySavingsActual: 0, outgoingByCategory: [] });

  async function fetchSummary() {
    const res = await fetch("/api/analytics/summary", { cache: "no-store" });
    const data = res.ok ? await res.json() : undefined;
    if (data) setSummary(data);
  }

  useEffect(() => {
    (async () => {
      await fetchSummary();
      setLoading(false);
    })();
  }, []);

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

  // Totals and remaining for current month
  const remaining = Math.round(summary.remaining * 100) / 100;
  const totalIncome = Math.max(0, summary.incomeTotal || 0);
  const totalOutcome = Math.max(0, summary.outcomeTotal || 0);
  const totalSavingsTransfer = Math.max(0, summary.monthlySavingsActual || 0);
  const spentActual = Math.max(0, totalOutcome + totalSavingsTransfer);
  const leftActual = Math.max(0, summary.remaining || 0);
  const clampedRemaining = Math.max(0, Math.min(totalIncome, leftActual));
  const spentForChart = totalIncome > 0 ? Math.min(spentActual, totalIncome) : 0;
  const leftForChart = totalIncome > 0 ? Math.max(0, totalIncome - spentForChart) : 0;
  const overspent = totalIncome > 0 ? Math.max(0, spentActual - totalIncome) : spentActual;
  const spentPercent = totalIncome > 0 ? Math.round((spentActual / totalIncome) * 100) : 0;
  const leftPercent = totalIncome > 0 ? Math.max(0, Math.round((clampedRemaining / totalIncome) * 100)) : 0;
  const overspentPercent = totalIncome > 0 ? Math.max(0, Math.round((overspent / totalIncome) * 100)) : 0;
  const hasIncomeData = totalIncome > 0;

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

  // Additional slices: Remaining (left), Actual savings (blue), Remaining to save (greyish blue)
  const remainingSlice = Math.max(0, remaining);
  const remainingColorPie = "#6BAA75"; // greyish green for money left
  const actualSavingsSlice = Math.max(0, Math.min(summary.monthlySavingsActual || 0, Number.POSITIVE_INFINITY));
  const remainingToSaveSlice = Math.max(0, summary.plannedSavings - (summary.monthlySavingsActual || 0));
  const actualSavingsColor = "#3B82F6"; // blue-500
  const remainingToSaveColor = "#64748B"; // slate-500 (greyish blue)

  const doughnutLabels = [
    ...outgoingLabels,
    ...(remainingSlice > 0 ? [t("dashboard.doughnutRemainingLeft")] : []),
    ...(actualSavingsSlice > 0 ? [t("dashboard.doughnutActualSavings")] : []),
    ...(remainingToSaveSlice > 0 ? [t("dashboard.doughnutRemainingToSave")] : [])
  ];

  const doughnutValues = [
    ...outgoingValues,
    ...(remainingSlice > 0 ? [remainingSlice] : []),
    ...(actualSavingsSlice > 0 ? [actualSavingsSlice] : []),
    ...(remainingToSaveSlice > 0 ? [remainingToSaveSlice] : [])
  ];

  const doughnutColors = [
    ...outColors,
    ...(remainingSlice > 0 ? [remainingColorPie] : []),
    ...(actualSavingsSlice > 0 ? [actualSavingsColor] : []),
    ...(remainingToSaveSlice > 0 ? [remainingToSaveColor] : [])
  ];

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
  const savingsProgress = Math.min(100, Math.round((actualSavings / plannedSavings) * 100));

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

  const incomeUsageData = {
    labels: [t("dashboard.currentMonthIncome")],
    datasets: [
      {
        label: t("dashboard.spent"),
        data: [hasIncomeData ? spentForChart : 0],
        backgroundColor: "#DC2626",
        borderRadius: 12
      },
      {
        label: t("dashboard.left"),
        data: [hasIncomeData ? leftForChart : 0],
        backgroundColor: "#16A34A",
        borderRadius: 12
      }
    ]
  };

  const incomeUsageOptions: ChartOptions<"bar"> = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          boxWidth: isMobile ? 12 : 18,
          font: { size: isMobile ? 10 : 12 }
        }
      },
      title: {
        display: true,
        text: t("dashboard.incomeUsageTitle")
      },
      datalabels: {
        color: "#111827",
        formatter: (value: number) => {
          if (!value) return "";
          return `${value.toLocaleString(dateLocale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
        },
        font: { size: isMobile ? 10 : 12, weight: "bold" as const }
      }
    },
    scales: {
      x: {
        stacked: true,
        beginAtZero: true,
        ticks: {
          callback: (value) => `${Number(value).toLocaleString(dateLocale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`
        },
        suggestedMax: hasIncomeData ? Math.max(totalIncome, spentForChart) : undefined,
        grid: { color: "rgba(203,213,225,0.4)" }
      },
      y: {
        stacked: true,
        grid: { display: false }
      }
    }
  };

  const formatCurrency = (value: number) =>
    `${value.toLocaleString(dateLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

  return (
    <main id="maincontent" className="p-6 space-y-8">
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
          <h2 id="income-usage-heading" className="text-lg font-medium mb-3">
            {t("dashboard.monthlyIncomeUsage")}
          </h2>
          {loading ? (
            <p className="text-sm text-gray-500">{t("dashboard.loading")}</p>
          ) : hasIncomeData ? (
            <figure aria-labelledby="income-usage-heading income-usage-summary" className="space-y-4">
              <div className="h-40">
                <Bar data={incomeUsageData} options={incomeUsageOptions} />
              </div>
              <figcaption id="income-usage-summary" className="space-y-3 text-sm text-gray-700 dark:text-neutral-300">
                <dl className="grid gap-3 sm:grid-cols-3" aria-label={t("dashboard.incomeReportBreakdown")}>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-800 dark:border-neutral-700 dark:bg-neutral-800/70 dark:text-neutral-200">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">{t("dashboard.spent")}</dt>
                    <dd className="text-lg font-semibold text-red-600 dark:text-red-400">{formatCurrency(spentActual)}</dd>
                    <p className="text-xs text-slate-600 dark:text-neutral-400">
                      {t("dashboard.spentOfIncome", { percent: spentPercent })}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-800 dark:border-neutral-700 dark:bg-neutral-800/70 dark:text-neutral-200">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">{t("dashboard.left")}</dt>
                    <dd className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(leftActual)}</dd>
                    <p className="text-xs text-slate-600 dark:text-neutral-400">
                      {leftActual > 0
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
                    spent: formatCurrency(spentActual),
                    income: formatCurrency(totalIncome)
                  })}
                  {leftActual > 0 && ` ${t("dashboard.leftSummary", { left: formatCurrency(leftActual) })}`}
                  {overspent > 0 && ` ${t("dashboard.overspentSummary", { overspent: formatCurrency(overspent) })}`}
                </p>
              </figcaption>
            </figure>
          ) : (
            <p className="text-sm text-gray-500">{t("dashboard.addIncomeTransactions")}</p>
          )}
        </div>
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

    </main>
  );
}