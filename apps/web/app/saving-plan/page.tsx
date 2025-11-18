"use client";

import { fromCents, toDecimalString } from "@doewe/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import PlannedSavingForm from "../../components/PlannedSavingForm";

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

export default function SavingPlanPage() {
  const [plan, setPlan] = useState<SavingPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/saving-plan", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to load saving plan (${res.status}).`);
      }
      const json: SavingPlanResponse = await res.json();
      setPlan(json);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load saving plan.");
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

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
    }
  }, [searchParams]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (dialogOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
    document.body.style.overflow = previousOverflow;
  }, [dialogOpen]);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    router.replace("/saving-plan", { scroll: false });
  }, [router]);

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
      setFeedback(message ?? "Planned saving added.");
      closeDialog();
    },
    [closeDialog, fetchPlan]
  );

  const timelineEmpty = !loading && goalsWithProgress.length === 0;

  return (
    <main id="maincontent" className="p-6 pb-24 space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Saving plan</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          Track each planned saving goal and see how your savings pot matches the timeline.
        </p>
      </div>

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
          Savings balance
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-800 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Available</p>
            <p className="text-xl font-semibold">{formatCurrency(availableCents)}</p>
            <p className="text-xs text-slate-600 dark:text-neutral-400">Money currently set aside for goals.</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-800 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Planned total</p>
            <p className="text-xl font-semibold">{formatCurrency(plan?.totals.totalTargetCents ?? 0)}</p>
            <p className="text-xs text-slate-600 dark:text-neutral-400">Sum of all planned savings goals.</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-800 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Remaining after goals</p>
            <p className="text-xl font-semibold">{formatCurrency(remainingAfterGoals)}</p>
            <p className="text-xs text-slate-600 dark:text-neutral-400">{remainingAfterGoals > 0 ? "Extra savings once all goals are covered." : "Extra savings will appear once goals are met."}</p>
          </div>
        </div>
        {shortfall > 0 && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-200">
            You need {formatCurrency(shortfall)} more to cover every goal in the plan.
          </p>
        )}
      </section>

      <section aria-labelledby="saving-plan-timeline" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="saving-plan-timeline" className="text-lg font-medium">
            Timeline
          </h2>
          <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-neutral-400">Top = earliest goal</span>
        </div>
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-neutral-400">Loading timeline…</p>
        ) : timelineEmpty ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 p-8 text-center text-sm text-gray-500 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-400">
            <p>No planned savings yet. Add your first goal to start the timeline.</p>
          </div>
        ) : (
          <ol className="relative border-l border-slate-200 pl-6 dark:border-neutral-700">
            {goalsWithProgress.map((goal, index) => {
              const isLast = index === goalsWithProgress.length - 1;
              const dueDate = new Date(goal.year, goal.month - 1, 1).toLocaleDateString(undefined, {
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
                          <p className="text-xs text-slate-500 dark:text-neutral-400">Category: {goal.categoryName}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Goal</p>
                        <p className="text-xl font-semibold text-slate-900 dark:text-neutral-100">{formatCurrency(goal.amountCents)}</p>
                        <p className="text-xs text-slate-500 dark:text-neutral-400">
                          {formatCurrency(goal.achievedCents)} saved
                        </p>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-slate-500 dark:text-neutral-400">
                        <span>{percentClamped}% complete</span>
                        <span>
                          Target: {formatCurrency(goal.cumulativeTargetCents)}
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
                          You are currently working on this goal.
                        </p>
                      )}
                      {goal.status === "upcoming" && (
                        <p className="mt-2 text-xs text-slate-500 dark:text-neutral-400">
                          Starts after {formatCurrency(goal.cumulativeTargetCents - goal.amountCents)} is fully allocated.
                        </p>
                      )}
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
            aria-labelledby="new-saving-plan-heading"
            className="relative z-10 mx-4 flex w-full max-w-xl justify-center focus:outline-none"
            tabIndex={-1}
          >
            <PlannedSavingForm headingId="new-saving-plan-heading" onClose={closeDialog} onSuccess={handleSuccess} />
          </div>
        </div>
      )}
    </main>
  );
}
