"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useI18n } from "../lib/i18n";

import { Button } from "./ui/Button";
import { useToast } from "./ui/Toast";

interface LineItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  categoryId: string;
  position: number;
}

interface ScanResult {
  merchant: string | null;
  date: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    suggestedCategory?: string;
  }>;
  totalCents: number;
  _stub?: boolean;
}

interface Category {
  id: string;
  name: string;
  isIncome?: boolean;
}

interface Account {
  id: string;
  name: string;
}

interface Props {
  scanResult: ScanResult;
  categories: Category[];
  accounts: Account[];
  receiptImage: File | null;
  onBack: () => void;
  onComplete: () => void;
}

function formatCents(cents: number): string {
  return (Math.abs(cents) / 100).toFixed(2).replace(".", ",");
}

export default function ReceiptReview({
  scanResult,
  categories,
  accounts,
  onBack,
  onComplete
}: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const expenseCategories = categories.filter((c) => !c.isIncome);
  const defaultCategoryId = expenseCategories[0]?.id ?? "";

  const [merchant, setMerchant] = useState(scanResult.merchant ?? "");
  const [receiptDate, setReceiptDate] = useState(scanResult.date);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [taxRelevant, setTaxRelevant] = useState(false);

  const [items, setItems] = useState<LineItem[]>(() =>
    scanResult.items.length > 0
      ? scanResult.items.map((item, i) => ({
          ...item,
          position: i,
          categoryId:
            expenseCategories.find(
              (c) => c.name.toLowerCase() === item.suggestedCategory?.toLowerCase()
            )?.id ?? defaultCategoryId
        }))
      : [
          {
            name: "",
            quantity: 1,
            unitPriceCents: 0,
            totalCents: 0,
            categoryId: defaultCategoryId,
            position: 0
          }
        ]
  );

  const updateItem = (index: number, updates: Partial<LineItem>) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, ...updates };
        if ("quantity" in updates || "unitPriceCents" in updates) {
          updated.totalCents = updated.quantity * updated.unitPriceCents;
        }
        return updated;
      })
    );
  };

  const removeItem = (index: number) => {
    setItems((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((item, i) => ({ ...item, position: i }))
    );
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        name: "",
        quantity: 1,
        unitPriceCents: 0,
        totalCents: 0,
        categoryId: defaultCategoryId,
        position: prev.length
      }
    ]);
  };

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { category: Category; items: LineItem[]; totalCents: number }
    >();
    for (const item of items) {
      if (!item.name.trim()) continue;
      const cat = categories.find((c) => c.id === item.categoryId);
      if (!cat) continue;
      const existing = map.get(item.categoryId);
      if (existing) {
        existing.items.push(item);
        existing.totalCents += item.totalCents;
      } else {
        map.set(item.categoryId, {
          category: cat,
          items: [item],
          totalCents: item.totalCents
        });
      }
    }
    return Array.from(map.values());
  }, [items, categories]);

  const totalCents = items.reduce((sum, i) => sum + i.totalCents, 0);

  const mutation = useMutation({
    mutationFn: async () => {
      const groups = grouped.map((g) => ({
        categoryId: g.category.id,
        items: g.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalCents: item.totalCents,
          position: item.position
        }))
      }));

      const res = await fetch("/api/transactions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptDate,
          receiptMerchant: merchant || undefined,
          accountId,
          taxRelevant,
          groups
        })
      });

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Unknown error" }));
        const message =
          typeof err.error === "string" ? err.error : "Failed to create transactions";
        throw new Error(message);
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      toast.success(t("receiptScanner.booked"));
      onComplete();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    }
  });

  const canSubmit =
    items.some((i) => i.name.trim() && i.totalCents !== 0) && accountId;

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-6 text-xl font-bold text-ink">
        {t("receiptScanner.reviewTitle")}
      </h1>

      {/* Merchant & Date */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            {t("receiptScanner.merchant")}
          </label>
          <input
            type="text"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="z.B. REWE"
            className="w-full rounded-field border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            {t("receiptScanner.date")}
          </label>
          <input
            type="date"
            value={receiptDate}
            onChange={(e) => setReceiptDate(e.target.value)}
            className="w-full rounded-field border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      {/* Account & Tax */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            {t("receiptScanner.account")}
          </label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full rounded-field border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={taxRelevant}
              onChange={(e) => setTaxRelevant(e.target.checked)}
              className="rounded border-line text-brand focus:ring-brand"
            />
            {t("receiptScanner.taxRelevant")}
          </label>
        </div>
      </div>

      {/* Line Items */}
      <div className="mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">
            {t("receiptScanner.positions")}
          </h2>
          <button
            type="button"
            onClick={addItem}
            className="text-sm font-medium text-brand hover:text-brand-hover"
          >
            + {t("receiptScanner.addPosition")}
          </button>
        </div>

        {items.map((item, index) => (
          <div
            key={index}
            className="rounded-card border border-line bg-surface p-3 shadow-card"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <input
                type="text"
                value={item.name}
                onChange={(e) => updateItem(index, { name: e.target.value })}
                placeholder={t("receiptScanner.itemName")}
                className="min-w-0 flex-1 rounded-field border border-line bg-bg px-2 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="shrink-0 rounded-field p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger"
                aria-label={t("receiptScanner.removePosition")}
              >
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
                  <path d="M3 6h18" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="mb-0.5 block text-[10px] text-ink-faint">
                  {t("receiptScanner.qty")}
                </label>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(index, {
                      quantity: Math.max(0.001, parseFloat(e.target.value) || 1)
                    })
                  }
                  className="w-full rounded-field border border-line bg-bg px-2 py-1 text-sm tabular-nums text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] text-ink-faint">
                  {t("receiptScanner.unitPrice")}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(item.unitPriceCents / 100).toFixed(2)}
                  onChange={(e) => {
                    const cents = Math.round(
                      parseFloat(e.target.value || "0") * 100
                    );
                    updateItem(index, { unitPriceCents: cents });
                  }}
                  className="w-full rounded-field border border-line bg-bg px-2 py-1 text-sm tabular-nums text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] text-ink-faint">
                  {t("receiptScanner.total")}
                </label>
                <div className="rounded-field border border-line bg-surface-2 px-2 py-1 text-sm tabular-nums text-ink">
                  {formatCents(item.totalCents)}{"\u00A0\u20AC"}
                </div>
              </div>
            </div>

            <div className="mt-2">
              <label className="mb-0.5 block text-[10px] text-ink-faint">
                {t("receiptScanner.category")}
              </label>
              <select
                value={item.categoryId}
                onChange={(e) =>
                  updateItem(index, { categoryId: e.target.value })
                }
                className="w-full rounded-field border border-line bg-bg px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      {/* Grouping Preview */}
      {grouped.length > 0 && (
        <div className="mb-6 rounded-card border border-line bg-surface-2 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t("receiptScanner.groupingPreview")}
          </h3>
          <div className="space-y-2">
            {grouped.map((g) => (
              <div
                key={g.category.id}
                className="flex items-center justify-between text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium text-ink">
                    {g.category.name}
                  </span>
                  <span className="ml-2 text-ink-faint">
                    ({g.items.map((i) => i.name).join(", ")})
                  </span>
                </div>
                <span className="shrink-0 tabular-nums font-semibold text-expense">
                  {formatCents(g.totalCents)}{"\u00A0\u20AC"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end border-t border-line pt-2">
            <span className="text-sm font-bold tabular-nums text-ink">
              {t("receiptScanner.totalLabel")}:{" "}
              {formatCents(totalCents)}{"\u00A0\u20AC"}
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="secondary" size="md" onClick={onBack}>
          {t("receiptScanner.back")}
        </Button>
        <Button
          variant="primary"
          size="md"
          className="flex-1"
          loading={mutation.isPending}
          disabled={!canSubmit}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending
            ? t("receiptScanner.booking")
            : t("receiptScanner.book")}
        </Button>
      </div>
    </div>
  );
}
