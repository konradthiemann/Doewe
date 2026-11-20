import { describe, expect, it } from "vitest";

import { computeSavingPlanTotals, linkedSpentCents, savingsPaidCents, type SavingPlanGoal } from "../app/api/saving-plan/compute";

// Plan totals without a savings balance: targets and rates the household set.
// "Now" is a fixed UTC instant; the current month is its Europe/Berlin month.

/** 19 Nov 2026, 11:00 in Berlin. */
const NOW = new Date("2026-11-19T10:00:00.000Z");

const goal = (overrides: Partial<SavingPlanGoal>): SavingPlanGoal => ({
  amountCents: 100_000,
  monthlyRateCents: null,
  completedAt: null,
  month: 12,
  year: 2026,
  ...overrides
});

describe("computeSavingPlanTotals", () => {
  it("is zero without goals", () => {
    expect(computeSavingPlanTotals([], NOW)).toEqual({ totalTargetCents: 0, monthlyRateCents: 0 });
  });

  it("sums targets and rates of the open dated goals", () => {
    const totals = computeSavingPlanTotals(
      [
        goal({ amountCents: 120_000, monthlyRateCents: 60_000 }),
        goal({ amountCents: 80_000, monthlyRateCents: 0, month: 6, year: 2027 }),
        goal({ amountCents: null, monthlyRateCents: 5_000, month: 1, year: 2027 })
      ],
      NOW
    );
    expect(totals).toEqual({ totalTargetCents: 200_000, monthlyRateCents: 65_000 });
  });

  it("leaves completed and undated goals out", () => {
    const totals = computeSavingPlanTotals(
      [
        goal({ monthlyRateCents: 10_000, completedAt: NOW }),
        goal({ monthlyRateCents: 10_000, month: null, year: null }),
        goal({ amountCents: 50_000, monthlyRateCents: 25_000 })
      ],
      NOW
    );
    expect(totals).toEqual({ totalTargetCents: 50_000, monthlyRateCents: 25_000 });
  });

  it("drops the rate of a goal whose date has passed, but keeps its target", () => {
    const totals = computeSavingPlanTotals(
      [goal({ month: 10, monthlyRateCents: 30_000 }), goal({ month: 11, monthlyRateCents: 20_000 })],
      NOW
    );
    expect(totals).toEqual({ totalTargetCents: 200_000, monthlyRateCents: 20_000 });
  });

  it("decides the current month in Berlin", () => {
    const octoberGoal = [goal({ month: 10, monthlyRateCents: 30_000 })];
    // 31 Oct 23:30 in Berlin: still October.
    expect(computeSavingPlanTotals(octoberGoal, new Date("2026-10-31T22:30:00.000Z")).monthlyRateCents).toBe(30_000);
    // 1 Nov 00:30 in Berlin, still 31 Oct in UTC: November.
    expect(computeSavingPlanTotals(octoberGoal, new Date("2026-10-31T23:30:00.000Z")).monthlyRateCents).toBe(0);
  });
});

describe("linkedSpentCents", () => {
  const savingsIds = new Set(["sav"]);

  it("is the expenses minus the refunds, without savings bookings, never below 0", () => {
    expect(
      linkedSpentCents(
        [
          { amountCents: -30_000, categoryId: "food" },
          { amountCents: -5_000, categoryId: null },
          { amountCents: 2_000, categoryId: "food" },
          { amountCents: -50_000, categoryId: "sav" },
          { amountCents: 50_000, categoryId: "sav" }
        ],
        savingsIds
      )
    ).toBe(33_000);
    expect(linkedSpentCents([{ amountCents: 5_000, categoryId: "food" }], savingsIds)).toBe(0);
  });
});

describe("savingsPaidCents", () => {
  it("sums the payments", () => {
    expect(savingsPaidCents([])).toBe(0);
    expect(savingsPaidCents([{ amountCents: 50_000 }, { amountCents: 70_001 }])).toBe(120_001);
  });
});
