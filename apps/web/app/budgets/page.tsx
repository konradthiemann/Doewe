"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { parseAsInteger, useQueryState } from "nuqs";
import { Suspense, useCallback, useMemo, useState } from "react";

import { BUDGET_EDITOR_COLS, BudgetPlanEditor } from "../../components/budgets/BudgetPlanEditor";
import PageContainer from "../../components/PageContainer";
import { useToast } from "../../components/ui/Toast";
import { useApiQuery } from "../../lib/api/useApiQuery";
import { useI18n } from "../../lib/i18n";

import type { BudgetPeriod } from "@doewe/shared";

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

type BudgetPlansResponse = {
  year: number;
  availablePerMonthCents: number[];
  plans: Array<{ id: string; categoryId: string; period: BudgetPeriod; amountCents: number }>;
  budgetableCategories: Array<{ id: string; name: string; planId: string | null }>;
};

type SaveValue = { period: BudgetPeriod; amountCents: number };

const navButton =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";

function BudgetsPage() {
  const { locale, t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [rawYear, setYear] = useQueryState("year", parseAsInteger.withDefault(currentYear));
  const year = Math.min(MAX_YEAR, Math.max(MIN_YEAR, rawYear));
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());

  const query = useApiQuery<BudgetPlansResponse>(["budget-plans", year], `/api/budget-plans?year=${year}`);
  const data = query.data ?? null;

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

  const setBusy = (categoryId: string, busy: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(categoryId);
      else next.delete(categoryId);
      return next;
    });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["budget-plans"] }),
      queryClient.invalidateQueries({ queryKey: ["analytics"] })
    ]);

  const run = async (
    categoryId: string,
    request: () => Promise<Response>,
    messages: { success: string; error: string }
  ) => {
    setBusy(categoryId, true);
    try {
      const res = await request();
      if (res.ok) {
        toast.success(messages.success);
      } else if (res.status === 409) {
        toast.error(t("budgets.errorConflict"));
      } else {
        toast.error(messages.error);
      }
      // Also after a failure (404/409) the list may be stale -> reload it.
      if (res.ok || res.status === 404 || res.status === 409) await refresh();
    } catch {
      toast.error(messages.error);
    } finally {
      setBusy(categoryId, false);
    }
  };

  const save = (categoryId: string, planId: string | null, value: SaveValue) =>
    run(
      categoryId,
      () =>
        planId
          ? fetch(`/api/budget-plans/${planId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(value)
            })
          : fetch("/api/budget-plans", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ categoryId, ...value })
            }),
      { success: t("budgets.saved"), error: t("budgets.errorSave") }
    );

  const remove = (categoryId: string, planId: string) =>
    run(categoryId, () => fetch(`/api/budget-plans/${planId}`, { method: "DELETE" }), {
      success: t("budgets.deleted"),
      error: t("budgets.errorDelete")
    });

  const planById = useMemo(() => new Map((data?.plans ?? []).map((plan) => [plan.id, plan])), [data]);
  const categories = data?.budgetableCategories ?? [];
  const active = categories.filter((category) => category.planId !== null);
  const other = categories.filter((category) => category.planId === null);

  const renderSection = (id: string, title: string, items: typeof categories) => {
    if (!data || items.length === 0) return null;
    return (
      <section aria-labelledby={`budgets-${id}`} className="space-y-2">
        <h2 id={`budgets-${id}`} className="text-sm font-semibold text-ink">
          {title}
        </h2>
        <ul className="space-y-2">
          {items.map((category) => {
            const plan = category.planId ? (planById.get(category.planId) ?? null) : null;
            return (
              <li key={category.id} className="rounded-field border border-line bg-surface-2">
                <BudgetPlanEditor
                  category={{ id: category.id, name: category.name }}
                  plan={plan ? { id: plan.id, period: plan.period, amountCents: plan.amountCents } : null}
                  availablePerMonthCents={data.availablePerMonthCents}
                  monthLabels={monthLabels}
                  formatCurrency={formatCurrency}
                  busy={busyIds.has(category.id)}
                  onSave={(value) => void save(category.id, plan?.id ?? null, value)}
                  onDelete={plan ? () => void remove(category.id, plan.id) : undefined}
                />
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  return (
    <main id="maincontent" className="py-6 md:py-8">
      <PageContainer className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink">{t("budgets.title")}</h1>
            <p className="text-sm text-ink-muted">{t("budgets.subtitle")}</p>
            <p className="mt-1 text-sm text-ink-muted">{t("budgets.explain")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void setYear(year - 1)}
              disabled={year <= MIN_YEAR}
              aria-label={t("budgets.prevYear")}
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
              aria-label={t("budgets.nextYear")}
              className={navButton}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>

        {query.isPending && <p className="text-sm text-ink-muted">{t("budgets.loading")}</p>}
        {query.isError && !data && (
          <p role="alert" className="text-sm text-danger">
            {t("budgets.error")}
          </p>
        )}

        {data && categories.length === 0 && (
          <div className="rounded-card border border-line bg-surface p-6 text-center">
            <p className="text-sm text-ink-muted">{t("budgets.empty")}</p>
            <Link
              href="/categories"
              className="mt-3 inline-block text-sm font-medium text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {t("budgets.emptyAction")}
            </Link>
          </div>
        )}

        {data && categories.length > 0 && (
          <div className="space-y-6">
            <div
              aria-hidden="true"
              className={`hidden gap-3 px-[calc(0.75rem+1px)] text-xs font-medium text-ink-muted lg:grid ${BUDGET_EDITOR_COLS}`}
            >
              <span>{t("budgets.colCategory")}</span>
              <span>{t("budgets.colPeriod")}</span>
              <span className="text-right">{t("budgets.colAmount")}</span>
              <span />
            </div>
            {renderSection("active", t("budgets.activeTitle"), active)}
            {renderSection("other", t("budgets.otherTitle"), other)}
          </div>
        )}
      </PageContainer>
    </main>
  );
}

export default function BudgetsPageWithSuspense() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<main className="p-6"><p className="text-sm text-ink-muted">{t("budgets.loading")}</p></main>}>
      <BudgetsPage />
    </Suspense>
  );
}
