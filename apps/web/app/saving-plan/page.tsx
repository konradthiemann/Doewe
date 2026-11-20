"use client";

import { parseCents } from "@doewe/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CompleteGoalDialog } from "../../components/CompleteGoalDialog";
import PageContainer from "../../components/PageContainer";
import PlannedSavingForm from "../../components/PlannedSavingForm";
import { GoalCard, type SavingGoal, type SavingsPayment } from "../../components/saving-plan/GoalCard";
import { SavingsPaymentDialog } from "../../components/SavingsPaymentDialog";
import { InfoTip } from "../../components/ui/InfoTip";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../components/ui/Toast";
import { useApiQuery } from "../../lib/api/useApiQuery";
import { formatBookingDayMonth, formatMonth } from "../../lib/bookingDate";
import { useI18n } from "../../lib/i18n";

type SavingPlanResponse = {
  goals: SavingGoal[];
  undatedGoals: SavingGoal[];
  completedGoals: SavingGoal[];
  totals: {
    totalTargetCents: number;
    monthlyRateCents: number;
  };
};

function SavingPlanPage() {
  const { locale, t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  // Mutationsfehler (Löschen/Reopen/Rate/Zahlung) laufen nicht über die Query — separat halten
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<SavingGoal | null>(null);
  const [scheduleIntent, setScheduleIntent] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<SavingGoal | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<SavingGoal | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<SavingGoal | null>(null);
  // The button that opened the complete or payment dialog: gets the focus back on cancel.
  const dialogTriggerRef = useRef<HTMLElement | null>(null);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [applyingRateId, setApplyingRateId] = useState<string | null>(null);
  const [removingPaymentId, setRemovingPaymentId] = useState<string | null>(null);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement | null>(null);
  const withdrawDialogRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";

  // Same localized currency format as the dashboard ("1.234,56 €" in de).
  const formatCurrency = useCallback(
    (cents: number) =>
      `${(cents / 100).toLocaleString(dateLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`,
    [dateLocale]
  );

  // Phase 2 „Offline lesen": Plan kommt aus dem persistierten Query-Cache —
  // offline zeigt die Seite den letzten geladenen Stand.
  const planQuery = useApiQuery<SavingPlanResponse>(["saving-plan"], "/api/saving-plan");
  const plan = planQuery.data ?? null;
  const loading = planQuery.isPending;
  // Reference instant for "months left" and "date has passed": when the plan was loaded.
  const now = useMemo(
    () => new Date(planQuery.dataUpdatedAt > 0 ? planQuery.dataUpdatedAt : Date.now()),
    [planQuery.dataUpdatedAt]
  );

  // Nach Mutationen Plan + abhängige Ansichten neu laden (die Entnahme erzeugt
  // eine Buchung; Raten und Abschlüsse erscheinen im Dashboard).
  const invalidatePlan = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["saving-plan"] });
    void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }, [queryClient]);

  const loadError = planQuery.isError
    ? (() => {
        const match =
          planQuery.error instanceof Error ? /failed with status (\d+)/.exec(planQuery.error.message) : null;
        return match
          ? t("savingPlan.errorLoad", { status: Number(match[1]) })
          : t("savingPlan.errorLoadFallback");
      })()
    : null;
  const error = loadError ?? mutationError;

  const goals = plan?.goals ?? [];
  const completedGoals = plan?.completedGoals ?? [];
  const undatedGoals = plan?.undatedGoals ?? [];

  useEffect(() => {
    const shouldOpen = searchParams.get("new") === "1";
    setDialogOpen(shouldOpen);
    if (shouldOpen) {
      setEditGoal(null);
      setScheduleIntent(false);
    }
  }, [searchParams]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (dialogOpen || deleteConfirm || withdrawOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
    document.body.style.overflow = previousOverflow;
  }, [dialogOpen, deleteConfirm, withdrawOpen]);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setEditGoal(null);
    setScheduleIntent(false);
    router.replace("/saving-plan", { scroll: false });
  }, [router]);

  const openEditDialog = useCallback((goal: SavingGoal, withScheduleIntent = false) => {
    setEditGoal(goal);
    setScheduleIntent(withScheduleIntent);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    setMutationError(null);
    try {
      const res = await fetch(`/api/saving-plan/${deleteConfirm.id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(t("savingPlan.errorDeleteFailed", { status: res.status }));
      }
      invalidatePlan();
      toast.success(t("savingPlan.feedbackDeleted"));
      setDeleteConfirm(null);
    } catch (deleteError) {
      setMutationError(deleteError instanceof Error ? deleteError.message : t("savingPlan.errorDelete"));
    } finally {
      setDeleting(false);
    }
  }, [deleteConfirm, invalidatePlan, t, toast]);

  const openCompleteDialog = useCallback((goal: SavingGoal, trigger: HTMLElement) => {
    dialogTriggerRef.current = trigger;
    setCompleteTarget(goal);
  }, []);

  const handleCompleted = useCallback(() => {
    invalidatePlan();
    toast.success(t("savingPlan.complete.done"));
    setCompleteTarget(null);
  }, [invalidatePlan, t, toast]);

  const openPaymentDialog = useCallback((goal: SavingGoal, trigger: HTMLElement) => {
    dialogTriggerRef.current = trigger;
    setPaymentTarget(goal);
  }, []);

  const handlePaymentAdded = useCallback(
    (amountCents: number) => {
      invalidatePlan();
      toast.success(t("savingPlan.payment.success", { amount: formatCurrency(amountCents) }));
      setPaymentTarget(null);
    },
    [formatCurrency, invalidatePlan, t, toast]
  );

  const handleRemovePayment = useCallback(
    async (goal: SavingGoal, payment: SavingsPayment) => {
      setRemovingPaymentId(payment.id);
      setMutationError(null);
      try {
        const res = await fetch(`/api/saving-plan/${goal.id}/payments/${payment.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(t("savingPlan.goal.errorPaymentRemove"));
        invalidatePlan();
        toast.success(t("savingPlan.goal.paymentRemoved"));
      } catch (removeError) {
        setMutationError(removeError instanceof Error ? removeError.message : t("savingPlan.goal.errorPaymentRemove"));
      } finally {
        setRemovingPaymentId(null);
      }
    },
    [invalidatePlan, t, toast]
  );

  const handleApplyRate = useCallback(
    async (goal: SavingGoal) => {
      if (goal.suggestedMonthlyRateCents == null) return;
      setApplyingRateId(goal.id);
      setMutationError(null);
      try {
        const res = await fetch(`/api/saving-plan/${goal.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ monthlyRateCents: goal.suggestedMonthlyRateCents })
        });
        if (!res.ok) throw new Error(t("savingPlan.goal.errorRate"));
        invalidatePlan();
        toast.success(t("savingPlan.goal.rateApplied"));
      } catch (rateError) {
        setMutationError(rateError instanceof Error ? rateError.message : t("savingPlan.goal.errorRate"));
      } finally {
        setApplyingRateId(null);
      }
    },
    [invalidatePlan, t, toast]
  );

  const handleReopen = useCallback(
    async (goal: SavingGoal) => {
      setReopeningId(goal.id);
      setMutationError(null);
      try {
        const res = await fetch(`/api/saving-plan/${goal.id}/complete`, { method: "DELETE" });
        if (!res.ok) {
          throw new Error(t("savingPlan.errorReopen"));
        }
        invalidatePlan();
        toast.success(t("savingPlan.feedbackReopened"));
      } catch (reopenErr) {
        setMutationError(reopenErr instanceof Error ? reopenErr.message : t("savingPlan.errorReopen"));
      } finally {
        setReopeningId(null);
      }
    },
    [invalidatePlan, t, toast]
  );

  const openWithdrawDialog = useCallback(() => {
    setWithdrawAmount("");
    setWithdrawError(null);
    setWithdrawOpen(true);
  }, []);

  const closeWithdrawDialog = useCallback(() => {
    setWithdrawOpen(false);
    setWithdrawAmount("");
    setWithdrawError(null);
  }, []);

  const handleWithdraw = useCallback(async () => {
    let amountCents: number;
    try {
      amountCents = parseCents(withdrawAmount);
    } catch {
      setWithdrawError(t("savingPlan.withdraw.errorInvalid"));
      return;
    }
    if (amountCents <= 0) {
      setWithdrawError(t("savingPlan.withdraw.errorInvalid"));
      return;
    }
    setWithdrawing(true);
    try {
      const res = await fetch("/api/saving-plan/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents,
          description: t("savingPlan.withdraw.transactionDescription")
        })
      });
      if (!res.ok) {
        throw new Error(t("savingPlan.withdraw.errorFailed"));
      }
      invalidatePlan();
      toast.success(t("savingPlan.withdraw.success", { amount: formatCurrency(amountCents) }));
      closeWithdrawDialog();
    } catch (withdrawErr) {
      setWithdrawError(withdrawErr instanceof Error ? withdrawErr.message : t("savingPlan.withdraw.errorFailed"));
    } finally {
      setWithdrawing(false);
    }
  }, [closeWithdrawDialog, formatCurrency, invalidatePlan, t, toast, withdrawAmount]);

  useEffect(() => {
    if (!dialogOpen) return;
    const node = dialogRef.current;
    node?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeDialog, dialogOpen]);

  useEffect(() => {
    if (!withdrawOpen) return;
    const node = withdrawDialogRef.current;
    node?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeWithdrawDialog();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeWithdrawDialog, withdrawOpen]);

  const handleSuccess = useCallback(
    async (message?: string) => {
      invalidatePlan();
      toast.success(message ?? t("savingPlan.feedbackAdded"));
      closeDialog();
    },
    [closeDialog, invalidatePlan, t, toast]
  );

  const timelineEmpty = !loading && goals.length === 0;

  const cardProps = {
    now,
    formatCurrency,
    dateLocale,
    removingPaymentId,
    onApplyRate: (goal: SavingGoal) => void handleApplyRate(goal),
    onAddPayment: openPaymentDialog,
    onRemovePayment: (goal: SavingGoal, payment: SavingsPayment) => void handleRemovePayment(goal, payment),
    onComplete: openCompleteDialog,
    onEdit: (goal: SavingGoal) => openEditDialog(goal),
    onDelete: (goal: SavingGoal) => setDeleteConfirm(goal)
  };

  return (
    <main id="maincontent" className="py-6 md:py-8">
      <PageContainer className="space-y-8">
      {error && (
        <div className="rounded-field border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          {error}
        </div>
      )}

      <section
        aria-labelledby="saving-plan-summary"
        className="grid gap-4 rounded-card border border-line bg-surface/95 p-5 shadow-card backdrop-blur"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 id="saving-plan-summary" className="min-w-0 text-lg font-medium">
              {t("savingPlan.summaryTitle")}
            </h2>
            <InfoTip topic="savingPlan.rate" />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openWithdrawDialog}
              className="inline-flex items-center gap-1.5 rounded-field border border-brand/40 bg-surface px-3 py-1.5 text-xs font-medium text-brand shadow-card transition hover:bg-brand-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v8.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 1 1 1.06-1.06l3.22 3.22V3.75A.75.75 0 0 1 10 3Z" clipRule="evenodd" />
              </svg>
              {t("savingPlan.withdraw.action")}
            </button>
            <InfoTip topic="savingPlan.withdraw" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0 rounded-field border border-line bg-savings-soft p-4 text-ink">
            <p className="text-xs font-semibold uppercase tracking-wide text-savings">{t("savingPlan.summaryMonthlyRate")}</p>
            <p className="text-xl font-semibold tabular-nums">{formatCurrency(plan?.totals.monthlyRateCents ?? 0)}</p>
            <p className="text-xs text-ink-muted">{t("savingPlan.summaryMonthlyRateHelp")}</p>
          </div>
          <div className="min-w-0 rounded-field border border-line bg-surface-2 p-4 text-ink">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("savingPlan.summaryPlannedTotal")}</p>
            <p className="text-xl font-semibold tabular-nums">{formatCurrency(plan?.totals.totalTargetCents ?? 0)}</p>
            <p className="text-xs text-ink-muted">{t("savingPlan.summaryPlannedHelp")}</p>
          </div>
        </div>
        <p className="text-xs text-ink-muted">{t("savingPlan.summaryNote")}</p>
      </section>

      <section aria-labelledby="saving-plan-timeline" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 id="saving-plan-timeline" className="min-w-0 text-lg font-medium">
              {t("savingPlan.timelineTitle")}
            </h2>
            <InfoTip topic="savingPlan.spending" />
          </div>
          <span className="text-right text-xs uppercase tracking-wide text-ink-muted">{t("savingPlan.timelineHint")}</span>
        </div>
        {loading ? (
          <p className="text-sm text-ink-muted">{t("savingPlan.timelineLoading")}</p>
        ) : timelineEmpty ? (
          <div className="rounded-card border border-dashed border-line-strong bg-surface/60 p-8 text-center text-sm text-ink-muted shadow-card">
            <p>{t("savingPlan.timelineEmpty")}</p>
          </div>
        ) : (
          <ol className="relative max-w-3xl border-l border-line pl-6">
            {goals.map((goal, index) => {
              const isLast = index === goals.length - 1;
              return (
                <li key={goal.id} className="relative pb-10 last:pb-0">
                  <span className="absolute -left-[9px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-savings bg-surface">
                    <span className="h-2 w-2 rounded-full bg-savings" aria-hidden="true" />
                  </span>
                  {!isLast && <span aria-hidden="true" className="absolute left-0 top-5 h-full w-px bg-line" />}
                  <div className="ml-4">
                    <GoalCard goal={goal} applyingRate={applyingRateId === goal.id} {...cardProps} />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {undatedGoals.length > 0 && (
        <section aria-labelledby="saving-plan-undated" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="saving-plan-undated" className="text-lg font-medium">
              {t("savingPlan.undatedTitle")}
            </h2>
            <span className="text-xs uppercase tracking-wide text-ink-muted">
              {t("savingPlan.undatedHint")}
            </span>
          </div>
          <p className="text-sm text-ink-muted">{t("savingPlan.undatedSubtitleRate")}</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {undatedGoals.map((goal) => (
              <li key={goal.id} className="min-w-0">
                <GoalCard
                  goal={goal}
                  applyingRate={false}
                  onSchedule={(target) => openEditDialog(target, true)}
                  {...cardProps}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {completedGoals.length > 0 && (
        <section aria-labelledby="saving-plan-completed" className="space-y-4">
          <button
            type="button"
            onClick={() => setCompletedExpanded((value) => !value)}
            aria-expanded={completedExpanded}
            className="flex w-full items-center justify-between rounded-field text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <h2 id="saving-plan-completed" className="text-lg font-medium">
              {t("savingPlan.completedSectionTitle", { count: completedGoals.length })}
            </h2>
            <span aria-hidden="true" className="text-sm text-ink-muted">
              {completedExpanded ? "▾" : "▸"}
            </span>
          </button>
          {completedExpanded && (
            <ul className="grid gap-3 lg:grid-cols-2">
              {completedGoals.map((goal) => {
                const dueDate =
                  goal.month != null && goal.year != null
                    ? formatMonth({ year: goal.year, month: goal.month }, dateLocale)
                    : "";
                const completedDate = goal.completedAt
                  ? formatBookingDayMonth(goal.completedAt, dateLocale, { month: "long", year: true })
                  : null;
                const spent = goal.spentCents ?? 0;
                const diff = goal.amountCents != null ? spent - goal.amountCents : 0;
                return (
                  <li
                    key={goal.id}
                    className="min-w-0 rounded-card border border-success/30 bg-success-soft p-4 shadow-card"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-success">
                          {dueDate}
                        </p>
                        <h3 className="break-words text-lg font-semibold text-ink">{goal.title}</h3>
                        {completedDate && (
                          <p className="text-xs text-ink-muted">
                            {t("savingPlan.completedOn", { date: completedDate })}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-wide text-ink-muted">{t("savingPlan.timelineGoal")}</p>
                        <p className="text-lg font-semibold text-ink">{formatCurrency(goal.amountCents ?? 0)}</p>
                        <p className="text-xs text-ink-muted">
                          {t("savingPlan.completedSpent", { amount: formatCurrency(spent) })}
                        </p>
                      </div>
                    </div>
                    {diff !== 0 && (
                      <p className="mt-2 text-xs text-ink-muted">
                        {diff > 0
                          ? t("savingPlan.completedOverTarget", { amount: formatCurrency(diff) })
                          : t("savingPlan.completedUnderTarget", { amount: formatCurrency(-diff) })}
                      </p>
                    )}
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleReopen(goal)}
                        disabled={reopeningId === goal.id}
                        className="inline-flex items-center rounded-field border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-card hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
                      >
                        {reopeningId === goal.id && <Spinner size="sm" className="mr-2" />}
                        {reopeningId === goal.id ? t("savingPlan.reopening") : t("savingPlan.reopen")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      </PageContainer>

      {dialogOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={closeDialog} />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="saving-plan-dialog-heading"
            className="relative z-10 mx-4 flex w-full max-w-xl justify-center focus:outline-none"
            tabIndex={-1}
          >
            <PlannedSavingForm
              headingId="saving-plan-dialog-heading"
              onClose={closeDialog}
              onSuccess={handleSuccess}
              initialScheduled={scheduleIntent ? true : undefined}
              editGoal={editGoal ? {
                id: editGoal.id,
                accountId: editGoal.accountId,
                title: editGoal.title,
                month: editGoal.month,
                year: editGoal.year,
                amountCents: editGoal.amountCents,
                monthlyRateCents: editGoal.monthlyRateCents
              } : undefined}
            />
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={() => setDeleteConfirm(null)} />
          <div
            ref={deleteDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-heading"
            aria-describedby="delete-confirm-message"
            className="relative z-10 mx-4 w-full max-w-md rounded-card bg-surface p-6 shadow-raised focus:outline-none"
            tabIndex={-1}
          >
            <h2 id="delete-confirm-heading" className="text-lg font-semibold text-ink">
              {t("savingPlan.confirmDeleteTitle")}
            </h2>
            <p id="delete-confirm-message" className="mt-2 text-sm text-ink-muted">
              {t("savingPlan.confirmDeleteMessage", { title: deleteConfirm.title })}
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="inline-flex items-center rounded-field border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink shadow-card hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {t("savingPlan.confirmDeleteCancel")}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center rounded-field border border-transparent bg-danger px-4 py-2 text-sm font-medium text-brand-on shadow-card hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {deleting && <Spinner size="sm" className="mr-2" />}
                {deleting ? t("savingPlan.deleting") : t("savingPlan.confirmDeleteConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      <CompleteGoalDialog
        goal={completeTarget}
        formatCurrency={formatCurrency}
        onClose={() => setCompleteTarget(null)}
        onCompleted={handleCompleted}
        returnFocusTo={dialogTriggerRef.current}
      />

      <SavingsPaymentDialog
        goal={paymentTarget}
        formatCurrency={formatCurrency}
        onClose={() => setPaymentTarget(null)}
        onAdded={handlePaymentAdded}
        returnFocusTo={dialogTriggerRef.current}
      />

      {withdrawOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={closeWithdrawDialog} />
          <div
            ref={withdrawDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="withdraw-heading"
            aria-describedby="withdraw-message"
            className="relative z-10 mx-4 w-full max-w-md rounded-card bg-surface p-6 shadow-raised focus:outline-none"
            tabIndex={-1}
          >
            <h2 id="withdraw-heading" className="text-lg font-semibold text-ink">
              {t("savingPlan.withdraw.dialogTitle")}
            </h2>
            <p id="withdraw-message" className="mt-2 text-sm text-ink-muted">
              {t("savingPlan.withdraw.dialogMessage")}
            </p>
            <div className="mt-4">
              <label htmlFor="withdraw-amount" className="block text-sm font-medium text-ink">
                {t("savingPlan.withdraw.amountLabel")}
              </label>
              <input
                id="withdraw-amount"
                type="text"
                inputMode="decimal"
                value={withdrawAmount}
                onChange={(event) => setWithdrawAmount(event.target.value)}
                placeholder={t("savingPlan.form.amountPlaceholder")}
                className="mt-1 block w-full rounded-field border-line-strong bg-surface text-base shadow-card focus:border-brand focus:ring-brand md:text-sm"
              />
              <p className="mt-1 text-xs text-ink-muted">{t("savingPlan.withdraw.amountHint")}</p>
              {withdrawError && (
                <p role="alert" className="mt-1 text-xs text-danger">{withdrawError}</p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeWithdrawDialog}
                disabled={withdrawing}
                className="inline-flex items-center rounded-field border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink shadow-card hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {t("savingPlan.confirmDeleteCancel")}
              </button>
              <button
                type="button"
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="inline-flex items-center rounded-field border border-transparent bg-brand px-4 py-2 text-sm font-medium text-brand-on shadow-card hover:bg-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {withdrawing && <Spinner size="sm" className="mr-2" />}
                {withdrawing ? t("savingPlan.withdraw.submitting") : t("savingPlan.withdraw.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function SavingPlanPageWithSuspense() {
  const { t } = useI18n();

  return (
    <Suspense fallback={<main className="p-6"><p className="text-sm text-ink-muted">{t("savingPlan.loading")}</p></main>}>
      <SavingPlanPage />
    </Suspense>
  );
}
