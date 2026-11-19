"use client";

import { parseDayKey } from "@doewe/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { ATTACHMENT_MAX_SIZE_BYTES, isAllowedAttachmentMimeType } from "../lib/attachments";
import { useI18n } from "../lib/i18n";
import { compressImage, UnsupportedAttachmentError } from "../lib/imageCompression";
import {
  bookedTotalCents,
  buildBatchRequest,
  groupBookableLines,
  inheritedTaxRelevance,
  lineTotalCents,
  receiptDayOrToday
} from "../lib/receiptLines";

import { uploadAttachment } from "./AttachmentManager";
import { Button } from "./ui/Button";
import { InfoTip } from "./ui/InfoTip";
import { useToast } from "./ui/Toast";

interface LineItem {
  name: string;
  /** Last valid quantity; what is booked. */
  quantity: number;
  /** What the quantity field shows — may be empty or incomplete while typing. */
  quantityText: string;
  /** The field was left once: from then on an invalid quantity is pointed out. */
  quantityTouched: boolean;
  unitPriceCents: number;
  totalCents: number;
  categoryId: string;
  position: number;
}

/**
 * Quantity typed into the field (comma or dot as decimal separator), to three
 * decimals; null while it is empty, incomplete or not above 0.
 */
export function parseQuantity(text: string): number | null {
  const normalized = text.trim().replace(",", ".");
  if (!/^\d*\.?\d*$/.test(normalized) || !/\d/.test(normalized)) return null;
  const quantity = Math.round(Number(normalized) * 1000) / 1000;
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
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
  isTaxRelevant?: boolean;
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

/**
 * Attaches the scanned receipt photo to every transaction created from it —
 * one photo commonly splits into several transactions (one per category), and
 * each should show the same receipt (mirrors receiptMerchant being duplicated
 * across all of them in POST /api/transactions/batch).
 * Returns false if the image itself was unusable or every upload failed, so
 * the caller can warn without blocking the already-successful booking.
 */
export async function attachReceiptImageToTransactions(
  receiptImage: File,
  transactions: Array<{ id: string }>
): Promise<boolean> {
  let file: File;
  try {
    file = await compressImage(receiptImage);
  } catch (err) {
    if (err instanceof UnsupportedAttachmentError) return false;
    throw err;
  }
  if (!isAllowedAttachmentMimeType(file.type) || file.size > ATTACHMENT_MAX_SIZE_BYTES) {
    return false;
  }

  const results = await Promise.all(
    transactions.map((tx) => uploadAttachment(tx.id, file))
  );
  return results.some((res) => res.ok);
}

export default function ReceiptReview({
  scanResult,
  categories,
  accounts,
  receiptImage,
  onBack,
  onComplete
}: Props) {
  const { locale, t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const quantityToText = (quantity: number) => String(quantity).replace(".", locale === "de" ? "," : ".");

  const expenseCategories = categories.filter((c) => !c.isIncome);
  const defaultCategoryId = expenseCategories[0]?.id ?? "";

  const [merchant, setMerchant] = useState(scanResult.merchant ?? "");
  // The scanned date is free text from the model: anything that is not a real
  // calendar day becomes today (Europe/Berlin) instead of a 400 on booking.
  const [receiptDate, setReceiptDate] = useState(() => receiptDayOrToday(scanResult.date));
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  // null = switch untouched: the request carries no `taxRelevant` and every
  // booking inherits the flag of its category, like a manual booking.
  const [taxOverride, setTaxOverride] = useState<boolean | null>(null);

  const [items, setItems] = useState<LineItem[]>(() =>
    scanResult.items.length > 0
      ? scanResult.items.map((item, i) => ({
          ...item,
          quantityText: quantityToText(item.quantity),
          quantityTouched: false,
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
            quantityText: "1",
            quantityTouched: false,
            unitPriceCents: 0,
            totalCents: 0,
            categoryId: defaultCategoryId,
            position: 0
          }
        ]
  );

  // The field keeps exactly what was typed (also nothing at all); the quantity
  // that is booked only follows once the text is a usable number.
  const updateQuantityText = (index: number, text: string) => {
    const quantity = parseQuantity(text);
    updateItem(index, quantity === null ? { quantityText: text } : { quantityText: text, quantity });
  };

  const updateItem = (index: number, updates: Partial<LineItem>) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, ...updates };
        if ("quantity" in updates || "unitPriceCents" in updates) {
          // Whole cents: 0.345 × 1299 would otherwise be a fraction the API rejects.
          updated.totalCents = lineTotalCents(updated.quantity, updated.unitPriceCents);
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
        quantityText: "1",
        quantityTouched: false,
        unitPriceCents: 0,
        totalCents: 0,
        categoryId: defaultCategoryId,
        position: prev.length
      }
    ]);
  };

  // Only named lines in a known category are booked — the preview and its
  // total show exactly those.
  const grouped = useMemo(() => groupBookableLines(items, categories), [items, categories]);

  const totalCents = bookedTotalCents(grouped);

  // While untouched, the switch shows what the bookings will inherit from the
  // categories chosen below: on if all are tax-relevant, off if none is,
  // "mixed" otherwise. Touching it sets one explicit value for all bookings.
  const inheritedTax = inheritedTaxRelevance(grouped);
  const taxChecked = taxOverride ?? inheritedTax === "all";
  const taxMixed = taxOverride === null && inheritedTax === "mixed";

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/transactions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildBatchRequest({ receiptDate, merchant, accountId, taxOverride, groups: grouped })
        )
      });

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Unknown error" }));
        const message =
          typeof err.error === "string" ? err.error : "Failed to create transactions";
        throw new Error(message);
      }

      return res.json() as Promise<{ transactions: Array<{ id: string }> }>;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      toast.success(t("receiptScanner.booked"));

      if (receiptImage) {
        const attached = await attachReceiptImageToTransactions(receiptImage, data.transactions);
        if (attached) {
          queryClient.invalidateQueries({ queryKey: ["tax"] });
        } else {
          toast.error(t("receiptScanner.attachmentFailed"));
        }
      }

      onComplete();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    }
  });

  // A line that will be booked needs a usable quantity (the field may be empty while typing).
  const quantitiesValid = items.every((i) => !i.name.trim() || parseQuantity(i.quantityText) !== null);

  // The date field can be emptied by hand; the endpoint needs a real calendar day.
  const canSubmit =
    items.some((i) => i.name.trim() && i.totalCents !== 0) &&
    accountId &&
    parseDayKey(receiptDate) !== null &&
    quantitiesValid;

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
              checked={taxChecked}
              ref={(el) => {
                if (el) el.indeterminate = taxMixed;
              }}
              aria-checked={taxMixed ? "mixed" : taxChecked}
              onChange={(e) => setTaxOverride(e.target.checked)}
              className="rounded border-line text-brand focus:ring-brand"
            />
            {t("receiptScanner.taxRelevant")}
          </label>
        </div>
      </div>

      {/* Line Items */}
      <div className="mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 text-sm font-semibold text-ink">
              {t("receiptScanner.positions")}
            </h2>
            <InfoTip topic="receipt.grouping" />
          </div>
          <button
            type="button"
            onClick={addItem}
            className="text-sm font-medium text-brand hover:text-brand-hover"
          >
            + {t("receiptScanner.addPosition")}
          </button>
        </div>

        {items.map((item, index) => {
          const quantityInvalid = parseQuantity(item.quantityText) === null;
          const showQuantityError = quantityInvalid && item.quantityTouched;
          return (
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
                  type="text"
                  inputMode="decimal"
                  aria-label={t("receiptScanner.qty")}
                  aria-invalid={showQuantityError}
                  value={item.quantityText}
                  onChange={(e) => updateQuantityText(index, e.target.value)}
                  onBlur={() => updateItem(index, { quantityTouched: true })}
                  className={`w-full rounded-field border bg-bg px-2 py-1 text-base tabular-nums text-ink focus:outline-none focus:ring-1 md:text-sm ${
                    showQuantityError
                      ? "border-danger focus:border-danger focus:ring-danger"
                      : "border-line focus:border-brand focus:ring-brand"
                  }`}
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
                  {quantityInvalid ? "–" : <>{formatCents(item.totalCents)}{"\u00A0\u20AC"}</>}
                </div>
              </div>
            </div>
            {showQuantityError && (
              <p role="alert" className="mt-1 text-xs text-danger">
                {t("receiptScanner.qtyInvalid")}
              </p>
            )}

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
          );
        })}
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
