import { describe, expect, it } from "vitest";

import { dueMonthsBetween, isRecurringDueInMonth } from "./recurringSchedule";

describe("isRecurringDueInMonth", () => {
  it("is due in the anchor month itself", () => {
    expect(
      isRecurringDueInMonth({ nextYear: 2026, nextMonth: 1, intervalMonths: 3, year: 2026, month: 1 })
    ).toBe(true);
  });

  it("is not due before the anchor month", () => {
    expect(
      isRecurringDueInMonth({ nextYear: 2026, nextMonth: 3, intervalMonths: 1, year: 2026, month: 1 })
    ).toBe(false);
  });

  it("matches the documented quarterly example (intervalMonths=3, anchor 2026-01)", () => {
    const cases: Array<[number, number, boolean]> = [
      [2026, 1, true],
      [2026, 2, false],
      [2026, 3, false],
      [2026, 4, true],
      [2026, 7, true]
    ];
    for (const [year, month, expected] of cases) {
      expect(
        isRecurringDueInMonth({ nextYear: 2026, nextMonth: 1, intervalMonths: 3, year, month })
      ).toBe(expected);
    }
  });

  it("is due every month when intervalMonths is 1", () => {
    expect(
      isRecurringDueInMonth({ nextYear: 2026, nextMonth: 5, intervalMonths: 1, year: 2026, month: 9 })
    ).toBe(true);
  });
});

describe("dueMonthsBetween", () => {
  it("lists every due (year, month) from the anchor up to and including the reference month", () => {
    // Monthly recurring, anchor March 2026, reference September 2026 → 7 occurrences.
    const months = dueMonthsBetween({
      nextYear: 2026,
      nextMonth: 3,
      intervalMonths: 1,
      untilYear: 2026,
      untilMonth: 9
    });
    expect(months).toEqual([
      { year: 2026, month: 3 },
      { year: 2026, month: 4 },
      { year: 2026, month: 5 },
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
      { year: 2026, month: 9 }
    ]);
  });

  it("only lists matching interval months, and stops at the reference month", () => {
    const months = dueMonthsBetween({
      nextYear: 2026,
      nextMonth: 1,
      intervalMonths: 3,
      untilYear: 2026,
      untilMonth: 8
    });
    expect(months).toEqual([
      { year: 2026, month: 1 },
      { year: 2026, month: 4 },
      { year: 2026, month: 7 }
    ]);
  });

  it("returns an empty list when the anchor is still in the future", () => {
    const months = dueMonthsBetween({
      nextYear: 2027,
      nextMonth: 1,
      intervalMonths: 1,
      untilYear: 2026,
      untilMonth: 9
    });
    expect(months).toEqual([]);
  });
});
