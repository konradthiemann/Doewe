import { zonedDate } from "@doewe/shared";
import { describe, expect, it } from "vitest";

import {
  backfillMonthCount,
  dayOfStartDate,
  isStartDateInRange,
  moveStartDateToDay,
  startDateBounds
} from "../lib/recurringStart";

const TODAY = { year: 2026, month: 11, day: 19 };

describe("startDateBounds / isStartDateInRange", () => {
  it("allows ten years before and after today, both ends included", () => {
    expect(startDateBounds(TODAY)).toEqual({ min: "2016-11-19", max: "2036-11-19" });
    expect(isStartDateInRange("2016-11-19", TODAY)).toBe(true);
    expect(isStartDateInRange("2036-11-19", TODAY)).toBe(true);
    expect(isStartDateInRange("2026-11-19", TODAY)).toBe(true);
    expect(isStartDateInRange("2016-11-18", TODAY)).toBe(false);
    expect(isStartDateInRange("2036-11-20", TODAY)).toBe(false);
  });

  it("clamps 29 February to the 28th in a common year", () => {
    expect(startDateBounds({ year: 2028, month: 2, day: 29 })).toEqual({ min: "2018-02-28", max: "2038-02-28" });
  });

  it("rejects anything that is not a calendar day", () => {
    expect(isStartDateInRange("", TODAY)).toBe(false);
    expect(isStartDateInRange("2026-02-30", TODAY)).toBe(false);
    expect(isStartDateInRange("19.11.2026", TODAY)).toBe(false);
  });
});

describe("dayOfStartDate / moveStartDateToDay", () => {
  it("reads the day of a start date", () => {
    expect(dayOfStartDate("2026-08-31")).toBe(31);
    expect(dayOfStartDate("2026-08-01")).toBe(1);
    expect(dayOfStartDate("")).toBeNull();
    expect(dayOfStartDate("2026-02-30")).toBeNull();
  });

  it("moves the start date to the day within its own month", () => {
    expect(moveStartDateToDay("2026-08-31", 15)).toBe("2026-08-15");
    expect(moveStartDateToDay("2026-08-15", 1)).toBe("2026-08-01");
  });

  it("clamps the day to the length of the month", () => {
    expect(moveStartDateToDay("2026-02-10", 31)).toBe("2026-02-28");
    expect(moveStartDateToDay("2028-02-10", 31)).toBe("2028-02-29");
    expect(moveStartDateToDay("2026-11-05", 31)).toBe("2026-11-30");
  });

  it("leaves the start date alone for an unusable day or date", () => {
    expect(moveStartDateToDay("2026-08-31", 0)).toBe("2026-08-31");
    expect(moveStartDateToDay("2026-08-31", 32)).toBe("2026-08-31");
    expect(moveStartDateToDay("2026-08-31", Number.NaN)).toBe("2026-08-31");
    expect(moveStartDateToDay("", 15)).toBe("");
  });
});

describe("backfillMonthCount", () => {
  it("counts the due months from the start month up to last month", () => {
    // August, September, October — November is the current month.
    expect(backfillMonthCount("2026-08-15", 1, TODAY)).toBe(3);
    expect(backfillMonthCount("2026-10-31", 1, TODAY)).toBe(1);
    expect(backfillMonthCount("2025-11-01", 1, TODAY)).toBe(12);
  });

  it("follows the interval", () => {
    // Every 3 months from February: February, May, August (November is current).
    expect(backfillMonthCount("2026-02-01", 3, TODAY)).toBe(3);
    // Every 12 months from November 2024: 2024 and 2025.
    expect(backfillMonthCount("2024-11-01", 12, TODAY)).toBe(2);
    expect(backfillMonthCount("2026-08-15", 0, TODAY)).toBe(3); // an unusable interval counts as monthly
  });

  it("is 0 for a start date in the current month or later", () => {
    expect(backfillMonthCount("2026-11-01", 1, TODAY)).toBe(0);
    expect(backfillMonthCount("2026-11-30", 1, TODAY)).toBe(0);
    expect(backfillMonthCount("2027-01-10", 1, TODAY)).toBe(0);
    expect(backfillMonthCount("", 1, TODAY)).toBe(0);
  });

  it("crosses the year boundary", () => {
    expect(backfillMonthCount("2025-12-10", 1, { year: 2026, month: 1 })).toBe(1);
    expect(backfillMonthCount("2026-01-01", 1, { year: 2026, month: 1 })).toBe(0);
  });

  it("uses the Berlin month as the current month", () => {
    // 1 Nov 2026, 00:30 in Berlin — still 31 Oct in UTC and in Los Angeles.
    const today = zonedDate(new Date("2026-10-31T23:30:00.000Z"));
    expect(today).toMatchObject({ year: 2026, month: 11, day: 1 });
    expect(backfillMonthCount("2026-10-15", 1, today)).toBe(1);
  });
});
