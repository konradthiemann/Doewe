"use client";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  PointElement,
  LineElement
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { useEffect, useMemo, useState } from "react";
import { Doughnut, Bar, Line } from "react-chartjs-2";

import type { Context as DataLabelsContext } from "chartjs-plugin-datalabels";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  PointElement,
  LineElement,
  ChartDataLabels
);

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<{
    incomeTotal: number;
    outcomeTotal: number;
    remaining: number;
    plannedSavings: number;
    actualSavings: number;
    outgoingByCategory: Array<{ id: string; name: string; amount: number }>;
  }>({ incomeTotal: 0, outcomeTotal: 0, remaining: 0, plannedSavings: 0, actualSavings: 0, outgoingByCategory: [] });

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/analytics/summary", { cache: "no-store" });
      const data = res.ok ? await res.json() : undefined;
      if (data) setSummary(data);
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

  // Colors for outgoings (no greens to avoid conflict with "remaining")
  const outgoingColors = [
    "#6366F1", // indigo
    "#F59E0B", // amber
    "#EF4444", // red
    "#8B5CF6", // violet
    "#06B6D4", // cyan
    "#F97316", // orange
    "#A855F7", // purple
    "#0EA5E9", // sky
    "#E11D48", // rose
    "#D946EF", // fuchsia
    "#9333EA", // purple deeper
    "#FB7185"  // rose lighter
  ];

  const doughnutData = {
    labels: outgoingLabels,
    datasets: [
      {
        label: "Outgoings (€)",
        data: outgoingValues,
        backgroundColor: outgoingLabels.map((_, i) => outgoingColors[i % outgoingColors.length]),
        borderWidth: 0
      }
    ]
  };

  const { incomeTotal, outcomeTotal } = summary;
  const remaining = Math.round((summary.remaining) * 100) / 100;
  const remainingColor = remaining >= 0 ? "#16A34A" : "#DC2626";

  const barData = {
    labels: ["Income (total)", "Outcome (total)", "Remaining"] as string[],
    datasets: [
      {
        label: "Income",
        data: [incomeTotal, 0, 0],
        backgroundColor: "#22C55E"
      },
      {
        label: "Outcome",
        data: [0, outcomeTotal, 0],
        backgroundColor: "#EF4444"
      },
      {
        label: "Remaining",
        data: [0, 0, Math.abs(remaining)],
        backgroundColor: remainingColor
      }
    ]
  };

  const barOptions = {
    responsive: true,
    plugins: {
      legend: { position: "top" as const },
      title: { display: true, text: "Current month: income vs. outcome" }
    },
    scales: {
      y: { beginAtZero: true }
    }
  };

  // Planned vs Actual savings cards (demo numbers)
  const plannedSavings = summary.plannedSavings;
  const actualSavings = summary.actualSavings;
  const plannedColor = "#6366F1"; // indigo
  const actualColor = "#16A34A"; // green
  const savingsProgress = Math.min(100, Math.round((actualSavings / plannedSavings) * 100));

  // Savings line chart (current year, dummy values)
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const aimedSeries = [400,450,500,550,600,600,600,600,600,600,600,600];
  const actualSeries = [350,420,480,500,550,500,520,560,590,610,0,0];
  const lineData = {
    labels: months,
    datasets: [
      {
        label: "Aimed savings",
        data: aimedSeries,
        borderColor: plannedColor,
        backgroundColor: plannedColor,
        tension: 0.25
      },
      {
        label: "Actual savings",
        data: actualSeries,
        borderColor: actualColor,
        backgroundColor: actualColor,
        tension: 0.25
      }
    ]
  };

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
          <h2 className="text-lg font-medium mb-3">Current month income vs. outcome</h2>
          <Bar data={barData} options={barOptions} />
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
          <div className="mt-3 h-2 w-full rounded bg-gray-200 dark:bg-neutral-800">
            <div className="h-2 rounded" style={{ width: `${savingsProgress}%`, backgroundColor: actualColor }} />
          </div>
        </div>
      </section>

      <section aria-labelledby="savings-line" className="rounded-md border border-gray-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
        <h2 id="savings-line" className="text-lg font-medium mb-3">Savings this year</h2>
        <Line data={lineData} />
      </section>
    </main>
  );
}