import { describe, expect, it } from "vitest";

import {
  addMonthsClamped,
  bookFromPeriodFor,
  calendarDaysBetween,
  dueMonthsBetween,
  firstOccurrenceFrom,
  firstOccurrenceOnOrAfter,
  isAdoptionCandidate,
  isBeforeBookFromPeriod,
  isOnOrBeforeDate,
  isRecurringDueInMonth,
  isWithinYearsOf,
  occurrenceDate,
  pickAdoptionCandidate,
  type AdoptionRow,
  type AdoptionTemplate
} from "./recurringSchedule";

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

describe("occurrenceDate", () => {
  it("keeps a day the month has", () => {
    expect(occurrenceDate({ year: 2026, month: 11 }, 15)).toEqual({ year: 2026, month: 11, day: 15 });
  });

  it("clamps day 31 to the length of the month", () => {
    expect(occurrenceDate({ year: 2026, month: 11 }, 31)).toEqual({ year: 2026, month: 11, day: 30 });
    expect(occurrenceDate({ year: 2026, month: 2 }, 31)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(occurrenceDate({ year: 2028, month: 2 }, 31)).toEqual({ year: 2028, month: 2, day: 29 });
    expect(occurrenceDate({ year: 2026, month: 12 }, 31)).toEqual({ year: 2026, month: 12, day: 31 });
  });
});

describe("isOnOrBeforeDate", () => {
  const today = { year: 2026, month: 11, day: 19 };

  it("is true for the same day and for earlier days", () => {
    expect(isOnOrBeforeDate({ year: 2026, month: 11, day: 19 }, today)).toBe(true);
    expect(isOnOrBeforeDate({ year: 2026, month: 11, day: 18 }, today)).toBe(true);
    expect(isOnOrBeforeDate({ year: 2026, month: 10, day: 31 }, today)).toBe(true);
    expect(isOnOrBeforeDate({ year: 2025, month: 12, day: 31 }, today)).toBe(true);
  });

  it("is false for later days, months and years", () => {
    expect(isOnOrBeforeDate({ year: 2026, month: 11, day: 20 }, today)).toBe(false);
    expect(isOnOrBeforeDate({ year: 2026, month: 12, day: 1 }, today)).toBe(false);
    expect(isOnOrBeforeDate({ year: 2027, month: 1, day: 1 }, today)).toBe(false);
  });
});

describe("firstOccurrenceFrom", () => {
  it("is this month when the day is still ahead", () => {
    expect(firstOccurrenceFrom({ year: 2026, month: 11, day: 19 }, 25)).toEqual({ year: 2026, month: 11, day: 25 });
  });

  it("is next month when the day is today", () => {
    expect(firstOccurrenceFrom({ year: 2026, month: 11, day: 19 }, 19)).toEqual({ year: 2026, month: 12, day: 19 });
  });

  it("is next month when the day has passed", () => {
    expect(firstOccurrenceFrom({ year: 2026, month: 11, day: 19 }, 18)).toEqual({ year: 2026, month: 12, day: 18 });
  });

  it("treats day 30 and day 31 the same on 30 November: both start in December", () => {
    const today = { year: 2026, month: 11, day: 30 };
    expect(firstOccurrenceFrom(today, 30)).toEqual({ year: 2026, month: 12, day: 30 });
    expect(firstOccurrenceFrom(today, 31)).toEqual({ year: 2026, month: 12, day: 31 });
  });

  it("is this month for day 31 on 29 November: the clamped day 30 is still ahead", () => {
    expect(firstOccurrenceFrom({ year: 2026, month: 11, day: 29 }, 31)).toEqual({ year: 2026, month: 11, day: 30 });
  });

  it("clamps in the following month and rolls over the year", () => {
    // 31 January: day 30 has passed -> February, clamped to its last day.
    expect(firstOccurrenceFrom({ year: 2026, month: 1, day: 31 }, 30)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(firstOccurrenceFrom({ year: 2026, month: 12, day: 15 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
  });
});

// The pure rules behind "no unasked back-booking" and "a payment entered by
// hand stands for the occurrence" (recurringSchedule.ts). Instants are fixed;
// calendar days are Berlin days in any process time zone.

describe("firstOccurrenceOnOrAfter", () => {
  it("is the booking day in the start month when that day is the start day or later", () => {
    expect(firstOccurrenceOnOrAfter({ year: 2026, month: 11, day: 20 }, 20)).toEqual({ year: 2026, month: 11, day: 20 });
    expect(firstOccurrenceOnOrAfter({ year: 2026, month: 11, day: 20 }, 25)).toEqual({ year: 2026, month: 11, day: 25 });
  });

  it("is the booking day of the following month when it lies before the start day", () => {
    // start 20 November, booked on the 5th: never 5 November
    expect(firstOccurrenceOnOrAfter({ year: 2026, month: 11, day: 20 }, 5)).toEqual({ year: 2026, month: 12, day: 5 });
    expect(firstOccurrenceOnOrAfter({ year: 2026, month: 12, day: 20 }, 5)).toEqual({ year: 2027, month: 1, day: 5 });
  });

  it("compares the clamped day and clamps in the following month", () => {
    // 30 April, day 31: clamped to the 30th, which is the start day
    expect(firstOccurrenceOnOrAfter({ year: 2027, month: 4, day: 30 }, 31)).toEqual({ year: 2027, month: 4, day: 30 });
    // 31 January, day 30 -> February has 28 days in 2027
    expect(firstOccurrenceOnOrAfter({ year: 2027, month: 1, day: 31 }, 30)).toEqual({ year: 2027, month: 2, day: 28 });
  });
});

describe("isWithinYearsOf", () => {
  const today = { year: 2026, month: 11, day: 19 };

  it("accepts the same day 10 years back and ahead, and everything in between", () => {
    expect(isWithinYearsOf({ year: 2016, month: 11, day: 19 }, today)).toBe(true);
    expect(isWithinYearsOf({ year: 2036, month: 11, day: 19 }, today)).toBe(true);
    expect(isWithinYearsOf(today, today)).toBe(true);
  });

  it("rejects the day before and the day after that range", () => {
    expect(isWithinYearsOf({ year: 2016, month: 11, day: 18 }, today)).toBe(false);
    expect(isWithinYearsOf({ year: 2036, month: 11, day: 20 }, today)).toBe(false);
    expect(isWithinYearsOf({ year: 2016, month: 1, day: 1 }, today)).toBe(false);
  });

  it("works from 29 February", () => {
    const leapDay = { year: 2028, month: 2, day: 29 };
    expect(isWithinYearsOf({ year: 2018, month: 3, day: 1 }, leapDay)).toBe(true);
    expect(isWithinYearsOf({ year: 2018, month: 2, day: 28 }, leapDay)).toBe(false);
    expect(isWithinYearsOf({ year: 2038, month: 2, day: 28 }, leapDay)).toBe(true);
    expect(isWithinYearsOf({ year: 2038, month: 3, day: 1 }, leapDay)).toBe(false);
  });

  it("takes another number of years", () => {
    expect(isWithinYearsOf({ year: 2024, month: 11, day: 19 }, today, 2)).toBe(true);
    expect(isWithinYearsOf({ year: 2024, month: 11, day: 18 }, today, 2)).toBe(false);
  });
});

describe("bookFromPeriodFor", () => {
  const current = { year: 2026, month: 11 };

  it("is the current month for a series that starts in an earlier month", () => {
    expect(bookFromPeriodFor({ year: 2026, month: 10 }, current, false)).toBe("2026-11");
    expect(bookFromPeriodFor({ year: 2016, month: 12 }, current, false)).toBe("2026-11");
  });

  it("is empty for a series that starts in the current month or later", () => {
    expect(bookFromPeriodFor({ year: 2026, month: 11 }, current, false)).toBeNull();
    expect(bookFromPeriodFor({ year: 2027, month: 1 }, current, false)).toBeNull();
  });

  it("is empty when the user asked for the backfill", () => {
    expect(bookFromPeriodFor({ year: 2026, month: 1 }, current, true)).toBeNull();
  });
});

describe("isBeforeBookFromPeriod", () => {
  it("is never true without a lower bound", () => {
    expect(isBeforeBookFromPeriod({ year: 1999, month: 1 }, null)).toBe(false);
  });

  it("is true for months before the bound only", () => {
    expect(isBeforeBookFromPeriod({ year: 2026, month: 10 }, "2026-11")).toBe(true);
    expect(isBeforeBookFromPeriod({ year: 2025, month: 12 }, "2026-11")).toBe(true);
    expect(isBeforeBookFromPeriod({ year: 2026, month: 11 }, "2026-11")).toBe(false);
    expect(isBeforeBookFromPeriod({ year: 2027, month: 1 }, "2026-11")).toBe(false);
  });
});

describe("calendarDaysBetween", () => {
  it("counts calendar days across month, year and daylight-saving boundaries", () => {
    expect(calendarDaysBetween({ year: 2026, month: 11, day: 15 }, { year: 2026, month: 11, day: 22 })).toBe(7);
    expect(calendarDaysBetween({ year: 2026, month: 11, day: 15 }, { year: 2026, month: 11, day: 8 })).toBe(-7);
    expect(calendarDaysBetween({ year: 2026, month: 12, day: 28 }, { year: 2027, month: 1, day: 3 })).toBe(6);
    // the clocks go back on 25 October 2026
    expect(calendarDaysBetween({ year: 2026, month: 10, day: 24 }, { year: 2026, month: 10, day: 26 })).toBe(2);
    expect(calendarDaysBetween({ year: 2028, month: 2, day: 28 }, { year: 2028, month: 3, day: 1 })).toBe(2);
  });
});

describe("a hand-entered booking that stands for an occurrence", () => {
  const rent: AdoptionTemplate = { accountId: "acc", categoryId: "cat_rent", amountCents: -95_000, description: "Miete" };
  /** Due on 15 November 2026. */
  const dueDay = { year: 2026, month: 11, day: 15 };

  const row = (id: string, occurredAt: string, extra: Partial<AdoptionRow> = {}): AdoptionRow => ({
    id,
    accountId: "acc",
    categoryId: "cat_rent",
    amountCents: -95_000,
    description: "Miete überwiesen",
    occurredAt: new Date(occurredAt),
    createdAt: new Date("2026-11-01T08:00:00.000Z"),
    ...extra
  });

  it("matches on account, amount and category within 7 Berlin calendar days", () => {
    expect(isAdoptionCandidate(row("a", "2026-11-15T11:00:00.000Z"), rent, dueDay)).toBe(true);
    // 8 Nov 00:30 in Berlin (7 Nov in UTC) is 7 days before; 7 Nov 23:30 in Berlin is 8
    expect(isAdoptionCandidate(row("a", "2026-11-07T23:30:00.000Z"), rent, dueDay)).toBe(true);
    expect(isAdoptionCandidate(row("a", "2026-11-07T22:30:00.000Z"), rent, dueDay)).toBe(false);
    // 22 Nov 23:30 in Berlin is 7 days after; 23 Nov 00:30 in Berlin (22 Nov in UTC) is 8
    expect(isAdoptionCandidate(row("a", "2026-11-22T22:30:00.000Z"), rent, dueDay)).toBe(true);
    expect(isAdoptionCandidate(row("a", "2026-11-22T23:30:00.000Z"), rent, dueDay)).toBe(false);
  });

  it("reaches across a month boundary", () => {
    const firstOfDecember = { year: 2026, month: 12, day: 1 };
    expect(isAdoptionCandidate(row("a", "2026-11-28T11:00:00.000Z"), rent, firstOfDecember)).toBe(true);
    expect(isAdoptionCandidate(row("a", "2026-11-23T11:00:00.000Z"), rent, firstOfDecember)).toBe(false);
  });

  it("rejects another amount, account or category", () => {
    const at = "2026-11-15T11:00:00.000Z";
    expect(isAdoptionCandidate(row("a", at, { amountCents: -95_001 }), rent, dueDay)).toBe(false);
    expect(isAdoptionCandidate(row("a", at, { amountCents: 95_000 }), rent, dueDay)).toBe(false);
    expect(isAdoptionCandidate(row("a", at, { accountId: "other" }), rent, dueDay)).toBe(false);
    expect(isAdoptionCandidate(row("a", at, { categoryId: "cat_other" }), rent, dueDay)).toBe(false);
    expect(isAdoptionCandidate(row("a", at, { categoryId: null, description: "Miete" }), rent, dueDay)).toBe(false);
  });

  it("rejects a deleted booking and one that belongs to a recurring transaction", () => {
    const at = "2026-11-15T11:00:00.000Z";
    expect(isAdoptionCandidate(row("a", at, { deletedAt: new Date(at) }), rent, dueDay)).toBe(false);
    expect(isAdoptionCandidate(row("a", at, { recurringTransactionId: "rec_other" }), rent, dueDay)).toBe(false);
    expect(isAdoptionCandidate(row("a", at, { deletedAt: null, recurringTransactionId: null }), rent, dueDay)).toBe(true);
  });

  it("for a template without category needs no category and the same description, ignoring case and outer whitespace", () => {
    const plain: AdoptionTemplate = { ...rent, categoryId: null };
    const at = "2026-11-15T11:00:00.000Z";
    expect(isAdoptionCandidate(row("a", at, { categoryId: null, description: "  MIETE " }), plain, dueDay)).toBe(true);
    expect(isAdoptionCandidate(row("a", at, { categoryId: null, description: "Miete Garage" }), plain, dueDay)).toBe(false);
    expect(isAdoptionCandidate(row("a", at, { description: "Miete" }), plain, dueDay)).toBe(false);
  });

  it("picks the candidate closest to the due day", () => {
    const rows = [
      row("early", "2026-11-12T11:00:00.000Z"),
      row("close", "2026-11-16T11:00:00.000Z"),
      row("late", "2026-11-20T11:00:00.000Z"),
      row("other-amount", "2026-11-15T11:00:00.000Z", { amountCents: -1 })
    ];
    expect(pickAdoptionCandidate(rows, rent, dueDay)?.id).toBe("close");
  });

  it("among equally close candidates picks the oldest: earliest date, then entered first", () => {
    const before = row("two-days-before", "2026-11-13T11:00:00.000Z", { createdAt: new Date("2026-11-14T08:00:00.000Z") });
    const after = row("two-days-after", "2026-11-17T11:00:00.000Z", { createdAt: new Date("2026-11-13T08:00:00.000Z") });
    expect(pickAdoptionCandidate([after, before], rent, dueDay)?.id).toBe("two-days-before");

    const enteredSecond = row("b", "2026-11-14T11:00:00.000Z", { createdAt: new Date("2026-11-14T18:00:00.000Z") });
    const enteredFirst = row("a", "2026-11-14T11:00:00.000Z", { createdAt: new Date("2026-11-14T09:00:00.000Z") });
    expect(pickAdoptionCandidate([enteredSecond, enteredFirst], rent, dueDay)?.id).toBe("a");
  });

  it("skips excluded ids and returns null when nothing is left", () => {
    const rows = [row("close", "2026-11-15T11:00:00.000Z"), row("next", "2026-11-17T11:00:00.000Z")];
    expect(pickAdoptionCandidate(rows, rent, dueDay, new Set(["close"]))?.id).toBe("next");
    expect(pickAdoptionCandidate(rows, rent, dueDay, new Set(["close", "next"]))).toBeNull();
    expect(pickAdoptionCandidate([], rent, dueDay)).toBeNull();
  });

  it("does not reorder the rows it was given", () => {
    const rows = [row("late", "2026-11-20T11:00:00.000Z"), row("close", "2026-11-15T11:00:00.000Z")];
    pickAdoptionCandidate(rows, rent, dueDay);
    expect(rows.map((r) => r.id)).toEqual(["late", "close"]);
  });
});
