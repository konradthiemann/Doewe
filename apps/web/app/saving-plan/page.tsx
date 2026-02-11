"use client";

import { fromCents, toDecimalString } from "@doewe/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import PlannedSavingForm from "../../components/PlannedSavingForm";
import { useI18n } from "../../lib/i18n";

type SavingGoal = {
  id: string;
  accountId: string;
  categoryId?: string | null;
  categoryName?: string | null;
  title: string;
  month: number;
  year: number;
  amountCents: number;
  createdAt: string;
};

type SavingPlanResponse = {
  goals: SavingGoal[];
  totals: {
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
  const [plan, setPlan] = useState<SavingPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editGoal, setEditGoal] = useState<SavingGoal | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<SavingGoal | null>(null);
  const [deleting, setDeleting] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateLocale = locale === "de" ? "de-DE" : "en-US";

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/saving-plan", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(t("savingPlan.errorLoad", { status: res.status }));
      }
      const json: SavingPlanResponse = await res.json();
      setPlan(json);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : t("savingPlan.errorLoadFallback"));
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const availableCents = useMemo(() => {
    return Math.max(plan?.totals.availableCents ?? 0, 0);
  }, [plan]);

  const goalsWithProgress: GoalWithProgress[] = useMemo(() => {
    if (!plan) return [];
    let cumulative = 0;
    return plan.goals.map((goal): GoalWithProgress => {
      const start = cumulative;
      const end = cumulative + goal.amountCents;
      const achieved = Math.min(Math.max(availableCents - start, 0), goal.amountCents);
      const percent = goal.amountCents > 0 ? Math.round((achieved / goal.amountCents) * 100) : 100;
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

  useEffect(() => {
    const shouldOpen = searchParams.get("new") === "1";
    setDialogOpen(shouldOpen);
    if (shouldOpen) {
      setFeedback(null);
      setEditGoal(null);
    }
  }, [searchParams]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (dialogOpen || deleteConfirm) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
    document.body.style.overflow = previousOverflow;
  }, [dialogOpen, deleteConfirm]);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setEditGoal(null);
    router.replace("/saving-plan", { scroll: false });
  }, [router]);

  const openEditDialog = useCallback((goal: SavingGoal) => {
    setEditGoal(goal);
    setDialogOpen(true);
    setFeedback(null);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/saving-plan/${deleteConfirm.id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(t("savingPlan.errorDeleteFailed", { status: res.status }));
      }
      await fetchPlan();
      setFeedback(t("savingPlan.feedbackDeleted"));
      setDeleteConfirm(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("savingPlan.errorDelete"));
    } finally {
      setDeleting(false);
    }
  }, [deleteConfirm, fetchPlan, t]);

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

  const handleSuccess = useCallback(
    async (message?: string) => {
      await fetchPlan();
      setFeedback(message ?? t("savingPlan.feedbackAdded"));
      closeDialog();
    },
    [closeDialog, fetchPlan, t]
  );

  const timelineEmpty = !loading && goalsWithProgress.length === 0;

  return (
    <main id="maincontent" className="p-6 pb-24 space-y-8">
      {feedback && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-900/20 dark:text-emerald-200">
          {feedback}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      <section
        aria-labelledby="saving-plan-summary"
        className="grid gap-4 rounded-xl border border-gray-200 bg-white/95 p-5 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90"
      >
        <h2 id="saving-plan-summary" className="text-lg font-medium">
          {t("savingPlan.summaryTitle")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-800 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">{t("savingPlan.summaryAvailable")}</p>
            <p className="text-xl font-semibold">{formatCurrency(availableCents)}</p>
            <p className="text-xs text-slate-600 dark:text-neutral-400">{t("savingPlan.summaryAvailableHelp")}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-800 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">{t("savingPlan.summaryPlannedTotal")}</p>
            <p className="text-xl font-semibold">{formatCurrency(plan?.totals.totalTargetCents ?? 0)}</p>
            <p className="text-xs text-slate-600 dark:text-neutral-400">{t("savingPlan.summaryPlannedHelp")}</p>
          </div>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-indigo-900 dark:border-indigo-500/40 dark:bg-indigo-900/20 dark:text-indigo-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-400">{t("savingPlan.summarySuggestedMonthly")}</p>
            <p className="text-xl font-semibold">{formatCurrency(plan?.totals.suggestedMonthlyCents ?? 0)}</p>
            <p className="text-xs text-indigo-700 dark:text-indigo-300">{t("savingPlan.summarySuggestedMonthlyHelp")}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-800 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">{t("savingPlan.summaryRemainingAfter")}</p>
            <p className="text-xl font-semibold">{formatCurrency(remainingAfterGoals)}</p>
            <p className="text-xs text-slate-600 dark:text-neutral-400">
              {remainingAfterGoals > 0
                ? t("savingPlan.summaryRemainingHelpPositive")
                : t("savingPlan.summaryRemainingHelpNegative")}
            </p>
          </div>
        </div>
        {shortfall > 0 && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-200">
            {t("savingPlan.shortfall", { amount: formatCurrency(shortfall) })}
          </p>
        )}
      </section>

      <section aria-labelledby="saving-plan-timeline" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="saving-plan-timeline" className="text-lg font-medium">
            {t("savingPlan.timelineTitle")}
          </h2>
          <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-neutral-400">{t("savingPlan.timelineHint")}</span>
        </div>
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-neutral-400">{t("savingPlan.timelineLoading")}</p>
        ) : timelineEmpty ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 p-8 text-center text-sm text-gray-500 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-400">
            <p>{t("savingPlan.timelineEmpty")}</p>
          </div>
        ) : (
          <ol className="relative border-l border-slate-200 pl-6 dark:border-neutral-700">
            {goalsWithProgress.map((goal, index) => {
              const isLast = index === goalsWithProgress.length - 1;
              const dueDate = new Date(goal.year, goal.month - 1, 1).toLocaleDateString(dateLocale, {
                month: "long",
                year: "numeric"
              });
              const percentClamped = Math.min(goal.percent, 100);
              const statusClasses = {
                complete: "bg-emerald-500 text-emerald-500",
                current: "bg-indigo-500 text-indigo-500",
                upcoming: "bg-slate-400 text-slate-400"
              }[goal.status];
              const progressColor = goal.status === "complete" ? "bg-emerald-500" : goal.status === "current" ? "bg-indigo-500" : "bg-slate-300 dark:bg-neutral-600";
              const badgeColor = goal.status === "complete" ? "border-emerald-500" : goal.status === "current" ? "border-indigo-500" : "border-slate-300 dark:border-neutral-600";

              return (
                <li key={goal.id} className={`relative pb-10 last:pb-0`} aria-current={goal.status === "current" ? "step" : undefined}>
                  <span
                    className={`absolute -left-[9px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 bg-white dark:bg-neutral-900 ${badgeColor}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${statusClasses}`} aria-hidden="true" />
                  </span>
                  {!isLast && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-5 h-full w-px bg-slate-200 dark:bg-neutral-700"
                    />
                  )}
                  <div className="ml-4 space-y-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/90">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                          {dueDate}
                        </p>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">{goal.title}</h3>
                        {goal.categoryName && (
                          <p className="text-xs text-slate-500 dark:text-neutral-400">
                            {t("savingPlan.timelineCategory")}: {goal.categoryName}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">{t("savingPlan.timelineGoal")}</p>
                        <p className="text-xl font-semibold text-slate-900 dark:text-neutral-100">{formatCurrency(goal.amountCents)}</p>
                        <p className="text-xs text-slate-500 dark:text-neutral-400">
                          {t("savingPlan.timelineSaved", { amount: formatCurrency(goal.achievedCents) })}
                        </p>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-slate-500 dark:text-neutral-400">
                        <span>{t("savingPlan.timelinePercentComplete", { percent: percentClamped })}</span>
                        <span>
                          {t("savingPlan.timelineTarget", { amount: formatCurrency(goal.cumulativeTargetCents) })}
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-slate-200 dark:bg-neutral-700" aria-hidden="true">
                        <div
                          className={`h-2 rounded-full transition-all ${progressColor}`}
                          style={{ width: `${percentClamped}%` }}
                        />
                      </div>
                      {goal.status === "current" && (
                        <p className="mt-2 text-xs font-medium text-indigo-600 dark:text-indigo-300">
                          {t("savingPlan.timelineCurrent")}
                        </p>
                      )}
                      {goal.status === "upcoming" && (
                        <p className="mt-2 text-xs text-slate-500 dark:text-neutral-400">
                          {t("savingPlan.timelineUpcoming", { amount: formatCurrency(goal.cumulativeTargetCents - goal.amountCents) })}
                        </p>
                      )}
                      <div className="mt-3 flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => openEditDialog(goal)}
                          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                        >
                          {t("savingPlan.edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(goal)}
                          className="inline-flex items-center rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 shadow-sm hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:border-red-500/40 dark:bg-neutral-800 dark:text-red-400 dark:hover:bg-red-900/20"
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
            className="relative z-10 mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-lg focus:outline-none dark:bg-neutral-800"
            tabIndex={-1}
          >
            <h2 id="delete-confirm-heading" className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
              {t("savingPlan.confirmDeleteTitle")}
            </h2>
            <p id="delete-confirm-message" className="mt-2 text-sm text-gray-600 dark:text-neutral-400">
              {t("savingPlan.confirmDeleteMessage", { title: deleteConfirm.title })}
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
              >
                {t("savingPlan.confirmDeleteCancel")}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {deleting ? t("savingPlan.deleting") : t("savingPlan.confirmDeleteConfirm")}
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
    <Suspense fallback={<main className="p-6"><p className="text-sm text-gray-500">{t("savingPlan.loading")}</p></main>}>
      <SavingPlanPage />
    </Suspense>
  );
}
