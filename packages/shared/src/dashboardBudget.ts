/**
 * Pure dashboard "available budget" computation — no I/O, so it can be
 * unit-tested directly. Mirrors the fields returned by /api/analytics/summary
 * (all amounts already in euros, not cents).
 *
 * Available budget = carryover from last month + this month's income
 * (booked + due-but-not-yet-booked recurring) + any savings withdrawn back
 * into everyday spending this month (booked + recurring).
 *
 * Both the income side and the savings side use the "projected" total
 * (booked + recurring) consistently — a recurring savings withdrawal due
 * this month affects the available budget exactly like a recurring income
 * transaction does, even before either is booked as a real transaction.
 *
 * Inputs and outputs are euros, but the arithmetic runs in integer cents:
 * every input is rounded to cents on entry and the results are divided by 100
 * at the end. Adding and subtracting euro floats directly yields values like
 * -5.7e-14 where the true result is exactly 0 (shown as "-0,00 €" with an
 * overspend line).
 */

export type DashboardBudgetInput = {
  carryoverFromLastMonth: number;
  incomeTotal: number;
  recurringIncomeTotal?: number;
  /** incomeTotal + recurringIncomeTotal, when already computed by the caller. */
  projectedIncomeTotal?: number;
  outcomeTotal: number;
  recurringOutcomeTotal?: number;
  /** outcomeTotal + recurringOutcomeTotal, when already computed by the caller. */
  projectedOutcomeTotal?: number;
  /** Net booked savings movement this month: positive = deposit, negative = withdrawal. */
  monthlySavingsActual: number;
  /** Net savings movement from recurring templates due this month, same sign convention. */
  recurringPlannedSavings?: number;
  /** monthlySavingsActual + recurringPlannedSavings, when already computed by the caller. */
  projectedSavingsTotal?: number;
};

export type DashboardBudget = {
  carryover: number;
  projectedIncome: number;
  projectedOutcome: number;
  /** Net projected savings movement: positive = deposit, negative = withdrawal. */
  savingsNet: number;
  /** Deposits only, shown as "saved" this month. */
  totalSavingsTransfer: number;
  /** Withdrawals only, returning money to everyday spending. */
  savingsWithdrawn: number;
  projectedSpent: number;
  projectedExpenses: number;
  availableBudget: number;
  projectedLeft: number;
  spentPercent: number;
  expensesPercent: number;
  savedPercent: number;
  overspent: number;
  overspentPercent: number;
  hasIncomeData: boolean;
  budgetUnderwater: boolean;
};

/** Euros to integer cents; a missing or non-numeric value counts as 0. */
function toCents(euros: number | undefined): number {
  return Math.round((euros || 0) * 100) || 0;
}

/** `total` if the caller already computed it, else `booked + recurring` — all in cents. */
function projectedCents(total: number | undefined, booked: number, recurring: number | undefined): number {
  return typeof total === "number" ? toCents(total) : toCents(booked) + toCents(recurring);
}

export function computeAvailableBudget(input: DashboardBudgetInput): DashboardBudget {
  const carryover = toCents(input.carryoverFromLastMonth);
  const projectedIncome = Math.max(
    0,
    projectedCents(input.projectedIncomeTotal, input.incomeTotal, input.recurringIncomeTotal)
  );
  const projectedOutcome = Math.max(
    0,
    projectedCents(input.projectedOutcomeTotal, input.outcomeTotal, input.recurringOutcomeTotal)
  );

  const savingsNet = projectedCents(
    input.projectedSavingsTotal,
    input.monthlySavingsActual,
    input.recurringPlannedSavings
  );
  const totalSavingsTransfer = Math.max(0, savingsNet);
  const savingsWithdrawn = Math.max(0, -savingsNet);

  const projectedSpent = projectedOutcome + totalSavingsTransfer;
  const projectedExpenses = projectedOutcome;

  // Carryover is intentionally NOT floored at 0 so a negative carryover reduces
  // the budget honestly.
  const availableBudget = carryover + projectedIncome + savingsWithdrawn;
  const projectedLeft = availableBudget - projectedSpent;

  const spentPercent =
    availableBudget > 0 ? Math.min(100, Math.round((projectedSpent / availableBudget) * 100)) : 0;
  const expensesPercent =
    availableBudget > 0 ? Math.min(100, Math.round((projectedExpenses / availableBudget) * 100)) : 0;
  const savedPercent =
    availableBudget > 0
      ? Math.min(100 - expensesPercent, Math.round((totalSavingsTransfer / availableBudget) * 100))
      : 0;
  const overspent = Math.max(0, projectedSpent - availableBudget);
  const overspentPercent =
    availableBudget > 0 ? Math.max(0, Math.round((overspent / availableBudget) * 100)) : 0;
  const hasIncomeData = projectedIncome > 0 || carryover !== 0;
  const budgetUnderwater = availableBudget <= 0;

  // All amounts above are integer cents; convert to euros only here.
  return {
    carryover: carryover / 100,
    projectedIncome: projectedIncome / 100,
    projectedOutcome: projectedOutcome / 100,
    savingsNet: savingsNet / 100,
    totalSavingsTransfer: totalSavingsTransfer / 100,
    savingsWithdrawn: savingsWithdrawn / 100,
    projectedSpent: projectedSpent / 100,
    projectedExpenses: projectedExpenses / 100,
    availableBudget: availableBudget / 100,
    projectedLeft: projectedLeft / 100,
    spentPercent,
    expensesPercent,
    savedPercent,
    overspent: overspent / 100,
    overspentPercent,
    hasIncomeData,
    budgetUnderwater
  };
}
