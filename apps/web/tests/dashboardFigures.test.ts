import { describe, expect, it } from "vitest";

import { fixedCostRatioPercent, nextGoalDeadline, recurringDueFigures, sortByDueDay } from "../lib/dashboardFigures";

describe("recurringDueFigures", () => {
  it("uses the totals of all due standing orders when the summary has them", () => {
    // Late in the month: everything is booked, the planned-only fields are 0.
    expect(
      recurringDueFigures({
        recurringTransactions: [],
        recurringIncomeTotal: 0,
        recurringOutcomeTotal: 0,
        recurringDueIncomeTotal: 3200,
        recurringDueOutcomeTotal: 1450.5,
        recurringDueCount: 7
      })
    ).toEqual({ incomeTotal: 3200, outcomeTotal: 1450.5, count: 7 });
  });

  it("keeps a real 0 of the new fields instead of falling back", () => {
    expect(
      recurringDueFigures({
        recurringTransactions: [{}, {}],
        recurringIncomeTotal: 100,
        recurringOutcomeTotal: 200,
        recurringDueIncomeTotal: 0,
        recurringDueOutcomeTotal: 0,
        recurringDueCount: 0
      })
    ).toEqual({ incomeTotal: 0, outcomeTotal: 0, count: 0 });
  });

  it("falls back to the planned-only fields for an old (cached) payload", () => {
    expect(
      recurringDueFigures({
        recurringTransactions: [{}, {}, {}],
        recurringIncomeTotal: 3200,
        recurringOutcomeTotal: 900
      })
    ).toEqual({ incomeTotal: 3200, outcomeTotal: 900, count: 3 });
  });

  it("is all zero for an empty summary", () => {
    expect(recurringDueFigures({})).toEqual({ incomeTotal: 0, outcomeTotal: 0, count: 0 });
  });
});

describe("fixedCostRatioPercent", () => {
  it("is the share of recurring expenses in the projected income, in whole percent", () => {
    expect(fixedCostRatioPercent(1450.5, 3200)).toBe(45);
    expect(fixedCostRatioPercent(1600, 3200)).toBe(50);
    expect(fixedCostRatioPercent(0, 3200)).toBe(0);
  });

  it("rounds commercially", () => {
    expect(fixedCostRatioPercent(1005, 2000)).toBe(50); // 50.25 %
    expect(fixedCostRatioPercent(1010, 2000)).toBe(51); // 50.5 %
  });

  it("is 0 without income and may exceed 100", () => {
    expect(fixedCostRatioPercent(500, 0)).toBe(0);
    expect(fixedCostRatioPercent(500, -10)).toBe(0);
    expect(fixedCostRatioPercent(3000, 2000)).toBe(150);
  });
});

describe("sortByDueDay", () => {
  const item = (description: string, dayOfMonth: number | null) => ({ description, dayOfMonth });

  it("sorts by day and keeps items whose day has already passed", () => {
    const sorted = sortByDueDay([item("Strom", 20), item("Miete", 1), item("Internet", 5)]);
    expect(sorted.map((i) => i.description)).toEqual(["Miete", "Internet", "Strom"]);
  });

  it("breaks ties by description and puts items without a day last", () => {
    const sorted = sortByDueDay([item("Zeitung", 1), item("Ohne Tag", null), item("Miete", 1)]);
    expect(sorted.map((i) => i.description)).toEqual(["Miete", "Zeitung", "Ohne Tag"]);
  });

  it("does not mutate its input", () => {
    const input = [item("B", 2), item("A", 1)];
    sortByDueDay(input);
    expect(input.map((i) => i.description)).toEqual(["B", "A"]);
  });
});

describe("nextGoalDeadline", () => {
  const current = { year: 2026, month: 11 };

  it("is the earliest goal month from the current month on", () => {
    expect(
      nextGoalDeadline(
        [
          { year: 2027, month: 3 },
          { year: 2026, month: 12 },
          { year: 2026, month: 10 }
        ],
        current
      )
    ).toEqual({ year: 2026, month: 12 });
  });

  it("includes the current month and ignores past months", () => {
    expect(nextGoalDeadline([{ year: 2026, month: 11 }], current)).toEqual({ year: 2026, month: 11 });
    expect(nextGoalDeadline([{ year: 2026, month: 10 }], current)).toBeNull();
    expect(nextGoalDeadline([], current)).toBeNull();
  });

  it("compares across the year boundary", () => {
    expect(nextGoalDeadline([{ year: 2027, month: 1 }], { year: 2026, month: 12 })).toEqual({ year: 2027, month: 1 });
  });
});
