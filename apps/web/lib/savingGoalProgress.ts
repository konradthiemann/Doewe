/**
 * Progress of the dated saving goals — no React, no I/O, integer cents.
 *
 * The available savings fill the goals in order (a cascade): the first goal is
 * served first, what is left goes to the next one.
 */
import { percentOf } from "@doewe/shared";


export type GoalStatus = "complete" | "current" | "upcoming";

export type GoalProgress = {
  /** Part of the goal's own target that is covered, 0..target. */
  achievedCents: number;
  /** Whole percent of the target; 100 only when the target is fully covered. */
  percent: number;
  status: GoalStatus;
  /** Sum of the targets up to and including this goal. */
  cumulativeTargetCents: number;
};

/**
 * Whole percent of `targetCents` covered by `achievedCents`, rounded
 * commercially — but never 100 before the target is reached: 995.00 of
 * 1,000.00 is 99 %, not "100 % reached". A goal without a target counts as
 * reached.
 */
export function goalPercent(achievedCents: number, targetCents: number): number {
  if (targetCents <= 0 || achievedCents >= targetCents) return 100;
  return Math.min(99, Math.max(0, percentOf(achievedCents, targetCents)));
}

/** Distributes `availableCents` over the goals in order and derives each goal's progress. */
export function cascadeGoalProgress<Goal extends { amountCents: number | null }>(
  goals: readonly Goal[],
  availableCents: number
): Array<Goal & GoalProgress> {
  let cumulative = 0;
  return goals.map((goal) => {
    const target = goal.amountCents ?? 0;
    const start = cumulative;
    cumulative += target;
    const achievedCents = Math.min(Math.max(availableCents - start, 0), target);
    const complete = achievedCents >= target;
    const status: GoalStatus = complete ? "complete" : achievedCents > 0 ? "current" : "upcoming";
    return {
      ...goal,
      achievedCents,
      percent: goalPercent(achievedCents, target),
      status,
      cumulativeTargetCents: cumulative
    };
  });
}
