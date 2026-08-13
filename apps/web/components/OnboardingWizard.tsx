"use client";

import { parseCents } from "@doewe/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { useApiQuery } from "../lib/api/useApiQuery";
import { useI18n } from "../lib/i18n";

import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { useToast } from "./ui/Toast";

/**
 * 60-Sekunden Onboarding-Wizard (Calm Finance, Design-System-Deliverable).
 *
 * Drei überspringbare Schritte, die die Dashboard-Hero-Karte sofort mit echten
 * Zahlen füllen — der Aktivierungs-Aha-Moment:
 *   1. Monatseinkommen  → Dauerauftrag (positiv, Tag 1)
 *   2. Größte Fixkosten → bis zu 3 Daueraufträge (negativ, Tag 1)
 *   3. Optional 1 Sparziel → datiertes Sparziel (nächster Monat)
 *
 * Analytics klassifiziert Einnahme/Ausgabe nach Betrags-VORZEICHEN, daher braucht
 * der Wizard keine Kategorie-Auswahl. Leere Felder werden nicht angelegt.
 */

type Account = { id: string; name: string };

type FixedCost = { description: string; amount: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
};

const MAX_FIXED_COSTS = 3;

function nextMonth(now = new Date()): { month: number; year: number } {
  const month = now.getMonth() + 2; // 1-based next month
  if (month > 12) return { month: 1, year: now.getFullYear() + 1 };
  return { month, year: now.getFullYear() };
}

const inputClass =
  "w-full rounded-field border-line-strong bg-surface text-ink focus:border-brand focus:ring-brand";

export default function OnboardingWizard({ open, onOpenChange, onComplete }: Props) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();

  const accountsQuery = useApiQuery<Account[]>(["accounts"], "/api/accounts");
  const accountId = accountsQuery.data?.[0]?.id ?? null;

  const [step, setStep] = useState(0);
  const [income, setIncome] = useState("");
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([{ description: "", amount: "" }]);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Reset the flow whenever the wizard reopens.
  useEffect(() => {
    if (open) {
      setStep(0);
      setIncome("");
      setFixedCosts([{ description: "", amount: "" }]);
      setGoalTitle("");
      setGoalAmount("");
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  // Move focus to the first field of each step (respects keyboard/AT users).
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => firstFieldRef.current?.focus(), 60);
      return () => window.clearTimeout(id);
    }
  }, [open, step]);

  const totalSteps = 3;

  function updateFixedCost(index: number, patch: Partial<FixedCost>) {
    setFixedCosts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addFixedCost() {
    setFixedCosts((rows) => (rows.length < MAX_FIXED_COSTS ? [...rows, { description: "", amount: "" }] : rows));
  }

  function removeFixedCost(index: number) {
    setFixedCosts((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : rows));
  }

  async function createRecurring(payload: { amountCents: number; description: string }): Promise<boolean> {
    if (!accountId) return false;
    const res = await fetch("/api/recurring-transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        amountCents: payload.amountCents,
        description: payload.description,
        intervalMonths: 1,
        dayOfMonth: 1,
      }),
    });
    return res.ok;
  }

  async function handleFinish() {
    setError(null);

    if (!accountId) {
      setError(t("dashboard.wizard.errorNoAccount"));
      return;
    }

    setSubmitting(true);
    try {
      // 1. Income
      const trimmedIncome = income.trim();
      if (trimmedIncome) {
        const cents = parseCents(trimmedIncome);
        if (cents > 0) {
          const ok = await createRecurring({
            amountCents: cents,
            description: t("dashboard.wizard.incomeDescription"),
          });
          if (!ok) throw new Error("income");
        }
      }

      // 2. Fixed costs
      for (const row of fixedCosts) {
        const desc = row.description.trim();
        const amount = row.amount.trim();
        if (!desc || !amount) continue;
        const cents = parseCents(amount);
        if (cents <= 0) continue;
        const ok = await createRecurring({ amountCents: -cents, description: desc });
        if (!ok) throw new Error("fixed");
      }

      // 3. Optional saving goal (dated, next month)
      const title = goalTitle.trim();
      const amount = goalAmount.trim();
      if (title && amount) {
        const cents = parseCents(amount);
        if (cents > 0) {
          const { month, year } = nextMonth();
          const res = await fetch("/api/saving-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountId, title, targetMonth: month, targetYear: year, amountCents: cents }),
          });
          if (!res.ok) throw new Error("goal");
        }
      }

      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
      void queryClient.invalidateQueries({ queryKey: ["recurring"] });
      void queryClient.invalidateQueries({ queryKey: ["saving-plan"] });

      toast.success(t("dashboard.wizard.success"));
      onOpenChange(false);
      onComplete?.();
    } catch {
      setError(t("dashboard.wizard.errorSave"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("dashboard.wizard.title")}>
      <div className="relative flex max-h-[calc(100vh-4rem)] w-full flex-col overflow-y-auto rounded-card border border-line bg-surface p-5 text-left shadow-raised sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">{t("dashboard.wizard.title")}</h2>
            <p className="mt-0.5 text-xs text-ink-muted">{t("dashboard.wizard.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t("common.close")}
            className="rounded-field p-1.5 text-ink-muted transition hover:bg-surface-2 hover:text-ink focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ×
            </span>
          </button>
        </div>

        {/* Step indicator */}
        <div className="mt-4 flex items-center gap-2" aria-hidden="true">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-base ${i <= step ? "bg-brand" : "bg-surface-2"}`}
            />
          ))}
        </div>
        <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
          {t("dashboard.wizard.stepLabel", { current: step + 1, total: totalSteps })}
        </p>

        <div key={step} className="mt-4 space-y-4 animate-fade-in-up motion-reduce:animate-none">
          {step === 0 && (
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-semibold text-ink">{t("dashboard.wizard.income.title")}</h3>
                <p className="mt-0.5 text-sm text-ink-muted">{t("dashboard.wizard.income.subtitle")}</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="wizard-income">
                  {t("dashboard.wizard.income.label")}
                </label>
                <input
                  ref={firstFieldRef}
                  id="wizard-income"
                  inputMode="decimal"
                  value={income}
                  onChange={(e) => setIncome(e.target.value)}
                  placeholder={t("dashboard.wizard.amountPlaceholder")}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-ink-muted">{t("dashboard.wizard.income.hint")}</p>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-semibold text-ink">{t("dashboard.wizard.fixed.title")}</h3>
                <p className="mt-0.5 text-sm text-ink-muted">{t("dashboard.wizard.fixed.subtitle")}</p>
              </div>
              <ul className="space-y-3">
                {fixedCosts.map((row, index) => (
                  <li key={index} className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <label className="mb-1 block text-xs font-medium text-ink-muted" htmlFor={`wizard-fixed-desc-${index}`}>
                        {t("dashboard.wizard.fixed.descLabel")}
                      </label>
                      <input
                        ref={index === 0 ? firstFieldRef : undefined}
                        id={`wizard-fixed-desc-${index}`}
                        value={row.description}
                        onChange={(e) => updateFixedCost(index, { description: e.target.value })}
                        placeholder={t("dashboard.wizard.fixed.descPlaceholder")}
                        className={inputClass}
                      />
                    </div>
                    <div className="w-28 shrink-0">
                      <label className="mb-1 block text-xs font-medium text-ink-muted" htmlFor={`wizard-fixed-amount-${index}`}>
                        {t("dashboard.wizard.fixed.amountLabel")}
                      </label>
                      <input
                        id={`wizard-fixed-amount-${index}`}
                        inputMode="decimal"
                        value={row.amount}
                        onChange={(e) => updateFixedCost(index, { amount: e.target.value })}
                        placeholder={t("dashboard.wizard.amountPlaceholder")}
                        className={inputClass}
                      />
                    </div>
                    {fixedCosts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeFixedCost(index)}
                        aria-label={t("dashboard.wizard.fixed.remove")}
                        className="mb-1 shrink-0 rounded-field p-2 text-ink-muted transition hover:bg-surface-2 hover:text-ink focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {fixedCosts.length < MAX_FIXED_COSTS && (
                <button
                  type="button"
                  onClick={addFixedCost}
                  className="text-sm font-medium text-brand transition hover:text-brand-hover focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                  {t("dashboard.wizard.fixed.add")}
                </button>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-semibold text-ink">{t("dashboard.wizard.goal.title")}</h3>
                <p className="mt-0.5 text-sm text-ink-muted">{t("dashboard.wizard.goal.subtitle")}</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="wizard-goal-title">
                  {t("dashboard.wizard.goal.nameLabel")}
                </label>
                <input
                  ref={firstFieldRef}
                  id="wizard-goal-title"
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  placeholder={t("dashboard.wizard.goal.namePlaceholder")}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="wizard-goal-amount">
                  {t("dashboard.wizard.goal.amountLabel")}
                </label>
                <input
                  id="wizard-goal-amount"
                  inputMode="decimal"
                  value={goalAmount}
                  onChange={(e) => setGoalAmount(e.target.value)}
                  placeholder={t("dashboard.wizard.amountPlaceholder")}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-ink-muted">{t("dashboard.wizard.goal.hint")}</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center gap-2">
          {step > 0 ? (
            <Button type="button" variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={submitting}>
              {t("dashboard.wizard.back")}
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("dashboard.wizard.skip")}
            </Button>
          )}
          <div className="flex-1" />
          {step < totalSteps - 1 ? (
            <Button type="button" onClick={() => setStep((s) => s + 1)}>
              {t("dashboard.wizard.next")}
            </Button>
          ) : (
            <Button type="button" onClick={handleFinish} loading={submitting}>
              {submitting ? t("dashboard.wizard.finishing") : t("dashboard.wizard.finish")}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
