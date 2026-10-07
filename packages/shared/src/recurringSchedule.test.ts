import { describe, expect, it } from "vitest";

import { addMonthsClamped, dueMonthsBetween, isRecurringDueInMonth } from "./recurringSchedule";

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

describe("addMonthsClamped", () => {
  it("clamps Jan 31 + 1 month to the end of a non-leap February", () => {
    expect(addMonthsClamped({ year: 2026, month: 1, day: 31 }, 1)).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it("clamps Jan 31 + 1 month to Feb 29 in a leap year", () => {
    expect(addMonthsClamped({ year: 2028, month: 1, day: 31 }, 1)).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it("rolls over the year boundary", () => {
    expect(addMonthsClamped({ year: 2026, month: 11, day: 15 }, 3)).toEqual({ year: 2027, month: 2, day: 15 });
  });

  it("adds 12 months to the same day next year", () => {
    expect(addMonthsClamped({ year: 2026, month: 10, day: 7 }, 12)).toEqual({ year: 2027, month: 10, day: 7 });
  });

  it("uses dayOfMonth instead of the date's day and clamps it to the target month", () => {
    expect(addMonthsClamped({ year: 2026, month: 3, day: 10 }, 1, 31)).toEqual({ year: 2026, month: 4, day: 30 });
  });

  it("stays in the same month for months = 0", () => {
    expect(addMonthsClamped({ year: 2026, month: 5, day: 12 }, 0)).toEqual({ year: 2026, month: 5, day: 12 });
  });

  it("throws RangeError for negative or non-integer months", () => {
    expect(() => addMonthsClamped({ year: 2026, month: 5, day: 12 }, -1)).toThrow(RangeError);
    expect(() => addMonthsClamped({ year: 2026, month: 5, day: 12 }, 1.5)).toThrow(RangeError);
  });

  it("throws RangeError for dayOfMonth outside 1..31", () => {
    expect(() => addMonthsClamped({ year: 2026, month: 5, day: 12 }, 1, 0)).toThrow(RangeError);
    expect(() => addMonthsClamped({ year: 2026, month: 5, day: 12 }, 1, 32)).toThrow(RangeError);
  });
});
