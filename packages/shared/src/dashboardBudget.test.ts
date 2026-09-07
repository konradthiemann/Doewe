import { describe, expect, it } from "vitest";

import { computeAvailableBudget } from "./dashboardBudget";

describe("computeAvailableBudget", () => {
  it("counts a recurring (not-yet-booked) savings withdrawal toward the available budget", () => {
    // No booked savings movement this month, but a recurring savings-category
    // transaction due this month is a net withdrawal of 80€ (projectedSavingsTotal
    // is negative). That money is expected back in checking, same as a booked one.
    const result = computeAvailableBudget({
      carryoverFromLastMonth: 1000,
      incomeTotal: 2000,
      recurringIncomeTotal: 0,
      projectedIncomeTotal: 2000,
      outcomeTotal: 500,
      recurringOutcomeTotal: 0,
      projectedOutcomeTotal: 500,
      monthlySavingsActual: 0,
      recurringPlannedSavings: -80,
      projectedSavingsTotal: -80
    });

    expect(result.totalSavingsTransfer).toBe(0);
    expect(result.savingsWithdrawn).toBe(80);
    expect(result.availableBudget).toBe(3080); // 1000 + 2000 + 80
  });

  it("matches the documented simulation example when savings are only deposits", () => {
    // docs/calculations/04-analytics-summary.md — Juni 2026 example.
    const result = computeAvailableBudget({
      carryoverFromLastMonth: 1500,
      incomeTotal: 3000,
      recurringIncomeTotal: 0,
      projectedIncomeTotal: 3000,
      outcomeTotal: 1200,
      recurringOutcomeTotal: 15,
      projectedOutcomeTotal: 1215,
      monthlySavingsActual: 500,
      recurringPlannedSavings: 200,
      projectedSavingsTotal: 700
    });

    expect(result.totalSavingsTransfer).toBe(700);
    expect(result.savingsWithdrawn).toBe(0);
    expect(result.projectedSpent).toBe(1915); // 1215 + 700
    expect(result.availableBudget).toBe(4500); // 1500 + 3000 + 0
    expect(result.projectedLeft).toBe(2585);
  });

  it("falls back to raw + recurring totals when the projected aggregates are missing", () => {
    const result = computeAvailableBudget({
      carryoverFromLastMonth: 400,
      incomeTotal: 1000,
      recurringIncomeTotal: 200,
      outcomeTotal: 300,
      recurringOutcomeTotal: 50,
      monthlySavingsActual: -20, // withdrawal already booked
      recurringPlannedSavings: 10 // plus a recurring deposit due this month
    });

    expect(result.projectedIncome).toBe(1200);
    expect(result.projectedOutcome).toBe(350);
    // Net: -20 (withdrawal) + 10 (deposit) = -10 → still a net withdrawal.
    expect(result.savingsWithdrawn).toBe(10);
    expect(result.totalSavingsTransfer).toBe(0);
    expect(result.availableBudget).toBe(1610); // 400 + 1200 + 10
  });

  it("flags overspending once projected spending exceeds the available budget", () => {
    const result = computeAvailableBudget({
      carryoverFromLastMonth: 0,
      incomeTotal: 500,
      outcomeTotal: 700,
      monthlySavingsActual: 0
    });

    expect(result.availableBudget).toBe(500);
    expect(result.overspent).toBe(200);
    expect(result.overspentPercent).toBe(40);
    expect(result.budgetUnderwater).toBe(false);
  });
});
