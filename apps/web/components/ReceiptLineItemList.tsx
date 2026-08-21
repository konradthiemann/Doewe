"use client";

import { useI18n } from "../lib/i18n";

interface LineItem {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  position: number;
}

interface Props {
  items: LineItem[];
  merchant?: string | null;
}

function formatCents(cents: number): string {
  return (Math.abs(cents) / 100).toFixed(2).replace(".", ",");
}

export default function ReceiptLineItemList({ items, merchant }: Props) {
  const { t } = useI18n();

  if (!items.length) return null;

  const sorted = [...items].sort((a, b) => a.position - b.position);

  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 14.25l6-6" />
          <path d="M19.5 4.757v16.993l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0c1.1.128 1.907 1.077 1.907 2.185Z" />
        </svg>
        {t("receiptScanner.lineItems")}
        {merchant && (
          <span className="ml-auto text-[10px] font-normal normal-case text-ink-faint">
            {merchant}
          </span>
        )}
      </h3>
      <div className="divide-y divide-line">
        {sorted.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between py-1.5 text-sm"
          >
            <div className="min-w-0">
              <span className="text-ink">{item.name}</span>
              {item.quantity > 1 && (
                <span className="ml-1 text-ink-faint">x{item.quantity}</span>
              )}
            </div>
            <span className="shrink-0 tabular-nums text-ink-muted">
              {formatCents(item.totalCents)}{"\u00A0\u20AC"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
