"use client";

import { computeCategoryBar } from "@doewe/shared";
import { useId, useMemo, useState } from "react";

import { useI18n } from "../../lib/i18n";
import { budgetTone, ProgressBar } from "../ui/ProgressBar";

import {
  DEFAULT_SORT_DIRECTION,
  sortCategories,
  type CategorySortKey,
  type SortDirection
} from "./sortCategories";

export type ReviewCategoryTransaction = {
  id: string;
  description: string;
  /** Positive expense amount in cents. */
  amountCents: number;
  occurredAt: string;
  accountId: string;
  /** null for uncategorized bookings. */
  categoryId: string | null;
  taxRelevant: boolean;
};

export type ReviewCategory = {
  id: string;
  name: string;
  spentCents: number;
  budgetCents: number | null;
  transactionCount: number;
  transactions: ReviewCategoryTransaction[];
};

/** Shared column template (desktop): name | bar | spent | budget | status | chevron. */
const COLS = "lg:grid-cols-[minmax(6rem,9rem)_minmax(6rem,1fr)_6rem_6rem_9.5rem_1rem]";

export interface CategoryBreakdownProps {
  categories: ReviewCategory[];
  outcomeCents: number;
  formatCurrency: (cents: number) => string;
  dateLocale: string;
  /** When set, every booking in an opened category becomes a button that calls this. */
  onEditTransaction?: (tx: ReviewCategoryTransaction) => void;
}

type SortState = { key: CategorySortKey; direction: SortDirection } | null;

const HEADER_COLUMNS: Array<{ key: CategorySortKey; labelKey: string; align: string }> = [
  { key: "name", labelKey: "review.colCategory", align: "justify-start" },
  { key: "distribution", labelKey: "review.colBar", align: "justify-start" },
  { key: "spent", labelKey: "review.colSpent", align: "justify-end" },
  { key: "budget", labelKey: "review.colBudget", align: "justify-end" },
  { key: "status", labelKey: "review.colStatus", align: "justify-end" }
];

function SortIndicator({ direction }: { direction: SortDirection | null }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-3 w-3 shrink-0 ${direction ? "text-ink" : "text-ink-faint opacity-50"}`}
      fill="currentColor"
    >
      {direction === "asc" ? (
        <path d="M12 6l7 10H5z" />
      ) : direction === "desc" ? (
        <path d="M12 18L5 8h14z" />
      ) : (
        <path d="M12 4l5 6H7zM12 20l-5-6h10z" />
      )}
    </svg>
  );
}

/** Expense categories with a bar each; tapping a row reveals its individual bookings. */
export function CategoryBreakdown({
  categories,
  outcomeCents,
  formatCurrency,
  dateLocale,
  onEditTransaction
}: CategoryBreakdownProps) {
  const { t, locale } = useI18n();
  const [sort, setSort] = useState<SortState>(null);

  const rows = useMemo(
    () => (sort ? sortCategories(categories, sort.key, sort.direction, locale) : categories),
    [categories, sort, locale]
  );

  const toggleSort = (key: CategorySortKey) =>
    setSort((prev) =>
      prev?.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: DEFAULT_SORT_DIRECTION[key] }
    );

  return (
    <div>
      <div role="table" aria-label={t("review.categoriesTitle")} className="hidden lg:block">
        <div role="rowgroup">
          <div
            role="row"
            className={`mb-2 grid gap-x-3 px-[calc(0.75rem+1px)] text-xs font-medium text-ink-muted ${COLS}`}
          >
            {HEADER_COLUMNS.map(({ key, labelKey, align }) => {
              const direction = sort?.key === key ? sort.direction : null;
              return (
                <div
                  key={key}
                  role="columnheader"
                  aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}
                  className={`flex ${align}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(key)}
                    className="inline-flex items-center gap-1 rounded-field py-1 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {t(labelKey)}
                    <SortIndicator direction={direction} />
                  </button>
                </div>
              );
            })}
            <div role="columnheader" aria-hidden="true" />
          </div>
        </div>
      </div>
      <ul className="space-y-2">
        {rows.map((cat) => (
          <CategoryRow
            key={cat.id}
            category={cat}
            outcomeCents={outcomeCents}
            formatCurrency={formatCurrency}
            dateLocale={dateLocale}
            onEditTransaction={onEditTransaction}
          />
        ))}
      </ul>
    </div>
  );
}

function CategoryRow({
  category,
  outcomeCents,
  formatCurrency,
  dateLocale,
  onEditTransaction
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
        className={`grid min-h-[44px] w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-2 rounded-field p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:gap-x-3 lg:gap-y-0 ${COLS}`}
      >
        <span className="col-start-1 row-start-1 min-w-0 truncate text-sm font-medium text-ink lg:col-start-1">
          {name}
        </span>
        <span className="col-start-2 row-start-1 flex items-center gap-2 text-xs tabular-nums lg:contents">
          <span
            className={`font-semibold lg:col-start-3 lg:row-start-1 lg:justify-self-end lg:whitespace-nowrap lg:text-sm ${bar.over ? "text-danger" : "text-ink"}`}
          >
            {formatCurrency(category.spentCents)}
          </span>
          {category.budgetCents !== null ? (
            <span className="whitespace-nowrap text-ink-faint lg:col-start-4 lg:row-start-1 lg:justify-self-end lg:text-sm lg:text-ink-muted">
              <span className="lg:hidden">/ </span>
              {formatCurrency(category.budgetCents)}
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="hidden text-ink-faint lg:col-start-4 lg:row-start-1 lg:block lg:justify-self-end lg:text-sm"
            >
              —
            </span>
          )}
        </span>
        <svg
          viewBox="0 0 24 24"
          className={`col-start-3 row-start-1 h-4 w-4 text-ink-muted transition-transform motion-reduce:transition-none lg:col-start-6 lg:justify-self-end ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
        <span className="col-span-3 lg:col-span-1 lg:col-start-2 lg:row-start-1">
          <ProgressBar value={bar.fillRatio} tone={tone} label={name} />
        </span>
        <span className="col-span-3 flex flex-wrap items-center justify-between gap-x-2 text-[11px] tabular-nums lg:col-span-1 lg:col-start-5 lg:row-start-1 lg:justify-end lg:text-right lg:text-xs">
          {bar.mode === "share" ? (
            <span className="text-ink-muted">{t("review.shareOfExpenses", { percent })}</span>
          ) : (
            <>
              <span className="text-ink-muted lg:hidden">{t("review.budgetUsage", { percent })}</span>
              <span className={bar.over ? "text-danger" : "text-ink-muted"}>
                {bar.over
                  ? t("review.overBudget", { amount: formatCurrency(bar.overByCents) })
                  : t("review.underBudget", { amount: formatCurrency(bar.remainingCents) })}
              </span>
            </>
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
              {category.transactions.map((tx) => {
                const cells = (
                  <>
                    <span className="text-xs text-ink-muted tabular-nums">
                      {new Date(tx.occurredAt).toLocaleDateString(dateLocale, { day: "numeric", month: "short" })}
                    </span>
                    <span className="truncate text-sm text-ink">{tx.description}</span>
                    <span className="whitespace-nowrap text-right text-sm font-semibold text-expense tabular-nums">
                      {formatCurrency(tx.amountCents)}
                    </span>
                  </>
                );
                const rowGrid = "grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-x-3";
                return (
                  <li key={tx.id}>
                    {onEditTransaction ? (
                      <button
                        type="button"
                        onClick={() => onEditTransaction(tx)}
                        className={`${rowGrid} min-h-[44px] w-full rounded-field px-1 py-2 text-left hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
                      >
                        {cells}
                      </button>
                    ) : (
                      <div className={`${rowGrid} py-2`}>{cells}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
