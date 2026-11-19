import { describe, expect, it } from "vitest";

import {
  formatBookingDate,
  formatBookingDateTime,
  formatBookingDayMonth,
  formatCalendarDate,
  formatMonth
} from "../lib/bookingDate";

// Fixed UTC instants: the expectations hold in every process time zone
// (TZ=UTC, Europe/Berlin, America/Los_Angeles). The day shown is the Berlin
// day — the day the booking is counted on.

/** 1 Nov 2026, 00:30 in Berlin (CET) — still 31 Oct in UTC and in Los Angeles. */
const JUST_AFTER_MIDNIGHT = "2026-10-31T23:30:00.000Z";
/** 9 Nov 2026, 14:05 in Berlin. */
const AFTERNOON = "2026-11-09T13:05:00.000Z";

describe("formatCalendarDate", () => {
  it("formats de as dd.MM.yyyy and en as MM/dd/yyyy", () => {
    expect(formatCalendarDate({ year: 2026, month: 11, day: 9 }, "de")).toBe("09.11.2026");
    expect(formatCalendarDate({ year: 2026, month: 11, day: 9 }, "en")).toBe("11/09/2026");
  });
});

describe("formatBookingDate", () => {
  it("shows the Berlin day, not the UTC or device day", () => {
    expect(formatBookingDate(JUST_AFTER_MIDNIGHT, "de")).toBe("01.11.2026");
    expect(formatBookingDate(JUST_AFTER_MIDNIGHT, "en")).toBe("11/01/2026");
  });

  it("shows the Berlin day late in the evening (already tomorrow further east)", () => {
    // 31 Dec 2026, 23:30 in Berlin.
    expect(formatBookingDate("2026-12-31T22:30:00.000Z", "de")).toBe("31.12.2026");
  });

  it("accepts a Date and returns an empty string for an invalid timestamp", () => {
    expect(formatBookingDate(new Date(AFTERNOON), "de")).toBe("09.11.2026");
    expect(formatBookingDate("not a date", "de")).toBe("");
  });
});

describe("formatBookingDateTime", () => {
  it("shows date and wall-clock time in Berlin (de: 24 h)", () => {
    expect(formatBookingDateTime(AFTERNOON, "de")).toBe("09.11.2026 14:05");
    expect(formatBookingDateTime(JUST_AFTER_MIDNIGHT, "de")).toBe("01.11.2026 00:30");
  });

  it("shows date and wall-clock time in Berlin (en: 12 h with AM/PM)", () => {
    expect(formatBookingDateTime(AFTERNOON, "en")).toBe("11/09/2026, 2:05 PM");
    expect(formatBookingDateTime(JUST_AFTER_MIDNIGHT, "en")).toBe("11/01/2026, 12:30 AM");
    // Noon Berlin — the time written for a booking dated to a calendar day.
    expect(formatBookingDateTime("2026-07-15T10:00:00.000Z", "en")).toBe("07/15/2026, 12:00 PM");
  });

  it("uses summer time in summer", () => {
    // 1 Aug 2026, 00:30 in Berlin (CEST, UTC+2).
    expect(formatBookingDateTime("2026-07-31T22:30:00.000Z", "de")).toBe("01.08.2026 00:30");
  });

  it("returns an empty string for an invalid timestamp", () => {
    expect(formatBookingDateTime("", "de")).toBe("");
  });
});

describe("formatBookingDayMonth", () => {
  it("shows day and month of the Berlin day", () => {
    expect(formatBookingDayMonth(JUST_AFTER_MIDNIGHT, "de-DE")).toBe("1. Nov.");
    expect(formatBookingDayMonth(JUST_AFTER_MIDNIGHT, "en-US")).toBe("Nov 1");
  });

  it("supports a long month and the year", () => {
    expect(formatBookingDayMonth(JUST_AFTER_MIDNIGHT, "de-DE", { month: "long" })).toBe("1. November");
    expect(formatBookingDayMonth(JUST_AFTER_MIDNIGHT, "de-DE", { month: "long", year: true })).toBe(
      "1. November 2026"
    );
    expect(formatBookingDayMonth(JUST_AFTER_MIDNIGHT, "en-US", { month: "long", year: true })).toBe(
      "November 1, 2026"
    );
  });

  it("returns an empty string for an invalid timestamp", () => {
    expect(formatBookingDayMonth("nope", "de-DE")).toBe("");
  });
});

describe("formatMonth", () => {
  it("names a month with its year by default", () => {
    expect(formatMonth({ year: 2026, month: 10 }, "de-DE")).toBe("Oktober 2026");
    expect(formatMonth({ year: 2026, month: 10 }, "en-US")).toBe("October 2026");
  });

  it("names the first and the last month of a year correctly in every process time zone", () => {
    expect(formatMonth({ year: 2026, month: 1 }, "de-DE")).toBe("Januar 2026");
    expect(formatMonth({ year: 2026, month: 12 }, "de-DE")).toBe("Dezember 2026");
  });

  it("supports the short form with and without the year", () => {
    expect(formatMonth({ year: 2026, month: 10 }, "en-US", { month: "short" })).toBe("Oct 2026");
    expect(formatMonth({ year: 2026, month: 10 }, "en-US", { month: "short", year: false })).toBe("Oct");
    expect(formatMonth({ year: 2026, month: 10 }, "de-DE", { month: "short", year: false })).toBe("Okt");
  });
});
