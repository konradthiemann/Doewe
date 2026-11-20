import { describe, expect, it } from "vitest";

import {
  goalPercent,
  goalSpending,
  isDeadlinePast,
  monthsToDeadline,
  suggestMonthlyRateCents
} from "../lib/savingGoalProgress";

/** 19 Nov 2026, 11:00 in Berlin. */
const NOW = new Date("2026-11-19T10:00:00.000Z");

describe("goalPercent", () => {
  it("reaches 100 only at the target", () => {
    expect(goalPercent(99_500, 100_000)).toBe(99);
    expect(goalPercent(100_000, 100_000)).toBe(100);
    expect(goalPercent(50_000, 100_000)).toBe(50);
    expect(goalPercent(0, 0)).toBe(100);
  });
});

describe("monthsToDeadline", () => {
  it("counts the current month and stops before the deadline month", () => {
    expect(monthsToDeadline({ year: 2027, month: 1 }, NOW)).toBe(2);
    expect(monthsToDeadline({ year: 2027, month: 7 }, NOW)).toBe(8);
  });

  it("is at least 1", () => {
    expect(monthsToDeadline({ year: 2026, month: 12 }, NOW)).toBe(1);
    expect(monthsToDeadline({ year: 2026, month: 11 }, NOW)).toBe(1);
    expect(monthsToDeadline({ year: 2025, month: 1 }, NOW)).toBe(1);
  });

  it("uses the Berlin month", () => {
    // 1 Dec 00:30 in Berlin, still 30 Nov in UTC.
    expect(monthsToDeadline({ year: 2027, month: 1 }, new Date("2026-11-30T23:30:00.000Z"))).toBe(1);
  });
});

describe("isDeadlinePast", () => {
  it("is true only once the deadline month is over", () => {
    expect(isDeadlinePast({ year: 2026, month: 10 }, NOW)).toBe(true);
    expect(isDeadlinePast({ year: 2026, month: 11 }, NOW)).toBe(false);
    expect(isDeadlinePast({ year: 2027, month: 1 }, NOW)).toBe(false);
  });
});

describe("suggestMonthlyRateCents", () => {
  it("spreads the target over the months left, rounded up", () => {
    expect(suggestMonthlyRateCents(120_000, { year: 2027, month: 1 }, NOW)).toBe(60_000);
    expect(suggestMonthlyRateCents(100_001, { year: 2027, month: 1 }, NOW)).toBe(50_001);
  });

  it("is null without a target or a date", () => {
    expect(suggestMonthlyRateCents(null, { year: 2027, month: 1 }, NOW)).toBeNull();
    expect(suggestMonthlyRateCents(0, { year: 2027, month: 1 }, NOW)).toBeNull();
    expect(suggestMonthlyRateCents(120_000, null, NOW)).toBeNull();
  });
});

describe("goalSpending", () => {
  it("adds the monthly budget and the savings and compares with the target", () => {
    expect(goalSpending(30_000, 150_000, 200_000)).toEqual({
      spentCents: 180_000,
      remainingCents: 20_000,
      overCents: 0,
      percent: 90
    });
  });

  it("shows what went over the target", () => {
    expect(goalSpending(30_000, 190_000, 200_000)).toEqual({
      spentCents: 220_000,
      remainingCents: 0,
      overCents: 20_000,
      percent: 100
    });
  });

  it("has no share without a target", () => {
    expect(goalSpending(5_000, 0, null)).toEqual({ spentCents: 5_000, remainingCents: 0, overCents: 0, percent: 0 });
  });
});
