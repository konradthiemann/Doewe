"use client";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  Title,
  PointElement,
  LineElement
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { useEffect, useMemo, useState } from "react";
import { Doughnut, Line } from "react-chartjs-2";

import TransactionForm from "../components/TransactionForm";

import type { Context as DataLabelsContext } from "chartjs-plugin-datalabels";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  Title,
  PointElement,
  LineElement,
  ChartDataLabels
);

export default function HomePage() {
  const [showTxModal, setShowTxModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<{
    incomeTotal: number;
    outcomeTotal: number;
    remaining: number;
    plannedSavings: number;
    monthlySavingsActual: number;
    outgoingByCategory: Array<{ id: string; name: string; amount: number }>;
    daily?: { labels: string[]; income: number[]; outcome: number[]; savings: number[] };
  }>({ incomeTotal: 0, outcomeTotal: 0, remaining: 0, plannedSavings: 0, monthlySavingsActual: 0, outgoingByCategory: [] });

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
    ...(remainingSlice > 0 ? ["Remaining (left)"] : []),
    ...(actualSavingsSlice > 0 ? ["Actual savings"] : []),
    ...(remainingToSaveSlice > 0 ? ["Remaining to save"] : [])
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

  // Daily line chart for current month (income vs outcome vs global savings)
  const lineDailyData = summary.daily || { labels: [], income: [], outcome: [], savings: [] };
  const lineDailyChart = {
    labels: lineDailyData.labels,
    datasets: [
      {
        label: "Income",
        data: lineDailyData.income,
        borderColor: "#16A34A",
        backgroundColor: "#16A34A",
        tension: 0.25
      },
      {
        label: "Outcome",
        data: lineDailyData.outcome,
        borderColor: "#DC2626",
        backgroundColor: "#DC2626",
        tension: 0.25
      },
      {
        label: "Savings",
        data: lineDailyData.savings,
        borderColor: "#3B82F6",
        backgroundColor: "#3B82F6",
        tension: 0.25
      }
    ]
  };
  const lineDailyOptions = {
    responsive: true,
    plugins: {
      legend: { position: "top" as const },
      title: { display: true, text: "Current month: income vs. outcome vs. savings" }
    },
    scales: {
      y: { beginAtZero: true }
    }
  };

  // Planned vs Actual savings cards
  const plannedSavings = summary.plannedSavings;
  const actualSavings = summary.monthlySavingsActual || 0;
  const plannedColor = "#6366F1"; // indigo
  const actualColor = "#16A34A"; // green
  const savingsProgress = Math.min(100, Math.round((actualSavings / plannedSavings) * 100));

  const doughnutOptions = {
    plugins: {
      legend: { position: "right" as const },
      datalabels: {
        color: "#111827",
        formatter: (_val: number, ctx: DataLabelsContext) => {
          const labels = (ctx.chart.data.labels || []) as string[];
          const i = typeof ctx.dataIndex === "number" ? ctx.dataIndex : 0;
          return labels[i] || "";
        },
        font: { weight: "bold" as const }
      }
    }
  };

  return (
    <main id="maincontent" className="p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        Visual overview using current month transactions (demo seed values). Replace with live aggregates later.
      </p>

      <section aria-labelledby="outgoing-chart" className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="rounded-md border border-gray-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
          <h2 id="outgoing-chart" className="text-lg font-medium mb-3">
            Outgoings by category (pie)
          </h2>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : outgoingValues.length > 0 ? (
            <Doughnut data={doughnutData} options={doughnutOptions} />
          ) : (
            <p className="text-sm text-gray-500">No outgoings this month.</p>
          )}
        </div>

        <div className="rounded-md border border-gray-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
          <h2 className="text-lg font-medium mb-3">Daily view (income, outcome, savings)</h2>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : lineDailyData.labels.length ? (
            <Line data={lineDailyChart} options={lineDailyOptions} />
          ) : (
            <p className="text-sm text-gray-500">No data for this month.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="savings-cards" className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-md border border-gray-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
          <h3 id="savings-cards" className="text-lg font-medium mb-2">Planned savings</h3>
          <p className="text-2xl font-semibold" style={{ color: plannedColor }}>{plannedSavings.toFixed(0)} €</p>
          <p className="text-sm text-gray-500">Target for this month</p>
        </div>
        <div className="rounded-md border border-gray-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
          <h3 className="text-lg font-medium mb-2">Actual saved</h3>
          <p className="text-2xl font-semibold" style={{ color: actualColor }}>{actualSavings.toFixed(0)} €</p>
          <p className="text-sm text-gray-500">{savingsProgress}% of target</p>
          <div className="mt-3 h-2 w-full rounded bg-gray-200 dark:bg-neutral-800" aria-hidden="true">
            <div
              className="h-2 rounded"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={savingsProgress}
              aria-label="Monthly savings progress"
              style={{ width: `${savingsProgress}%`, backgroundColor: actualColor }}
            />
          </div>
        </div>
      </section>

      {/* Floating Action Button */}
      <button
        type="button"
        aria-label="Add transaction"
        onClick={() => setShowTxModal(true)}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-2xl shadow-lg focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
      >
        +
      </button>

      {/* Modal Dialog */}
      {showTxModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="tx-dialog-title">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowTxModal(false)} />
          <div className="relative z-10 w-full max-w-md mx-4">
              <TransactionForm
                onSuccess={async () => {
                  await fetchSummary();
                }}
                onClose={() => setShowTxModal(false)}
              />
          </div>
        </div>
      )}
    </main>
  );
}