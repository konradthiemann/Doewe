/**
 * Saving goal figures — no React, no I/O, integer cents.
 *
 * The app does not keep a savings balance: what lies on a savings account is
 * outside of it. A goal therefore has a plan (target, deadline, monthly rate)
 * and what was spent on it — from the monthly budget (linked bookings) and
 * straight from the savings (payments recorded on the goal).
 */
import { percentOf, zonedMonth, type MonthRef } from "@doewe/shared";

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

/**
 * Months still open to save for a deadline, the current month included:
 * November → January is 2 (November, December). At least 1, so a deadline in
 * the current month or in the past still divides by one month.
 */
export function monthsToDeadline(deadline: MonthRef, now: Date): number {
  const current = zonedMonth(now);
  return Math.max((deadline.year - current.year) * 12 + (deadline.month - current.month), 1);
}

/** True once the deadline month is over (Europe/Berlin). */
export function isDeadlinePast(deadline: MonthRef, now: Date): boolean {
  const current = zonedMonth(now);
  return deadline.year * 12 + deadline.month < current.year * 12 + current.month;
}

/**
 * Suggested monthly rate for a goal: its target spread evenly over the months
 * left until its deadline, rounded up. Null without a target or a deadline.
 * Only a suggestion — the app does not know what is saved already, so the
 * household confirms or changes it.
 */
export function suggestMonthlyRateCents(
  amountCents: number | null,
  deadline: MonthRef | null,
  now: Date
): number | null {
  if (amountCents == null || amountCents <= 0 || deadline == null) return null;
  return Math.ceil(amountCents / monthsToDeadline(deadline, now));
}

export type GoalSpending = {
  /** Linked bookings (from the monthly budget) plus payments from savings. */
  spentCents: number;
  /** Target minus spent, never below 0; 0 without a target. */
  remainingCents: number;
  /** Spent beyond the target, never below 0. */
  overCents: number;
  /** Whole percent of the target that is spent (see goalPercent); 0 without a target. */
  percent: number;
};

export function goalSpending(
  linkedSpentCents: number,
  savingsPaidCents: number,
  targetCents: number | null
): GoalSpending {
  const spentCents = Math.max(linkedSpentCents, 0) + Math.max(savingsPaidCents, 0);
  const target = targetCents ?? 0;
  if (target <= 0) return { spentCents, remainingCents: 0, overCents: 0, percent: 0 };
  return {
    spentCents,
    remainingCents: Math.max(target - spentCents, 0),
    overCents: Math.max(spentCents - target, 0),
    percent: goalPercent(spentCents, target)
  };
}
