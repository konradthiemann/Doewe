/**
 * Category budget plans (integer cents, no float math).
 *
 * A plan is either MONTHLY (same amount every month) or YEARLY (one yearly
 * amount, distributed over the 12 months weighted by the net amount available
 * per month). A per-month legacy `Budget` row (override) beats the plan.
 */

export const BUDGET_PERIODS = ["MONTHLY", "YEARLY"] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export type BudgetPlanLike = { period: BudgetPeriod; amountCents: number };

const MONTHS = 12;

/**
 * Distributes a yearly amount over 12 months weighted by `max(0, available)`.
 * Base share is floored per month; the remainder (0..11 cents) goes entirely to
 * the month with the largest weight (ties: smallest index). If no month has a
 * positive weight, all months weigh equally. The result always sums exactly to
 * `yearlyCents` and contains only non-negative integers.
 */
export function distributeYearlyBudget(yearlyCents: number, availablePerMonth: readonly number[]): number[] {
  if (availablePerMonth.length !== MONTHS) {
    throw new RangeError(`availablePerMonth must have ${MONTHS} entries`);
  }
  if (!Number.isInteger(yearlyCents) || yearlyCents < 0) {
    throw new RangeError("yearlyCents must be a non-negative integer");
  }

  let weights = availablePerMonth.map((v) => Math.max(0, v));
  let totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) {
    weights = weights.map(() => 1);
    totalWeight = MONTHS;
  }

  // BigInt keeps yearly * weight exact even for very large amounts.
  const yearly = BigInt(yearlyCents);
  const total = BigInt(Math.round(totalWeight));
  const shares = weights.map((w) => Number((yearly * BigInt(Math.round(w))) / total));
  const remainder = yearlyCents - shares.reduce((a, b) => a + b, 0);

  let heaviest = 0;
  for (let i = 1; i < MONTHS; i++) {
    if (weights[i]! > weights[heaviest]!) heaviest = i;
  }
  shares[heaviest] = shares[heaviest]! + remainder;
  return shares;
}

/** Twelve monthly amounts of a plan (index 0 = January). */
export function planMonthlyCents(plan: BudgetPlanLike, availablePerMonth: readonly number[]): number[] {
  if (plan.period === "MONTHLY") return Array.from({ length: MONTHS }, () => plan.amountCents);
  return distributeYearlyBudget(plan.amountCents, availablePerMonth);
}

/**
 * Effective budget per category for one month: plan amount, replaced by an
 * override (legacy per-month `Budget`) where present; overrides without a plan
 * are added. `month` is 1-12. Categories with neither are omitted.
 */
export function resolveEffectiveBudgets(input: {
  plans: ReadonlyArray<BudgetPlanLike & { categoryId: string }>;
  overrides: Readonly<Record<string, number>>;
  month: number;
  availablePerMonth: readonly number[];
}): Record<string, number> {
  const result: Record<string, number> = {};
  for (const plan of input.plans) {
    result[plan.categoryId] = planMonthlyCents(plan, input.availablePerMonth)[input.month - 1]!;
  }
  for (const [categoryId, cents] of Object.entries(input.overrides)) {
    result[categoryId] = cents;
  }
  return result;
}
