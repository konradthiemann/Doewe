"use client";

import { parseMoneyInput, type BudgetPeriod } from "@doewe/shared";
import { useId, useState, type KeyboardEvent } from "react";

import { useI18n } from "../../lib/i18n";
import { Button } from "../ui/Button";

import { YearlyBudgetPreview } from "./YearlyBudgetPreview";

/** Shared column template (desktop): category | period | amount | actions. */
export const BUDGET_EDITOR_COLS = "lg:grid-cols-[minmax(6rem,1fr)_10rem_9rem_14rem]";

export interface BudgetPlanEditorProps {
  category: { id: string; name: string };
  plan: { id: string; period: BudgetPeriod; amountCents: number } | null;
  availablePerMonthCents: number[];
  monthLabels: string[];
  formatCurrency: (cents: number) => string;
  onSave: (value: { period: BudgetPeriod; amountCents: number }) => void;
  /** Without a handler (or without a plan) no delete button is shown. */
  onDelete?: () => void;
  busy?: boolean;
}

/** 12345 -> "123,45" (German, no thousands separators, so it re-parses unchanged). */
function toInputText(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}

const fieldClass =
  "w-full rounded-field border border-line-strong bg-surface px-3 py-2 text-base text-ink md:text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const labelClass = "text-xs font-medium text-ink-muted lg:sr-only";

/** One category row: choose monthly/yearly, enter an amount, save or remove. */
export function BudgetPlanEditor({
  category,
  plan,
  availablePerMonthCents,
  monthLabels,
  formatCurrency,
  onSave,
  onDelete,
  busy = false
}: BudgetPlanEditorProps) {
  const { t } = useI18n();
  const id = useId();
  const [period, setPeriod] = useState<BudgetPeriod>(plan?.period ?? "MONTHLY");
  const [text, setText] = useState(plan ? toInputText(plan.amountCents) : "");

  const parsed = parseMoneyInput(text);
  const valid = parsed !== null && parsed > 0;

  const submit = () => {
    if (busy || parsed === null || parsed <= 0) return;
    onSave({ period, amountCents: parsed });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submit();
  };

  return (
    <div className="space-y-3 p-3">
      <div className={`grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:items-center ${BUDGET_EDITOR_COLS}`}>
        <p className="min-w-0 truncate text-sm font-medium text-ink sm:col-span-2 lg:col-span-1" title={category.name}>
          {category.name}
        </p>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-period`} className={labelClass}>
            {t("budgets.period")}
          </label>
          <select
            id={`${id}-period`}
            value={period}
            onChange={(event) => setPeriod(event.target.value === "YEARLY" ? "YEARLY" : "MONTHLY")}
            disabled={busy}
            className={fieldClass}
          >
            <option value="MONTHLY">{t("budgets.monthly")}</option>
            <option value="YEARLY">{t("budgets.yearly")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-amount`} className={labelClass}>
            {t("budgets.amount")}
          </label>
          <input
            id={`${id}-amount`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
            className={`${fieldClass} text-right tabular-nums`}
          />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1 lg:justify-end">
          <Button type="button" size="sm" onClick={submit} disabled={busy || !valid}>
            {t("budgets.save")}
          </Button>
          {plan && onDelete && (
            <Button type="button" size="sm" variant="secondary" onClick={onDelete} disabled={busy}>
              {t("budgets.delete")}
            </Button>
          )}
        </div>
      </div>
      {period === "YEARLY" && (
        <YearlyBudgetPreview
          yearlyCents={parsed ?? 0}
          availablePerMonthCents={availablePerMonthCents}
          formatCurrency={formatCurrency}
          monthLabels={monthLabels}
        />
      )}
    </div>
  );
}
