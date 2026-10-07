"use client";

import Link from "next/link";
import { parseAsInteger, useQueryState } from "nuqs";
import { Suspense, useCallback, useMemo } from "react";

import PageContainer from "../../components/PageContainer";
import { CollapsibleSection } from "../../components/ui/CollapsibleSection";
import { CategoryYearTable } from "../../components/yearly/CategoryYearTable";
import { RecurringYearTable } from "../../components/yearly/RecurringYearTable";
import { useApiQuery } from "../../lib/api/useApiQuery";
import { useI18n } from "../../lib/i18n";

import type { CategoryYearMatrix, RecurringYearMatrix } from "@doewe/shared";

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

function YearlyPage() {
  const { locale, t } = useI18n();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [rawYear, setYear] = useQueryState("year", parseAsInteger.withDefault(currentYear));
  const year = Math.min(MAX_YEAR, Math.max(MIN_YEAR, rawYear));

  const query = useApiQuery<RecurringYearMatrix>(
    ["recurring", "yearly", year],
    `/api/recurring-transactions/yearly?year=${year}`
  );
  const matrix = query.data ?? null;

  const categoryQuery = useApiQuery<CategoryYearMatrix>(
    ["analytics", "category-year", year],
    `/api/analytics/category-year?year=${year}`
  );
  const categoryMatrix = categoryQuery.data ?? null;

  const formatCurrency = useCallback(
    (cents: number) =>
      `${(cents / 100).toLocaleString(dateLocale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })} €`,
    [dateLocale]
  );

  const monthLabels = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) =>
        new Date(2000, index, 1).toLocaleDateString(dateLocale, { month: "short" })
      ),
    [dateLocale]
  );

  const isRecurringEmpty =
    matrix !== null &&
    matrix.income.rows.length + matrix.expenses.rows.length + matrix.savings.rows.length === 0;
  const isCategoryEmpty =
    categoryMatrix !== null &&
    categoryMatrix.income.rows.length + categoryMatrix.expenses.rows.length + categoryMatrix.savings.rows.length === 0;
  // The empty hint only shows when there is nothing at all to display.
  const isEmpty = isRecurringEmpty && isCategoryEmpty;

  const navButton =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";

  return (
    <main id="maincontent" className="py-6 md:py-8">
      <PageContainer className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink">{t("yearly.title")}</h1>
            <p className="text-sm text-ink-muted">{t("yearly.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void setYear(year - 1)}
              disabled={year <= MIN_YEAR}
              aria-label={t("yearly.prevYear")}
              className={navButton}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <span className="min-w-[4rem] text-center text-base font-semibold tabular-nums text-ink" aria-live="polite">
              {year}
            </span>
            <button
              type="button"
              onClick={() => void setYear(year + 1)}
              disabled={year >= MAX_YEAR}
              aria-label={t("yearly.nextYear")}
              className={navButton}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>

        <section aria-labelledby="category-year-heading" className="space-y-3">
          <h2 id="category-year-heading" className="text-lg font-medium text-ink">
            {t("yearly.categoriesTitle")}
          </h2>
          {categoryQuery.isPending && <p className="text-sm text-ink-muted">{t("yearly.loading")}</p>}
          {categoryQuery.isError && !categoryMatrix && <p className="text-sm text-danger">{t("yearly.error")}</p>}
          {categoryMatrix && !isCategoryEmpty && (
            <CategoryYearTable
              matrix={categoryMatrix}
              formatCurrency={formatCurrency}
              monthLabels={monthLabels}
              uncategorizedLabel={t("review.uncategorized")}
            />
          )}
        </section>

        {isEmpty && (
          <div className="rounded-card border border-line bg-surface p-6 text-center">
            <p className="text-sm text-ink-muted">{t("yearly.empty")}</p>
            <Link
              href="/transactions?tab=recurring"
              className="mt-3 inline-block text-sm font-medium text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {t("yearly.emptyAction")}
            </Link>
          </div>
        )}

        <CollapsibleSection id="recurring-year" title={t("yearly.recurringTitle")}>
          <p className="mb-3 text-sm text-ink-muted">{t("yearly.recurringSubtitle")}</p>
          {query.isPending && <p className="text-sm text-ink-muted">{t("yearly.loading")}</p>}
          {query.isError && !matrix && <p className="text-sm text-danger">{t("yearly.error")}</p>}
          {matrix && !isRecurringEmpty && (
            <RecurringYearTable matrix={matrix} formatCurrency={formatCurrency} monthLabels={monthLabels} />
          )}
          {isRecurringEmpty && <p className="text-sm text-ink-muted">{t("yearly.empty")}</p>}
        </CollapsibleSection>
      </PageContainer>
    </main>
  );
}

export default function YearlyPageWithSuspense() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<main className="p-6"><p className="text-sm text-ink-muted">{t("yearly.loading")}</p></main>}>
      <YearlyPage />
    </Suspense>
  );
}
