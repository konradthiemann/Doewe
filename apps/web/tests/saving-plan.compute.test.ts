import { describe, expect, it } from "vitest";

import { computeSavingPlanTotals, linkedSpentCents, type SavingPlanGoal } from "../app/api/saving-plan/compute";

// Reference instant: 15 Jan 2026, 13:00 in Berlin → current month = January 2026.
// Fixed UTC instants (not `new Date(y, m, d)`), so the suite reads the same
// calendar in any process time zone.
const NOW = new Date("2026-01-15T12:00:00.000Z");

function activeGoal(amountCents: number, monthsAhead: number): SavingPlanGoal {
  return {
    amountCents,
    completedAt: null,
    reservedCents: null,
    month: 1 + monthsAhead,
    year: 2026
  };
}

/**
 * A goal completed before withdrawals were booked: the migration copied what it
 * had withdrawn on paper into `reservedCents`.
 */
function legacyCompletedGoal(amountCents: number, reservedCents: number): SavingPlanGoal {
  return {
    amountCents,
    completedAt: new Date("2026-01-10T12:00:00.000Z"),
    reservedCents,
    month: 1,
    year: 2026
  };
}

/** A goal completed since: its money left the pool as a booking, nothing is held back. */
function completedGoal(amountCents: number): SavingPlanGoal {
  return { ...legacyCompletedGoal(amountCents, 0), reservedCents: null };
}

function undatedGoal(amountCents: number | null): SavingPlanGoal {
  return {
    amountCents,
    completedAt: null,
    reservedCents: null,
    month: null,
    year: null
  };
}

function datedGoal(amountCents: number, month: number, year: number): SavingPlanGoal {
  return { amountCents, completedAt: null, reservedCents: null, month, year };
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

  it("takes nothing out of the pool for a completed goal: its withdrawal is a booking", () => {
    // 2,000 € are in the pool after the goal's withdrawal was booked.
    const goals = [activeGoal(120000, 3), completedGoal(300000)];
    const totals = computeSavingPlanTotals(goals, 200000, NOW);

    // completed goal's 300000 must NOT be in the planned total
    expect(totals.totalTargetCents).toBe(120000);
    expect(totals.rawAvailableCents).toBe(200000);
    expect(totals.withdrawnForCompletedCents).toBe(0);
    expect(totals.availableCents).toBe(200000);
    expect(totals.suggestedMonthlyCents).toBe(0);
  });

  it("excludes completed goals from the planned total and holds back a legacy reservation", () => {
    const goals = [activeGoal(120000, 3), legacyCompletedGoal(300000, 200000)];
    const totals = computeSavingPlanTotals(goals, 200000, NOW);

    // completed goal's 300000 must NOT be in the planned total
    expect(totals.totalTargetCents).toBe(120000);
    expect(totals.withdrawnForCompletedCents).toBe(200000);
    // raw 200000 minus 200000 reserved = 0 available for active goals
    expect(totals.availableCents).toBe(0);
    expect(totals.suggestedMonthlyCents).toBe(40000);
  });

  it("ignores reservedCents on a goal that is not completed", () => {
    const totals = computeSavingPlanTotals([{ ...activeGoal(120000, 3), reservedCents: 50000 }], 100000, NOW);

    expect(totals.withdrawnForCompletedCents).toBe(0);
    expect(totals.availableCents).toBe(100000);
  });

  it("floors available at 0 when a legacy reservation exceeds the savings balance", () => {
    const totals = computeSavingPlanTotals([legacyCompletedGoal(300000, 500000)], 400000, NOW);

    expect(totals.rawAvailableCents).toBe(400000);
    expect(totals.withdrawnForCompletedCents).toBe(500000);
    expect(totals.availableCents).toBe(0);
    // no active goals
    expect(totals.totalTargetCents).toBe(0);
    expect(totals.suggestedMonthlyCents).toBe(0);
  });

  it("uses the adjusted available pool to lower the suggested monthly rate", () => {
    const goals = [activeGoal(120000, 3), legacyCompletedGoal(50000, 50000)];
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

  it("suggests nothing once the pool at the start of the month covers every goal", () => {
    const totals = computeSavingPlanTotals([activeGoal(120000, 3)], 120000, NOW);

    expect(totals.availableCents).toBe(120000);
    expect(totals.suggestedMonthlyCents).toBe(0);
  });
});

describe("computeSavingPlanTotals — rate against the pool at the start of the month", () => {
  // Goal: 1,200 € due January 2027.
  const goals = [datedGoal(120000, 1, 2027)];
  const NOVEMBER = new Date("2026-11-19T10:00:00.000Z"); // 19 Nov 2026, 11:00 Berlin
  const DECEMBER = new Date("2026-12-10T10:00:00.000Z"); // 10 Dec 2026, 11:00 Berlin

  it("is 600 € in November before any deposit (two months left)", () => {
    const totals = computeSavingPlanTotals(goals, 0, NOVEMBER, 0);
    expect(totals.suggestedMonthlyCents).toBe(60000);
  });

  it("stays 600 € after depositing 400 € in November — the month is not counted twice", () => {
    const totals = computeSavingPlanTotals(goals, 40000, NOVEMBER, 40000);

    expect(totals.suggestedMonthlyCents).toBe(60000);
    // Only the rate looks at the start of the month; the pool itself is the real one.
    expect(totals.rawAvailableCents).toBe(40000);
    expect(totals.availableCents).toBe(40000);
    expect(totals.totalTargetCents).toBe(120000);
  });

  it("is 800 € in December with a pool of 400 € (one month left)", () => {
    const totals = computeSavingPlanTotals(goals, 40000, DECEMBER, 0);
    expect(totals.suggestedMonthlyCents).toBe(80000);
  });

  it("keeps earlier months' savings as covered and sets aside only this month's deposits", () => {
    // 300 € saved before November, 400 € deposited in November → pool 700 €.
    // At the start of November 300 € were covered: (1200 − 300) / 2 = 450.
    const totals = computeSavingPlanTotals(goals, 70000, NOVEMBER, 40000);
    expect(totals.suggestedMonthlyCents).toBe(45000);
  });

  it("does not ignore a net withdrawal this month", () => {
    // 500 € saved before November, 200 € withdrawn in November → pool 300 €.
    // The withdrawn money is gone: (1200 − 300) / 2 = 450, not (1200 − 500) / 2.
    const totals = computeSavingPlanTotals(goals, 30000, NOVEMBER, -20000);
    expect(totals.suggestedMonthlyCents).toBe(45000);
  });

  it("never treats more than the available pool as deposited this month", () => {
    // 400 € deposited this month, 300 € held back by a legacy goal → 100 € available.
    const withCompleted = [...goals, { ...datedGoal(30000, 11, 2026), completedAt: NOVEMBER, reservedCents: 30000 }];
    const totals = computeSavingPlanTotals(withCompleted, 40000, NOVEMBER, 40000);

    expect(totals.availableCents).toBe(10000);
    // covered at month start is floored at 0, not negative
    expect(totals.suggestedMonthlyCents).toBe(60000);
  });

  it("defaults to no deposits this month when the argument is omitted", () => {
    const totals = computeSavingPlanTotals(goals, 40000, NOVEMBER);
    expect(totals.suggestedMonthlyCents).toBe(40000);
  });

  it("takes the current month from Europe/Berlin, not from UTC or the process time zone", () => {
    // 31 Oct 2026 23:30 UTC is 1 Nov 2026 00:30 in Berlin: November has begun,
    // two months are left until January (in UTC it would still be October: three).
    const justAfterMidnightBerlin = new Date("2026-10-31T23:30:00.000Z");
    expect(computeSavingPlanTotals(goals, 0, justAfterMidnightBerlin).suggestedMonthlyCents).toBe(60000);

    // 31 Oct 2026 22:30 UTC is still 31 Oct 23:30 in Berlin: three months left.
    const justBeforeMidnightBerlin = new Date("2026-10-31T22:30:00.000Z");
    expect(computeSavingPlanTotals(goals, 0, justBeforeMidnightBerlin).suggestedMonthlyCents).toBe(40000);

    // 31 Dec 2026 23:30 UTC is 1 Jan 2027 00:30 in Berlin: the deadline month
    // itself, the year has already turned → at least one month.
    const newYearBerlin = new Date("2026-12-31T23:30:00.000Z");
    expect(computeSavingPlanTotals(goals, 0, newYearBerlin).suggestedMonthlyCents).toBe(120000);
  });
});

describe("linkedSpentCents — what was spent on a goal", () => {
  const SAVINGS = new Set(["cat-savings"]);
  const row = (amountCents: number, categoryId: string | null = "cat-travel") => ({ amountCents, categoryId });

  it("adds up the linked expenses, with or without a category", () => {
    expect(linkedSpentCents([row(-20000), row(-5000, null)], SAVINGS)).toBe(25000);
  });

  it("subtracts a linked refund instead of adding it", () => {
    expect(linkedSpentCents([row(-20000), row(5000)], SAVINGS)).toBe(15000);
  });

  it("is never negative", () => {
    expect(linkedSpentCents([row(-5000), row(20000)], SAVINGS)).toBe(0);
    expect(linkedSpentCents([], SAVINGS)).toBe(0);
  });

  it("does not count bookings in a savings category, deposit or withdrawal", () => {
    expect(linkedSpentCents([row(-20000), row(-10000, "cat-savings"), row(7000, "cat-savings")], SAVINGS)).toBe(20000);
  });
});
