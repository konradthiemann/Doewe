"use client";

import { fromCents, toDecimalString } from "@doewe/shared";
import { format, parseISO } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useMemo, useState } from "react";

import PageContainer from "../../components/PageContainer";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { useApiQuery } from "../../lib/api/useApiQuery";
import { type AttachmentMeta, TAX_EXPORT_MAX_RECEIPT_BYTES, formatAttachmentBytes } from "../../lib/attachments";
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Jahr steckt im Query-Key: Jahreswechsel ändert den Key, react-query refetcht automatisch.
  const taxQuery = useApiQuery<TaxResponse>(["tax", year], `/api/tax?year=${year}`);

  // Wie zuvor: bei Fehler keine (ggf. veralteten) Daten anzeigen. Der HTTP-Status
  // wird aus der getJson-Fehlermeldung extrahiert, um den bestehenden Fehlertext
  // mit Status beizubehalten; Netzwerkfehler fallen auf den Fallback-Text zurück.
  const data = taxQuery.isError ? null : (taxQuery.data ?? null);
  const loading = taxQuery.isPending;
  const errorStatus =
    taxQuery.error instanceof Error ? /status (\d+)$/.exec(taxQuery.error.message)?.[1] : undefined;
  const error = taxQuery.isError
    ? errorStatus
      ? t("tax.errorLoad", { status: Number(errorStatus) })
      : t("tax.errorLoadFallback")
    : null;

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

  // F2: 50 MB Belegbytes-Budget — Größe kommt aus den bereits geladenen
  // sizeBytes der /api/tax-Antwort, kein zusätzlicher Request nötig.
  const receiptBytesTotal = useMemo(
    () =>
      data?.transactions.reduce(
        (sum, tx) => sum + tx.attachments.reduce((txSum, a) => txSum + a.sizeBytes, 0),
        0
      ) ?? 0,
    [data]
  );
  const receiptsOverBudget = receiptBytesTotal > TAX_EXPORT_MAX_RECEIPT_BYTES;

  const toast = useToast();
  const [includeReceipts, setIncludeReceipts] = useState(true);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        year: String(year),
        includeReceipts: includeReceipts && !receiptsOverBudget ? "1" : "0",
        locale
      });
      const res = await fetch(`/api/tax/export?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 413) {
          const body: { totalBytes?: number; limitBytes?: number } = await res.json().catch(() => ({}));
          toast.error(
            t("tax.export.errorTooLarge", {
              totalSize: formatAttachmentBytes(body.totalBytes ?? receiptBytesTotal),
              limitSize: formatAttachmentBytes(body.limitBytes ?? TAX_EXPORT_MAX_RECEIPT_BYTES)
            })
          );
        } else {
          toast.error(t("tax.export.errorGeneric", { status: res.status }));
        }
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `steuer-${year}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("tax.export.errorGeneric", { status: 0 }));
    } finally {
      setExporting(false);
    }
  }

  const years = Array.from({ length: YEAR_RANGE }, (_, i) => currentYear - i);
  const totalCents = data?.categorySums.reduce((sum, entry) => sum + entry.totalCents, 0) ?? 0;
  const cardClass =
    "rounded-card border border-line bg-surface/95 p-4 shadow-card";

  return (
    <main id="maincontent" className="py-6 md:py-8">
      <PageContainer className="max-w-4xl space-y-6">
        <div className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-medium">{t("tax.title")}</h1>
              <p className="mt-1 text-sm text-ink-muted">{t("tax.description")}</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium" htmlFor="tax-year">
                {t("tax.yearLabel")}
              </label>
              <select
                id="tax-year"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
                className="rounded-field border-line-strong bg-surface text-sm text-ink focus:border-brand focus:ring-brand"
              >
                {years.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={includeReceipts && !receiptsOverBudget}
                disabled={receiptsOverBudget}
                onChange={(event) => setIncludeReceipts(event.target.checked)}
                className="h-4 w-4 rounded border-line-strong text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
              {t("tax.export.includeReceiptsLabel")}
            </label>
            {data && receiptBytesTotal > 0 && (
              <p className={`text-xs ${receiptsOverBudget ? "text-danger" : "text-ink-muted"}`}>
                {receiptsOverBudget
                  ? t("tax.export.receiptsOverLimit", {
                      size: formatAttachmentBytes(receiptBytesTotal),
                      limit: formatAttachmentBytes(TAX_EXPORT_MAX_RECEIPT_BYTES)
                    })
                  : t("tax.export.includeReceiptsSizeHint", { size: formatAttachmentBytes(receiptBytesTotal) })}
              </p>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={exporting}
              disabled={!data || loading}
              onClick={() => void handleExport()}
            >
              {exporting ? t("tax.export.buttonLoading") : t("tax.export.button")}
            </Button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {loading && (
          <p role="status" className="text-sm text-ink-muted">
            {t("tax.loading")}
          </p>
        )}

        {data && data.transactions.length === 0 && !loading && (
          <div className={cardClass}>
            <p className="text-sm text-ink-muted">{t("tax.empty")}</p>
          </div>
        )}

        {data && data.transactions.length > 0 && (
          <>
            <section className={cardClass} aria-labelledby="tax-sums-heading">
              <h2 id="tax-sums-heading" className="text-base font-medium">
                {t("tax.categorySumsTitle")}
              </h2>
              <ul className="mt-3 divide-y divide-line">
                {data.categorySums.map((entry) => (
                  <li key={entry.categoryId ?? "uncategorized"} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{entry.categoryName ?? t("tax.uncategorized")}</p>
                      <p className="text-xs text-ink-muted">
                        {t("tax.receiptRatio", { with: entry.withReceiptCount, total: entry.count })}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {toDecimalString(fromCents(entry.totalCents))} €
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-sm font-semibold">
                <span>{t("tax.total")}</span>
                <span className="tabular-nums">{toDecimalString(fromCents(totalCents))} €</span>
              </div>
            </section>

            <section className={cardClass} aria-labelledby="tax-transactions-heading">
              <h2 id="tax-transactions-heading" className="text-base font-medium">
                {t("tax.transactionsTitle")}
              </h2>
              <ul className="mt-3 divide-y divide-line">
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
                        className="flex w-full items-center justify-between gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded-field"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{tx.description}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                            <span>{format(parseISO(tx.occurredAt), "P", { locale: dfLocale })}</span>
                            {tx.category && (
                              <span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium text-ink">
                                {tx.category.name}
                              </span>
                            )}
                            <span
                              className={`rounded-full px-2 py-0.5 font-semibold ${
                                hasReceipt
                                  ? "bg-success-soft text-success"
                                  : "bg-warning-soft text-warning"
                              }`}
                            >
                              {hasReceipt ? t("tax.receiptPresent") : t("tax.receiptMissing")}
                            </span>
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-sm font-semibold tabular-nums ${
                            tx.amountCents >= 0 ? "text-income" : "text-expense"
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
                                className="flex items-center gap-2 text-xs font-medium text-brand hover:underline"
                              >
                                <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                                </svg>
                                <span className="truncate">{attachment.fileName}</span>
                              </a>
                            ))
                          ) : (
                            <p className="text-xs text-ink-muted">{t("tax.receiptMissingHint")}</p>
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
