import { describe, expect, it } from "vitest";

import { computeSavingPlanTotals, type SavingPlanGoal } from "../app/api/saving-plan/compute";

// Reference date: 15 Jan 2026 → currentMonth = 1, currentYear = 2026.
const NOW = new Date(2026, 0, 15);

function activeGoal(amountCents: number, monthsAhead: number): SavingPlanGoal {
  return {
    amountCents,
    completedAt: null,
    spentCents: null,
    month: 1 + monthsAhead,
    year: 2026
  };
}

function completedGoal(amountCents: number, spentCents: number): SavingPlanGoal {
  return {
    amountCents,
    completedAt: new Date(2026, 0, 10),
    spentCents,
    month: 1,
    year: 2026
  };
}

function undatedGoal(amountCents: number | null): SavingPlanGoal {
  return {
    amountCents,
    completedAt: null,
    spentCents: null,
    month: null,
    year: null
  };
}

describe("computeSavingPlanTotals", () => {
  it("computes target and suggested monthly for a single active goal", () => {
    const totals = computeSavingPlanTotals([activeGoal(120000, 3)], 0, NOW);

    expect(totals.totalTargetCents).toBe(120000);
    expect(totals.availableCents).toBe(0);
    expect(totals.withdrawnForCompletedCents).toBe(0);
    // 120000 over 3 months
    expect(totals.suggestedMonthlyCents).toBe(40000);
  });

  it("excludes completed goals from the planned total and reserves their withdrawal", () => {
    const goals = [activeGoal(120000, 3), completedGoal(300000, 200000)];
    const totals = computeSavingPlanTotals(goals, 200000, NOW);

    // completed goal's 300000 must NOT be in the planned total
    expect(totals.totalTargetCents).toBe(120000);
    expect(totals.withdrawnForCompletedCents).toBe(200000);
    // raw 200000 minus 200000 reserved = 0 available for active goals
    expect(totals.availableCents).toBe(0);
    expect(totals.suggestedMonthlyCents).toBe(40000);
  });

  it("floors available at 0 when an overspend exceeds the savings balance", () => {
    const totals = computeSavingPlanTotals([completedGoal(300000, 500000)], 400000, NOW);

    expect(totals.rawAvailableCents).toBe(400000);
    expect(totals.withdrawnForCompletedCents).toBe(500000);
    expect(totals.availableCents).toBe(0);
    // no active goals
    expect(totals.totalTargetCents).toBe(0);
    expect(totals.suggestedMonthlyCents).toBe(0);
  });

  it("uses the adjusted available pool to lower the suggested monthly rate", () => {
    const goals = [activeGoal(120000, 3), completedGoal(50000, 50000)];
    const totals = computeSavingPlanTotals(goals, 110000, NOW);

    expect(totals.availableCents).toBe(60000); // 110000 - 50000 reserved
    expect(totals.totalTargetCents).toBe(120000);
    // remaining 60000 over 3 months
    expect(totals.suggestedMonthlyCents).toBe(20000);
  });

  it("ignores undated goals in the planned total and suggested monthly rate", () => {
    // Two undated ideas (one with an amount, one without) must not affect the plan.
    const goals = [activeGoal(120000, 3), undatedGoal(500000), undatedGoal(null)];
    const totals = computeSavingPlanTotals(goals, 0, NOW);

    // Only the dated goal counts toward the plan.
    expect(totals.totalTargetCents).toBe(120000);
    expect(totals.suggestedMonthlyCents).toBe(40000);
  });

  it("returns a zero plan when only undated goals exist", () => {
    const totals = computeSavingPlanTotals([undatedGoal(500000), undatedGoal(null)], 0, NOW);

    expect(totals.totalTargetCents).toBe(0);
    expect(totals.suggestedMonthlyCents).toBe(0);
  });
});
