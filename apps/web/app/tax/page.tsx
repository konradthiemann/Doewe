"use client";

import { fromCents, toDecimalString } from "@doewe/shared";
import { format, parseISO } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useCallback, useEffect, useState } from "react";

import PageContainer from "../../components/PageContainer";
import { type AttachmentMeta } from "../../lib/attachments";
import { useI18n } from "../../lib/i18n";

type TaxTransaction = {
  id: string;
  amountCents: number;
  description: string;
  occurredAt: string;
  category: { id: string; name: string } | null;
  attachments: AttachmentMeta[];
};

type CategorySum = {
  categoryId: string | null;
  categoryName: string | null;
  totalCents: number;
  count: number;
  withReceiptCount: number;
};

type TaxResponse = {
  year: number;
  transactions: TaxTransaction[];
  categorySums: CategorySum[];
};

const YEAR_RANGE = 6;

export default function TaxPage() {
  const { locale, t } = useI18n();
  const dfLocale = locale === "de" ? de : enUS;

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<TaxResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async (targetYear: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tax?year=${targetYear}`, { cache: "no-store" });
      if (!res.ok) {
        setError(t("tax.errorLoad", { status: res.status }));
        setData(null);
        return;
      }
      setData(await res.json());
    } catch {
      setError(t("tax.errorLoadFallback"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load(year);
  }, [load, year]);

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const years = Array.from({ length: YEAR_RANGE }, (_, i) => currentYear - i);
  const totalCents = data?.categorySums.reduce((sum, entry) => sum + entry.totalCents, 0) ?? 0;
  const cardClass =
    "rounded-xl border border-gray-200 bg-white/95 p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/95";

  return (
    <main id="maincontent" className="py-6 md:py-8">
      <PageContainer className="max-w-4xl space-y-6">
        <div className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-medium">{t("tax.title")}</h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-neutral-300">{t("tax.description")}</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium" htmlFor="tax-year">
                {t("tax.yearLabel")}
              </label>
              <select
                id="tax-year"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
                className="rounded-md border-gray-300 text-sm dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:border-indigo-500 focus:ring-indigo-500"
              >
                {years.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {loading && (
          <p role="status" className="text-sm text-gray-600 dark:text-neutral-300">
            {t("tax.loading")}
          </p>
        )}

        {data && data.transactions.length === 0 && !loading && (
          <div className={cardClass}>
            <p className="text-sm text-gray-600 dark:text-neutral-300">{t("tax.empty")}</p>
          </div>
        )}

        {data && data.transactions.length > 0 && (
          <>
            <section className={cardClass} aria-labelledby="tax-sums-heading">
              <h2 id="tax-sums-heading" className="text-base font-medium">
                {t("tax.categorySumsTitle")}
              </h2>
              <ul className="mt-3 divide-y divide-gray-100 dark:divide-neutral-800">
                {data.categorySums.map((entry) => (
                  <li key={entry.categoryId ?? "uncategorized"} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{entry.categoryName ?? t("tax.uncategorized")}</p>
                      <p className="text-xs text-gray-500 dark:text-neutral-400">
                        {t("tax.receiptRatio", { with: entry.withReceiptCount, total: entry.count })}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {toDecimalString(fromCents(entry.totalCents))} €
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2 text-sm font-semibold dark:border-neutral-700">
                <span>{t("tax.total")}</span>
                <span className="tabular-nums">{toDecimalString(fromCents(totalCents))} €</span>
              </div>
            </section>

            <section className={cardClass} aria-labelledby="tax-transactions-heading">
              <h2 id="tax-transactions-heading" className="text-base font-medium">
                {t("tax.transactionsTitle")}
              </h2>
              <ul className="mt-3 divide-y divide-gray-100 dark:divide-neutral-800">
                {data.transactions.map((tx) => {
                  const isExpanded = expanded.has(tx.id);
                  const hasReceipt = tx.attachments.length > 0;
                  return (
                    <li key={tx.id} className="py-2">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(tx.id)}
                        aria-expanded={isExpanded}
                        aria-controls={`tax-tx-${tx.id}`}
                        className="flex w-full items-center justify-between gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 rounded-md"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{tx.description}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-neutral-400">
                            <span>{format(parseISO(tx.occurredAt), "P", { locale: dfLocale })}</span>
                            {tx.category && (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700 dark:bg-neutral-800 dark:text-neutral-300">
                                {tx.category.name}
                              </span>
                            )}
                            <span
                              className={`rounded-full px-2 py-0.5 font-semibold ${
                                hasReceipt
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                                  : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                              }`}
                            >
                              {hasReceipt ? t("tax.receiptPresent") : t("tax.receiptMissing")}
                            </span>
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-sm font-semibold tabular-nums ${
                            tx.amountCents >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {toDecimalString(fromCents(tx.amountCents))} €
                        </span>
                      </button>
                      {isExpanded && (
                        <div id={`tax-tx-${tx.id}`} className="mt-2 space-y-1 pl-1">
                          {hasReceipt ? (
                            tx.attachments.map((attachment) => (
                              <a
                                key={attachment.id}
                                href={`/api/attachments/${attachment.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                              >
                                <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                                </svg>
                                <span className="truncate">{attachment.fileName}</span>
                              </a>
                            ))
                          ) : (
                            <p className="text-xs text-gray-500 dark:text-neutral-400">{t("tax.receiptMissingHint")}</p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}
      </PageContainer>
    </main>
  );
}
