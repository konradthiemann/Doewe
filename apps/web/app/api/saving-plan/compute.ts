/**
 * Pure saving-plan computation — no Prisma, no I/O — so it can be unit-tested directly.
 *
 * Goals are stored as `Budget` rows with `categoryId = null`. A goal is
 * "completed" once `completedAt` is set.
 *
 * The app keeps no savings balance (docs/calculations/07-sparziele.md): a
 * savings booking is money that leaves the month, and what then lies on the
 * savings account is outside the app. The plan is therefore what the household
 * set itself — targets, deadlines and a monthly rate per dated goal — and the
 * spending recorded on each goal.
 *
 * "Undated" goals (month/year null) are an idea backlog: no rate, not part of
 * the planned total.
 */
import { sumFlows, zonedMonth, type FlowRow } from "@doewe/shared";

export type SavingPlanGoal = {
  /** goal amount; null = no amount set yet (undated ideas may omit it) */
  amountCents: number | null;
  /** planned monthly rate; null = none set */
  monthlyRateCents: number | null;
  /** null = active, set = completed */
  completedAt: Date | string | null;
  /** target month 1-12, null = undated */
  month: number | null;
  /** target year, null = undated */
  year: number | null;
};

export type SavingPlanTotals = {
  /** sum of the targets of the active, dated goals */
  totalTargetCents: number;
  /**
   * sum of the monthly rates of the active, dated goals whose deadline is the
   * current month or later — what the plan sets aside this month
   */
  monthlyRateCents: number;
};

/**
 * What was spent on a goal from the monthly budget, from the bookings linked to
 * it: their outcome minus their refunds, never below 0. Classified like every
 * other figure (classifyFlow): a linked booking in a savings category is a
 * transfer to or from the savings, not spending, and does not count.
 */
export function linkedSpentCents(rows: Iterable<FlowRow>, savingsIds: ReadonlySet<string>): number {
  const { outcomeCents, incomeCents } = sumFlows(rows, savingsIds);
  return Math.max(outcomeCents - incomeCents, 0);
}

/** Sum of the payments from savings recorded on a goal. */
export function savingsPaidCents(payments: Iterable<{ amountCents: number }>): number {
  let sum = 0;
  for (const payment of payments) sum += payment.amountCents;
  return sum;
}

function isActiveAndDated(goal: SavingPlanGoal): goal is SavingPlanGoal & { month: number; year: number } {
  return goal.completedAt == null && goal.month != null && goal.year != null;
}

/**
 * @param goals all goals of the household
 * @param now   reference instant; its Europe/Berlin month is the current month
 */
export function computeSavingPlanTotals(goals: readonly SavingPlanGoal[], now: Date): SavingPlanTotals {
  const current = zonedMonth(now);
  const currentIndex = current.year * 12 + current.month;

  let totalTargetCents = 0;
  let monthlyRateCents = 0;
  for (const goal of goals) {
    if (!isActiveAndDated(goal)) continue;
    totalTargetCents += goal.amountCents ?? 0;
    // A goal whose deadline has passed no longer asks for a monthly amount.
    if (goal.year * 12 + goal.month >= currentIndex) {
      monthlyRateCents += goal.monthlyRateCents ?? 0;
    }
  }
  return { totalTargetCents, monthlyRateCents };
}
