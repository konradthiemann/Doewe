import { describe, expect, it } from "vitest";

import {
  APP_TIME_ZONE,
  daysInMonth,
  monthKey,
  parseDayKey,
  shiftMonth,
  zonedDate,
  zonedDayKey,
  zonedDayRange,
  zonedMonth,
  zonedMonthRange,
  zonedTimeToUtc,
  zonedYearRange
} from "./calendar";

// Every expectation is written as an explicit UTC instant, so the suite gives
// the same answer on a UTC server, in CI and on a Europe/Berlin laptop.

describe("zonedMonth / zonedDate", () => {
  it("defaults to Europe/Berlin", () => {
    expect(APP_TIME_ZONE).toBe("Europe/Berlin");
  });

  it("puts a booking shortly after local midnight on the 1st into the new month (winter, UTC+1)", () => {
    // 2026-12-01 00:30 Berlin = 2026-11-30 23:30 UTC
    const instant = new Date("2026-11-30T23:30:00.000Z");
    expect(zonedMonth(instant)).toEqual({ year: 2026, month: 12 });
    expect(zonedDate(instant)).toEqual({ year: 2026, month: 12, day: 1 });
  });

  it("puts a booking shortly after local midnight on the 1st into the new month (summer, UTC+2)", () => {
    // 2026-07-01 01:30 Berlin = 2026-06-30 23:30 UTC
    const instant = new Date("2026-06-30T23:30:00.000Z");
    expect(zonedMonth(instant)).toEqual({ year: 2026, month: 7 });
  });

  it("keeps the last second of the local month in that month", () => {
    // 2026-10-31 23:59:59 Berlin (UTC+1 after the change on 25 Oct) = 22:59:59 UTC
    expect(zonedMonth(new Date("2026-10-31T22:59:59.000Z"))).toEqual({ year: 2026, month: 10 });
    expect(zonedMonth(new Date("2026-10-31T23:00:00.000Z"))).toEqual({ year: 2026, month: 11 });
  });

  it("rolls over the year at local midnight", () => {
    expect(zonedMonth(new Date("2026-12-31T22:59:59.999Z"))).toEqual({ year: 2026, month: 12 });
    expect(zonedMonth(new Date("2026-12-31T23:00:00.000Z"))).toEqual({ year: 2027, month: 1 });
  });

  it("honours an explicit time zone", () => {
    const instant = new Date("2026-03-01T02:00:00.000Z");
    expect(zonedMonth(instant, "America/New_York")).toEqual({ year: 2026, month: 2 });
    expect(zonedMonth(instant, "UTC")).toEqual({ year: 2026, month: 3 });
  });

  it("formats the local day as yyyy-mm-dd", () => {
    expect(zonedDayKey(new Date("2026-02-28T23:15:00.000Z"))).toBe("2026-03-01");
  });
});

describe("zonedTimeToUtc", () => {
  it("resolves local midnight in winter and summer time", () => {
    expect(zonedTimeToUtc({ year: 2026, month: 1, day: 1 }).toISOString()).toBe("2025-12-31T23:00:00.000Z");
    expect(zonedTimeToUtc({ year: 2026, month: 7, day: 1 }).toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });

  it("resolves local noon", () => {
    expect(zonedTimeToUtc({ year: 2026, month: 11, day: 19, hour: 12 }).toISOString()).toBe(
      "2026-11-19T11:00:00.000Z"
    );
  });

  it("is exact on both sides of the spring-forward change (29 Mar 2026, 02:00 → 03:00)", () => {
    expect(zonedTimeToUtc({ year: 2026, month: 3, day: 29, hour: 1, minute: 59 }).toISOString()).toBe(
      "2026-03-29T00:59:00.000Z"
    );
    expect(zonedTimeToUtc({ year: 2026, month: 3, day: 29, hour: 3 }).toISOString()).toBe(
      "2026-03-29T01:00:00.000Z"
    );
  });

  it("is exact on both sides of the fall-back change (25 Oct 2026, 03:00 → 02:00)", () => {
    expect(zonedTimeToUtc({ year: 2026, month: 10, day: 25 }).toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(zonedTimeToUtc({ year: 2026, month: 10, day: 25, hour: 12 }).toISOString()).toBe(
      "2026-10-25T11:00:00.000Z"
    );
  });

  it("round-trips through zonedDate for every day of a year", () => {
    for (let month = 1; month <= 12; month++) {
      for (let day = 1; day <= daysInMonth(2026, month); day++) {
        const midnight = zonedTimeToUtc({ year: 2026, month, day });
        expect(zonedDate(midnight)).toEqual({ year: 2026, month, day });
        expect(zonedDate(new Date(midnight.getTime() - 1))).not.toEqual({ year: 2026, month, day });
      }
    }
  });
});

describe("ranges", () => {
  it("covers a 31-day month as a half-open range", () => {
    const { start, end } = zonedMonthRange(2026, 10);
    expect(start.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });

  it("lets consecutive months share their boundary exactly", () => {
    for (let month = 1; month <= 12; month++) {
      expect(zonedMonthRange(2026, month).end.getTime()).toBe(zonedMonthRange(2026, month + 1).start.getTime());
    }
  });

  it("accepts month overflow in both directions", () => {
    expect(zonedMonthRange(2026, 13)).toEqual(zonedMonthRange(2027, 1));
    expect(zonedMonthRange(2026, 0)).toEqual(zonedMonthRange(2025, 12));
  });

  it("spans exactly the twelve months of a year", () => {
    const year = zonedYearRange(2026);
    expect(year.start.getTime()).toBe(zonedMonthRange(2026, 1).start.getTime());
    expect(year.end.getTime()).toBe(zonedMonthRange(2026, 12).end.getTime());
  });

  it("gives 23- and 25-hour days around the daylight-saving changes", () => {
    const hours = (day: { year: number; month: number; day: number }) => {
      const { start, end } = zonedDayRange(day);
      return (end.getTime() - start.getTime()) / 3_600_000;
    };
    expect(hours({ year: 2026, month: 3, day: 29 })).toBe(23);
    expect(hours({ year: 2026, month: 10, day: 25 })).toBe(25);
    expect(hours({ year: 2026, month: 6, day: 15 })).toBe(24);
  });

  it("includes the whole last day of a month in its day range", () => {
    const { start, end } = zonedDayRange({ year: 2026, month: 10, day: 31 });
    const evening = new Date("2026-10-31T19:45:00.000Z"); // 20:45 Berlin
    expect(evening.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(evening.getTime()).toBeLessThan(end.getTime());
  });
});

describe("daysInMonth / shiftMonth / parseDayKey", () => {
  it("knows leap years", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  it("shifts across year boundaries", () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 3 }, -14)).toEqual({ year: 2025, month: 1 });
  });

  it("formats a month key", () => {
    expect(monthKey({ year: 2026, month: 3 })).toBe("2026-03");
    expect(monthKey(zonedMonth(new Date("2026-12-31T23:30:00.000Z")))).toBe("2027-01");
  });

  it("parses date-input values and rejects impossible days", () => {
    expect(parseDayKey("2026-10-31")).toEqual({ year: 2026, month: 10, day: 31 });
    expect(parseDayKey("2026-02-30")).toBeNull();
    expect(parseDayKey("2026-13-01")).toBeNull();
    expect(parseDayKey("31.10.2026")).toBeNull();
    expect(parseDayKey("")).toBeNull();
  });
});
