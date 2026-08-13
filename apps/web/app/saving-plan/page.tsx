"use client";

import { fromCents, parseCents, toDecimalString } from "@doewe/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import PageContainer from "../../components/PageContainer";
import PlannedSavingForm from "../../components/PlannedSavingForm";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../components/ui/Toast";
import { useApiQuery } from "../../lib/api/useApiQuery";
import { useI18n } from "../../lib/i18n";

type SavingGoal = {
  id: string;
  accountId: string;
  categoryId?: string | null;
  categoryName?: string | null;
  title: string;
  month: number | null;
  year: number | null;
  amountCents: number | null;
  transactionSpentCents: number;
  completedAt?: string | null;
  spentCents?: number | null;
  createdAt: string;
};

type SavingPlanResponse = {
  goals: SavingGoal[];
  undatedGoals: SavingGoal[];
  completedGoals: SavingGoal[];
  totals: {
    rawAvailableCents: number;
    withdrawnForCompletedCents: number;
    availableCents: number;
    totalTargetCents: number;
    suggestedMonthlyCents: number;
  };
};

type GoalWithProgress = SavingGoal & {
  percent: number;
  status: "complete" | "current" | "upcoming";
  achievedCents: number;
  cumulativeTargetCents: number;
};

function formatCurrency(cents: number) {
  return `${toDecimalString(fromCents(cents))} €`;
}

function SavingPlanPage() {
  const { locale, t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  // Mutationsfehler (Löschen/Reopen) laufen nicht über die Query — separat halten
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<SavingGoal | null>(null);
  const [scheduleIntent, setScheduleIntent] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<SavingGoal | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<GoalWithProgress | null>(null);
  const [completeSpent, setCompleteSpent] = useState("");
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement | null>(null);
  const completeDialogRef = useRef<HTMLDivElement | null>(null);
  const withdrawDialogRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";

  // Phase 2 „Offline lesen": Plan kommt aus dem persistierten Query-Cache —
  // offline zeigt die Seite den letzten geladenen Stand.
  const planQuery = useApiQuery<SavingPlanResponse>(["saving-plan"], "/api/saving-plan");
  const plan = planQuery.data ?? null;
  const loading = planQuery.isPending;

  // Nach Mutationen Plan + abhängige Ansichten neu laden (Withdraw/Complete
  // erzeugen Transaktionen; alles beeinflusst die Analytics).
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

  const availableCents = useMemo(() => {
    return Math.max(plan?.totals.availableCents ?? 0, 0);
  }, [plan]);

  const goalsWithProgress: GoalWithProgress[] = useMemo(() => {
    if (!plan) return [];
    let cumulative = 0;
    return plan.goals.map((goal): GoalWithProgress => {
      const amount = goal.amountCents ?? 0;
      const start = cumulative;
      const end = cumulative + amount;
      const achieved = Math.min(Math.max(availableCents - start, 0), amount);
      const percent = amount > 0 ? Math.round((achieved / amount) * 100) : 100;
      let status: GoalWithProgress["status"];
      if (percent >= 100) status = "complete";
      else if (achieved > 0) status = "current";
      else status = "upcoming";
      cumulative = end;
      return {
        ...goal,
        achievedCents: achieved,
        percent,
        status,
        cumulativeTargetCents: end
      };
    });
  }, [availableCents, plan]);

  const lastTarget = goalsWithProgress.length ? goalsWithProgress[goalsWithProgress.length - 1].cumulativeTargetCents : 0;
  const remainingAfterGoals = Math.max(availableCents - lastTarget, 0);
  const shortfall = Math.max(lastTarget - availableCents, 0);
  const completedGoals = plan?.completedGoals ?? [];
  const undatedGoals = plan?.undatedGoals ?? [];
  const withdrawnForCompletedCents = plan?.totals.withdrawnForCompletedCents ?? 0;

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
    if (dialogOpen || deleteConfirm || completeTarget || withdrawOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
    document.body.style.overflow = previousOverflow;
  }, [dialogOpen, deleteConfirm, completeTarget, withdrawOpen]);

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

  const openCompleteDialog = useCallback((goal: GoalWithProgress) => {
    setCompleteTarget(goal);
    setCompleteSpent(toDecimalString(fromCents(goal.achievedCents)));
    setCompleteError(null);
  }, []);

  const closeCompleteDialog = useCallback(() => {
    setCompleteTarget(null);
    setCompleteSpent("");
    setCompleteError(null);
  }, []);

  const handleComplete = useCallback(async () => {
    if (!completeTarget) return;
    let spentCents: number;
    try {
      spentCents = parseCents(completeSpent);
    } catch {
      setCompleteError(t("savingPlan.completeSpentInvalid"));
      return;
    }
    if (spentCents < 0) {
      setCompleteError(t("savingPlan.completeSpentInvalid"));
      return;
    }
    setCompleting(true);
    try {
      const res = await fetch(`/api/saving-plan/${completeTarget.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spentCents })
      });
      if (!res.ok) {
        throw new Error(t("savingPlan.errorComplete"));
      }
      invalidatePlan();
      toast.success(t("savingPlan.feedbackCompleted"));
      closeCompleteDialog();
    } catch (completeErr) {
      setCompleteError(completeErr instanceof Error ? completeErr.message : t("savingPlan.errorComplete"));
    } finally {
      setCompleting(false);
    }
  }, [closeCompleteDialog, completeSpent, completeTarget, invalidatePlan, t, toast]);

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
    if (amountCents > availableCents) {
      setWithdrawError(t("savingPlan.withdraw.errorTooMuch", { amount: formatCurrency(availableCents) }));
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
  }, [availableCents, closeWithdrawDialog, invalidatePlan, t, toast, withdrawAmount]);

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
    if (!completeTarget) return;
    const node = completeDialogRef.current;
    node?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCompleteDialog();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeCompleteDialog, completeTarget]);

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

  const timelineEmpty = !loading && goalsWithProgress.length === 0;

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
          <h2 id="saving-plan-summary" className="text-lg font-medium">
            {t("savingPlan.summaryTitle")}
          </h2>
          <button
            type="button"
            onClick={openWithdrawDialog}
            disabled={availableCents <= 0}
            title={availableCents <= 0 ? t("savingPlan.withdraw.nothingAvailable") : undefined}
            className="inline-flex items-center gap-1.5 rounded-field border border-brand/40 bg-surface px-3 py-1.5 text-xs font-medium text-brand shadow-card transition hover:bg-brand-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v8.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 1 1 1.06-1.06l3.22 3.22V3.75A.75.75 0 0 1 10 3Z" clipRule="evenodd" />
            </svg>
            {t("savingPlan.withdraw.action")}
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-field border border-line bg-surface-2 p-4 text-ink">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("savingPlan.summaryAvailable")}</p>
            <p className="text-xl font-semibold">{formatCurrency(availableCents)}</p>
            <p className="text-xs text-ink-muted">{t("savingPlan.summaryAvailableHelp")}</p>
          </div>
          <div className="rounded-field border border-line bg-surface-2 p-4 text-ink">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("savingPlan.summaryPlannedTotal")}</p>
            <p className="text-xl font-semibold">{formatCurrency(plan?.totals.totalTargetCents ?? 0)}</p>
            <p className="text-xs text-ink-muted">{t("savingPlan.summaryPlannedHelp")}</p>
          </div>
          <div className="rounded-field border border-line bg-savings-soft p-4 text-ink">
            <p className="text-xs font-semibold uppercase tracking-wide text-savings">{t("savingPlan.summarySuggestedMonthly")}</p>
            <p className="text-xl font-semibold">{formatCurrency(plan?.totals.suggestedMonthlyCents ?? 0)}</p>
            <p className="text-xs text-ink-muted">{t("savingPlan.summarySuggestedMonthlyHelp")}</p>
          </div>
          <div className="rounded-field border border-line bg-surface-2 p-4 text-ink">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("savingPlan.summaryRemainingAfter")}</p>
            <p className="text-xl font-semibold">{formatCurrency(remainingAfterGoals)}</p>
            <p className="text-xs text-ink-muted">
              {remainingAfterGoals > 0
                ? t("savingPlan.summaryRemainingHelpPositive")
                : t("savingPlan.summaryRemainingHelpNegative")}
            </p>
          </div>
        </div>
        {shortfall > 0 && (
          <p className="rounded-field border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
            {t("savingPlan.shortfall", { amount: formatCurrency(shortfall) })}
          </p>
        )}
        {withdrawnForCompletedCents > 0 && (
          <p className="text-xs text-ink-muted">
            {t("savingPlan.summaryWithdrawnForCompleted", { amount: formatCurrency(withdrawnForCompletedCents) })}
          </p>
        )}
      </section>

      <section aria-labelledby="saving-plan-timeline" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="saving-plan-timeline" className="text-lg font-medium">
            {t("savingPlan.timelineTitle")}
          </h2>
          <span className="text-xs uppercase tracking-wide text-ink-muted">{t("savingPlan.timelineHint")}</span>
        </div>
        {loading ? (
          <p className="text-sm text-ink-muted">{t("savingPlan.timelineLoading")}</p>
        ) : timelineEmpty ? (
          <div className="rounded-card border border-dashed border-line-strong bg-surface/60 p-8 text-center text-sm text-ink-muted shadow-card">
            <p>{t("savingPlan.timelineEmpty")}</p>
          </div>
        ) : (
          <ol className="relative max-w-3xl border-l border-line pl-6">
            {goalsWithProgress.map((goal, index) => {
              const isLast = index === goalsWithProgress.length - 1;
              const dueDate =
                goal.month != null && goal.year != null
                  ? new Date(goal.year, goal.month - 1, 1).toLocaleDateString(dateLocale, {
                      month: "long",
                      year: "numeric"
                    })
                  : "";
              const percentClamped = Math.min(goal.percent, 100);
              const statusClasses = {
                complete: "bg-success text-success",
                current: "bg-brand text-brand",
                upcoming: "bg-line-strong text-ink-faint"
              }[goal.status];
              const progressColor = goal.status === "complete" ? "bg-success" : goal.status === "current" ? "bg-brand" : "bg-line-strong";
              const badgeColor = goal.status === "complete" ? "border-success" : goal.status === "current" ? "border-brand" : "border-line-strong";

              return (
                <li key={goal.id} className={`relative pb-10 last:pb-0`} aria-current={goal.status === "current" ? "step" : undefined}>
                  <span
                    className={`absolute -left-[9px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 bg-surface ${badgeColor}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${statusClasses}`} aria-hidden="true" />
                  </span>
                  {!isLast && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-5 h-full w-px bg-line"
                    />
                  )}
                  <div className="ml-4 space-y-3 rounded-card border border-line bg-surface/95 p-4 shadow-card backdrop-blur">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          {dueDate}
                        </p>
                        <h3 className="text-lg font-semibold text-ink">{goal.title}</h3>
                        {goal.categoryName && (
                          <p className="text-xs text-ink-muted">
                            {t("savingPlan.timelineCategory")}: {goal.categoryName}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-wide text-ink-muted">{t("savingPlan.timelineGoal")}</p>
                        <p className="text-xl font-semibold text-ink">{formatCurrency(goal.amountCents ?? 0)}</p>
                        <p className="text-xs text-ink-muted">
                          {t("savingPlan.timelineSaved", { amount: formatCurrency(goal.achievedCents) })}
                        </p>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-ink-muted">
                        <span>{t("savingPlan.timelinePercentComplete", { percent: percentClamped })}</span>
                        <span>
                          {t("savingPlan.timelineTarget", { amount: formatCurrency(goal.cumulativeTargetCents) })}
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-surface-2" aria-hidden="true">
                        <div
                          className={`h-2 rounded-full transition-all ${progressColor}`}
                          style={{ width: `${percentClamped}%` }}
                        />
                      </div>
                      {goal.transactionSpentCents > 0 && (() => {
                        const amount = goal.amountCents ?? 0;
                        const spentPercent = amount > 0 ? Math.min(Math.round((goal.transactionSpentCents / amount) * 100), 100) : 0;
                        return (
                          <div className="mt-2">
                            <div className="flex justify-between text-xs text-warning">
                              <span>{t("savingPlan.timelineSpentPercent", { percent: spentPercent })}</span>
                              <span>{t("savingPlan.timelineSpent", { amount: formatCurrency(goal.transactionSpentCents) })}</span>
                            </div>
                            <div className="mt-1 h-2 w-full rounded-full bg-warning-soft" aria-hidden="true">
                              <div
                                className="h-2 rounded-full bg-warning transition-all"
                                style={{ width: `${spentPercent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })()}
                      {goal.status === "current" && (
                        <p className="mt-2 text-xs font-medium text-brand">
                          {t("savingPlan.timelineCurrent")}
                        </p>
                      )}
                      {goal.status === "upcoming" && (
                        <p className="mt-2 text-xs text-ink-muted">
                          {t("savingPlan.timelineUpcoming", { amount: formatCurrency(goal.cumulativeTargetCents - (goal.amountCents ?? 0)) })}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => openCompleteDialog(goal)}
                          className="inline-flex items-center rounded-field border border-success/40 bg-surface px-3 py-1.5 text-xs font-medium text-success shadow-card hover:bg-success-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2"
                        >
                          {t("savingPlan.markComplete")}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditDialog(goal)}
                          className="inline-flex items-center rounded-field border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-card hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                        >
                          {t("savingPlan.edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(goal)}
                          className="inline-flex items-center rounded-field border border-danger/40 bg-surface px-3 py-1.5 text-xs font-medium text-danger shadow-card hover:bg-danger-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2"
                        >
                          {t("savingPlan.delete")}
                        </button>
                      </div>
                    </div>
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
          <p className="text-sm text-ink-muted">{t("savingPlan.undatedSubtitle")}</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {undatedGoals.map((goal) => (
              <li
                key={goal.id}
                className="flex flex-col gap-3 rounded-card border border-line bg-surface/95 p-4 shadow-card backdrop-blur"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-ink">{goal.title}</h3>
                    {goal.categoryName && (
                      <p className="text-xs text-ink-muted">
                        {t("savingPlan.timelineCategory")}: {goal.categoryName}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {goal.amountCents != null ? (
                      <>
                        <p className="text-xs uppercase tracking-wide text-ink-muted">{t("savingPlan.timelineGoal")}</p>
                        <p className="text-lg font-semibold text-ink">{formatCurrency(goal.amountCents)}</p>
                      </>
                    ) : (
                      <p className="text-xs italic text-ink-faint">{t("savingPlan.undatedNoAmount")}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => openEditDialog(goal, true)}
                    className="inline-flex items-center rounded-field border border-brand/40 bg-surface px-3 py-1.5 text-xs font-medium text-brand shadow-card hover:bg-brand-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                  >
                    {t("savingPlan.undatedSchedule")}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditDialog(goal)}
                    className="inline-flex items-center rounded-field border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-card hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                  >
                    {t("savingPlan.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(goal)}
                    className="inline-flex items-center rounded-field border border-danger/40 bg-surface px-3 py-1.5 text-xs font-medium text-danger shadow-card hover:bg-danger-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2"
                  >
                    {t("savingPlan.delete")}
                  </button>
                </div>
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
                    ? new Date(goal.year, goal.month - 1, 1).toLocaleDateString(dateLocale, {
                        month: "long",
                        year: "numeric"
                      })
                    : "";
                const completedDate = goal.completedAt
                  ? new Date(goal.completedAt).toLocaleDateString(dateLocale, {
                      day: "numeric",
                      month: "long",
                      year: "numeric"
                    })
                  : null;
                const spent = goal.spentCents ?? 0;
                const diff = goal.amountCents != null ? spent - goal.amountCents : 0;
                return (
                  <li
                    key={goal.id}
                    className="rounded-card border border-success/30 bg-success-soft p-4 shadow-card"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-success">
                          {dueDate}
                        </p>
                        <h3 className="text-lg font-semibold text-ink">{goal.title}</h3>
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
                          {t("savingPlan.completedWithdrawn", { amount: formatCurrency(spent) })}
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
                amountCents: editGoal.amountCents
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

      {completeTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={closeCompleteDialog} />
          <div
            ref={completeDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="complete-confirm-heading"
            aria-describedby="complete-confirm-message"
            className="relative z-10 mx-4 w-full max-w-md rounded-card bg-surface p-6 shadow-raised focus:outline-none"
            tabIndex={-1}
          >
            <h2 id="complete-confirm-heading" className="text-lg font-semibold text-ink">
              {t("savingPlan.completeDialogTitle")}
            </h2>
            <p id="complete-confirm-message" className="mt-2 text-sm text-ink-muted">
              {t("savingPlan.completeDialogMessage", { title: completeTarget.title })}
            </p>
            <div className="mt-4">
              <label htmlFor="complete-spent" className="block text-sm font-medium text-ink">
                {t("savingPlan.completeSpentLabel")}
              </label>
              <input
                id="complete-spent"
                type="text"
                inputMode="decimal"
                value={completeSpent}
                onChange={(event) => setCompleteSpent(event.target.value)}
                className="mt-1 block w-full rounded-field border-line-strong bg-surface shadow-card focus:border-brand focus:ring-brand"
              />
              <p className="mt-1 text-xs text-ink-muted">{t("savingPlan.completeSpentHint")}</p>
              {completeError && (
                <p className="mt-1 text-xs text-danger">{completeError}</p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeCompleteDialog}
                disabled={completing}
                className="inline-flex items-center rounded-field border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink shadow-card hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {t("savingPlan.confirmDeleteCancel")}
              </button>
              <button
                type="button"
                onClick={handleComplete}
                disabled={completing}
                className="inline-flex items-center rounded-field border border-transparent bg-success px-4 py-2 text-sm font-medium text-brand-on shadow-card hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {completing && <Spinner size="sm" className="mr-2" />}
                {completing ? t("savingPlan.completing") : t("savingPlan.completeConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}

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
            <div className="mt-3 rounded-field border border-line bg-surface-2 px-3 py-2 text-sm">
              <span className="text-ink-muted">{t("savingPlan.withdraw.availableLabel")}: </span>
              <span className="font-semibold text-ink">{formatCurrency(availableCents)}</span>
            </div>
            <div className="mt-4">
              <label htmlFor="withdraw-amount" className="block text-sm font-medium text-ink">
                {t("savingPlan.withdraw.amountLabel")}
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="withdraw-amount"
                  type="text"
                  inputMode="decimal"
                  value={withdrawAmount}
                  onChange={(event) => setWithdrawAmount(event.target.value)}
                  placeholder={t("savingPlan.form.amountPlaceholder")}
                  className="block w-full rounded-field border-line-strong bg-surface shadow-card focus:border-brand focus:ring-brand"
                />
                <button
                  type="button"
                  onClick={() => setWithdrawAmount(toDecimalString(fromCents(availableCents)))}
                  className="shrink-0 rounded-field border border-line-strong px-3 text-xs font-medium text-ink-muted hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  {t("savingPlan.withdraw.max")}
                </button>
              </div>
              <p className="mt-1 text-xs text-ink-muted">{t("savingPlan.withdraw.amountHint")}</p>
              {withdrawError && (
                <p className="mt-1 text-xs text-danger">{withdrawError}</p>
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
