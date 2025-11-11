"use client";

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title
} from "chart.js";
import { Doughnut, Bar } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

export default function HomePage() {
  // Demo values (outgoings by category)
  const outgoingCategories = [
    "Clothing",
    "Hobbies",
    "Eating out",
    "Food order",
    "Cosmetics",
    "Drugstore",
    "Presents",
    "Mobility",
    "Special",
    "Health",
    "Interior",
    "Misc"
  ];
  const outgoingValues = [120, 80, 150, 60, 40, 35, 50, 100, 30, 25, 45, 20];

  const doughnutData = {
    labels: outgoingCategories,
    datasets: [
      {
        label: "Outgoings (€)",
        data: outgoingValues,
        backgroundColor: [
          "#6366F1",
          "#22C55E",
          "#F59E0B",
          "#EF4444",
          "#8B5CF6",
          "#14B8A6",
          "#A3E635",
          "#06B6D4",
          "#E11D48",
          "#F97316",
          "#84CC16",
          "#10B981"
        ],
        borderWidth: 0
      }
    ]
  };

  // Demo values (income vs outcome for current month)
  const incomeCategories = ["Salary 1", "Salary 2", "Child benefit", "Misc"];
  const incomeValues = [2500, 1500, 250, 100];
  const outcomeTotal = outgoingValues.reduce((a, b) => a + b, 0);

  const barData = {
    labels: ["Income (total)", "Outcome (total)"] as const,
    datasets: [
      {
        label: "Income",
        data: [incomeValues.reduce((a, b) => a + b, 0), 0],
        backgroundColor: "#22C55E"
      },
      {
        label: "Outcome",
        data: [0, outcomeTotal],
        backgroundColor: "#EF4444"
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

  return (
    <main id="maincontent" className="p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        Visual overview with demo data. Replace with live data as APIs evolve.
      </p>

      <section aria-labelledby="outgoing-chart" className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="rounded-md border border-gray-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
          <h2 id="outgoing-chart" className="text-lg font-medium mb-3">
            Outgoings by category (pie)
          </h2>
          <Doughnut data={doughnutData} />
          <p className="mt-2 text-xs text-gray-500 dark:text-neutral-400">
            Demo categories: {outgoingCategories.join(", ")}
          </p>
        </div>

        <div className="rounded-md border border-gray-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
          <h2 className="text-lg font-medium mb-3">Current month income vs. outcome</h2>
          <Bar data={barData} options={barOptions} />
          <p className="mt-2 text-xs text-gray-500 dark:text-neutral-400">
            Income demo: {incomeCategories.join(", ")}
          </p>
        </div>
      </section>
    </main>
  );
}