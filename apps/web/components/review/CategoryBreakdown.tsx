"use client";

import { computeCategoryBar } from "@doewe/shared";
import { useId, useState } from "react";

import { useI18n } from "../../lib/i18n";
import { budgetTone, ProgressBar } from "../ui/ProgressBar";

export type ReviewCategoryTransaction = {
  id: string;
  description: string;
  /** Positive expense amount in cents. */
  amountCents: number;
  occurredAt: string;
};

export type ReviewCategory = {
  id: string;
  name: string;
  spentCents: number;
  budgetCents: number | null;
  transactionCount: number;
  transactions: ReviewCategoryTransaction[];
};

export interface CategoryBreakdownProps {
  categories: ReviewCategory[];
  outcomeCents: number;
  formatCurrency: (cents: number) => string;
  dateLocale: string;
}

/** Expense categories with a bar each; tapping a row reveals its individual bookings. */
export function CategoryBreakdown({ categories, outcomeCents, formatCurrency, dateLocale }: CategoryBreakdownProps) {
  return (
    <ul className="space-y-3">
      {categories.map((cat) => (
        <CategoryRow
          key={cat.id}
          category={cat}
          outcomeCents={outcomeCents}
          formatCurrency={formatCurrency}
          dateLocale={dateLocale}
        />
      ))}
    </ul>
  );
}

function CategoryRow({
  category,
  outcomeCents,
  formatCurrency,
  dateLocale
}: { category: ReviewCategory } & Omit<CategoryBreakdownProps, "categories">) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const bar = computeCategoryBar({
    spentCents: category.spentCents,
    budgetCents: category.budgetCents,
    totalOutcomeCents: outcomeCents
  });
  const name = category.id === "uncategorized" ? t("review.uncategorized") : category.name;
  const percent = String(bar.percent);
  const tone = bar.mode === "budget" ? (bar.over ? "danger" : budgetTone(bar.fillRatio)) : "brand";

  return (
    <li className="rounded-field border border-line bg-surface-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        title={open ? t("review.hideTransactions") : t("review.showTransactions")}
        className="block min-h-[44px] w-full rounded-field p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="mb-2 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-ink">{name}</span>
          <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
            <span className={`font-semibold ${bar.over ? "text-danger" : "text-ink"}`}>
              {formatCurrency(category.spentCents)}
            </span>
            {category.budgetCents !== null && (
              <span className="text-ink-faint">/ {formatCurrency(category.budgetCents)}</span>
            )}
            <svg
              viewBox="0 0 24 24"
              className={`h-4 w-4 text-ink-muted transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </span>
        <ProgressBar value={bar.fillRatio} tone={tone} label={name} />
        <span className="mt-1 flex flex-wrap items-center justify-between gap-x-2 text-[11px] tabular-nums">
          <span className="text-ink-muted">
            {bar.mode === "share"
              ? t("review.shareOfExpenses", { percent })
              : t("review.budgetUsage", { percent })}
          </span>
          {bar.mode === "budget" && (
            <span className={bar.over ? "text-danger" : "text-ink-muted"}>
              {bar.over
                ? t("review.overBudget", { amount: formatCurrency(bar.overByCents) })
                : t("review.underBudget", { amount: formatCurrency(bar.remainingCents) })}
            </span>
          )}
        </span>
      </button>
      {open && (
        <div id={panelId} className="border-t border-line px-3 py-2">
          {category.transactions.length === 0 ? (
            <p data-testid="category-transactions-empty" className="py-1 text-sm text-ink-muted">
              {t("review.categoryTransactionsEmpty")}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {category.transactions.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{tx.description}</p>
                    <p className="text-xs text-ink-muted">
                      {new Date(tx.occurredAt).toLocaleDateString(dateLocale, { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-expense tabular-nums">
                    {formatCurrency(tx.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
