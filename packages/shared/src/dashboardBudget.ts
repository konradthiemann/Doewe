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

export function computeAvailableBudget(input: DashboardBudgetInput): DashboardBudget {
  const carryover = input.carryoverFromLastMonth || 0;
  const projectedIncome = Math.max(
    0,
    input.projectedIncomeTotal ?? input.incomeTotal + (input.recurringIncomeTotal || 0)
  );
  const projectedOutcome = Math.max(
    0,
    input.projectedOutcomeTotal ?? input.outcomeTotal + (input.recurringOutcomeTotal || 0)
  );

  const savingsNet =
    input.projectedSavingsTotal ?? input.monthlySavingsActual + (input.recurringPlannedSavings || 0);
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

  return {
    carryover,
    projectedIncome,
    projectedOutcome,
    savingsNet,
    totalSavingsTransfer,
    savingsWithdrawn,
    projectedSpent,
    projectedExpenses,
    availableBudget,
    projectedLeft,
    spentPercent,
    expensesPercent,
    savedPercent,
    overspent,
    overspentPercent,
    hasIncomeData,
    budgetUnderwater
  };
}
