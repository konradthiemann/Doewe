import { describe, expect, it } from "vitest";

import { parseMonthKey } from "../lib/dateInput";
import {
  amountSearchForms,
  isRecurringDueIn,
  matchesSearch,
  monthPickerOptions,
  nextDueDate,
  recurringAnchorMonth,
  totalsBarParts,
  transactionsCsvFileName
} from "../lib/transactionList";

// Fixed UTC instants throughout: the expectations hold in every process time
// zone (TZ=UTC, Europe/Berlin, America/Los_Angeles).

describe("amountSearchForms", () => {
  it("contains the plain decimal form and the German forms with and without grouping", () => {
    expect(amountSearchForms(-123456, "de")).toEqual(["-1234.56", "-1234,56", "-1.234,56"]);
  });

  it("contains the English grouped form in the English UI", () => {
    expect(amountSearchForms(-123456, "en")).toEqual(["-1234.56", "-1,234.56"]);
  });

  it("pads the cents and has no grouping below 1,000", () => {
    expect(amountSearchForms(1250, "de")).toEqual(["12.50", "12,50"]);
    expect(amountSearchForms(-5, "de")).toEqual(["-0.05", "-0,05"]);
    expect(amountSearchForms(0, "en")).toEqual(["0.00"]);
  });

  it("groups millions", () => {
    expect(amountSearchForms(123456789, "de")).toContain("1.234.567,89");
    expect(amountSearchForms(123456789, "en")).toContain("1,234,567.89");
  });
});

describe("matchesSearch", () => {
  const fields = (amountCents: number) => ["REWE Markt", "Lebensmittel", ...amountSearchForms(amountCents, "de")];

  it("finds an amount typed the German way, with or without sign and grouping", () => {
    expect(matchesSearch(fields(-123456), "1.234,56")).toBe(true);
    expect(matchesSearch(fields(-123456), "1234,56")).toBe(true);
    expect(matchesSearch(fields(-123456), "-1234.56")).toBe(true);
    expect(matchesSearch(fields(-1250), "12,50")).toBe(true);
    expect(matchesSearch(fields(-1250), "12,51")).toBe(false);
  });

  it("matches description and category case-insensitively and ignores surrounding blanks", () => {
    expect(matchesSearch(fields(-1250), "  rewe ")).toBe(true);
    expect(matchesSearch(fields(-1250), "LEBENS")).toBe(true);
    expect(matchesSearch(fields(-1250), "miete")).toBe(false);
  });

  it("matches everything for an empty query and tolerates missing fields", () => {
    expect(matchesSearch([null, undefined], "")).toBe(true);
    expect(matchesSearch([null, undefined, "x"], "y")).toBe(false);
  });
});

describe("totalsBarParts", () => {
  const totals = (incomeCents: number, outcomeCents: number, savingsCents: number) => ({
    incomeCents,
    outcomeCents,
    savingsCents,
    netCents: incomeCents - outcomeCents - savingsCents
  });

  it("shows nothing but the figure itself when only one is non-zero", () => {
    expect(totalsBarParts(totals(0, 5000, 0))).toEqual({ income: false, outcome: true, savings: false, net: false });
    expect(totalsBarParts(totals(0, 0, 2000))).toEqual({ income: false, outcome: false, savings: true, net: false });
  });

  it("adds the net as soon as more than one figure is non-zero", () => {
    expect(totalsBarParts(totals(10000, 5000, 0))).toEqual({ income: true, outcome: true, savings: false, net: true });
    expect(totalsBarParts(totals(0, 5000, 2000))).toEqual({ income: false, outcome: true, savings: true, net: true });
    expect(totalsBarParts(totals(10000, 5000, 2000))).toEqual({ income: true, outcome: true, savings: true, net: true });
  });

  it("shows savings when withdrawals exceed deposits (negative net savings)", () => {
    expect(totalsBarParts(totals(0, 0, -3000)).savings).toBe(true);
  });

  it("shows nothing for an empty list", () => {
    expect(totalsBarParts(totals(0, 0, 0))).toEqual({ income: false, outcome: false, savings: false, net: false });
  });
});

describe("parseMonthKey", () => {
  it("parses yyyy-mm", () => {
    expect(parseMonthKey("2026-10")).toEqual({ year: 2026, month: 10 });
    expect(parseMonthKey("2026-01")).toEqual({ year: 2026, month: 1 });
  });

  it("rejects everything else", () => {
    expect(parseMonthKey("")).toBeNull();
    expect(parseMonthKey("custom")).toBeNull();
    expect(parseMonthKey("2026-13")).toBeNull();
    expect(parseMonthKey("2026-00")).toBeNull();
    expect(parseMonthKey("2026-1")).toBeNull();
    expect(parseMonthKey("2026-10-01")).toBeNull();
  });
});

describe("monthPickerOptions", () => {
  const months = [
    { year: 2026, month: 11 },
    { year: 2026, month: 9 }
  ];

  it("keeps the months with bookings, newest first", () => {
    expect(monthPickerOptions([...months].reverse(), null)).toEqual(months);
  });

  it("adds a selected month that has no bookings, in order", () => {
    expect(monthPickerOptions(months, { year: 2026, month: 10 })).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 10 },
      { year: 2026, month: 9 }
    ]);
    expect(monthPickerOptions(months, { year: 2027, month: 1 })[0]).toEqual({ year: 2027, month: 1 });
  });

  it("does not duplicate a selected month that has bookings", () => {
    expect(monthPickerOptions(months, { year: 2026, month: 9 })).toEqual(months);
  });
});

describe("recurringAnchorMonth / isRecurringDueIn", () => {
  it("takes the anchor month in Berlin, not in UTC or the device zone", () => {
    // 1 Nov 2026, 00:00 in Berlin — stored as 31 Oct 23:00 UTC.
    const schedule = { nextOccurrence: "2026-10-31T23:00:00.000Z", intervalMonths: 1, dayOfMonth: 1 };
    expect(recurringAnchorMonth(schedule)).toEqual({ year: 2026, month: 11 });
    expect(isRecurringDueIn(schedule, { year: 2026, month: 10 })).toBe(false);
    expect(isRecurringDueIn(schedule, { year: 2026, month: 11 })).toBe(true);
  });

  it("follows the interval from the anchor month across a year boundary", () => {
    const quarterly = { nextOccurrence: "2026-11-15T11:00:00.000Z", intervalMonths: 3, dayOfMonth: 15 };
    expect(isRecurringDueIn(quarterly, { year: 2026, month: 12 })).toBe(false);
    expect(isRecurringDueIn(quarterly, { year: 2027, month: 1 })).toBe(false);
    expect(isRecurringDueIn(quarterly, { year: 2027, month: 2 })).toBe(true);
    expect(isRecurringDueIn(quarterly, { year: 2027, month: 5 })).toBe(true);
  });

  it("is never due before the anchor month and treats a missing interval as monthly", () => {
    const schedule = { nextOccurrence: "2027-03-01T11:00:00.000Z" };
    expect(isRecurringDueIn(schedule, { year: 2027, month: 2 })).toBe(false);
    expect(isRecurringDueIn(schedule, { year: 2027, month: 3 })).toBe(true);
    expect(isRecurringDueIn({ ...schedule, intervalMonths: null }, { year: 2027, month: 4 })).toBe(true);
  });
});

describe("nextDueDate", () => {
  /** Monthly on the 15th, first occurrence 15 Jan 2026 (noon Berlin). */
  const monthly15 = { nextOccurrence: "2026-01-15T11:00:00.000Z", intervalMonths: 1, dayOfMonth: 15 };

  it("is this month's due day while it has not passed", () => {
    expect(nextDueDate(monthly15, { year: 2026, month: 11, day: 10 })).toEqual({ year: 2026, month: 11, day: 15 });
  });

  it("is today when today is the due day", () => {
    expect(nextDueDate(monthly15, { year: 2026, month: 11, day: 15 })).toEqual({ year: 2026, month: 11, day: 15 });
  });

  it("moves to the next month once the due day has passed — not back to the anchor", () => {
    expect(nextDueDate(monthly15, { year: 2026, month: 11, day: 19 })).toEqual({ year: 2026, month: 12, day: 15 });
  });

  it("rolls over the year", () => {
    expect(nextDueDate(monthly15, { year: 2026, month: 12, day: 20 })).toEqual({ year: 2027, month: 1, day: 15 });
  });

  it("is the anchor month when the first occurrence is still in the future", () => {
    const future = { nextOccurrence: "2027-03-01T11:00:00.000Z", intervalMonths: 1, dayOfMonth: 1 };
    expect(nextDueDate(future, { year: 2026, month: 11, day: 19 })).toEqual({ year: 2027, month: 3, day: 1 });
  });

  it("stays on the rhythm of the anchor for longer intervals", () => {
    /** Quarterly from 15 Jan 2026: Jan, Apr, Jul, Oct. */
    const quarterly = { ...monthly15, intervalMonths: 3 };
    expect(nextDueDate(quarterly, { year: 2026, month: 2, day: 1 })).toEqual({ year: 2026, month: 4, day: 15 });
    expect(nextDueDate(quarterly, { year: 2026, month: 10, day: 15 })).toEqual({ year: 2026, month: 10, day: 15 });
    expect(nextDueDate(quarterly, { year: 2026, month: 10, day: 16 })).toEqual({ year: 2027, month: 1, day: 15 });
    /** Yearly. */
    const yearly = { ...monthly15, intervalMonths: 12 };
    expect(nextDueDate(yearly, { year: 2026, month: 11, day: 19 })).toEqual({ year: 2027, month: 1, day: 15 });
  });

  it("clamps the due day to the length of the month", () => {
    const monthly31 = { nextOccurrence: "2026-01-31T11:00:00.000Z", intervalMonths: 1, dayOfMonth: 31 };
    expect(nextDueDate(monthly31, { year: 2026, month: 2, day: 1 })).toEqual({ year: 2026, month: 2, day: 28 });
    expect(nextDueDate(monthly31, { year: 2028, month: 2, day: 1 })).toEqual({ year: 2028, month: 2, day: 29 });
    // 28 Feb is the due day in a 28-day February: still due today.
    expect(nextDueDate(monthly31, { year: 2026, month: 2, day: 28 })).toEqual({ year: 2026, month: 2, day: 28 });
    expect(nextDueDate(monthly31, { year: 2026, month: 4, day: 30 })).toEqual({ year: 2026, month: 4, day: 30 });
  });

  it("reads the anchor month in Berlin", () => {
    // 1 Dec 2026, 00:00 in Berlin — 30 Nov 23:00 UTC. Not due in November.
    const schedule = { nextOccurrence: "2026-11-30T23:00:00.000Z", intervalMonths: 1, dayOfMonth: 1 };
    expect(nextDueDate(schedule, { year: 2026, month: 11, day: 19 })).toEqual({ year: 2026, month: 12, day: 1 });
  });

  it("treats a missing or invalid interval as monthly and a missing day as the 1st", () => {
    const bare = { nextOccurrence: "2026-01-15T11:00:00.000Z", intervalMonths: 0, dayOfMonth: null };
    expect(nextDueDate(bare, { year: 2026, month: 11, day: 19 })).toEqual({ year: 2026, month: 12, day: 1 });
  });
});

describe("transactionsCsvFileName", () => {
  it("names a range of exactly one month after the month", () => {
    expect(transactionsCsvFileName("buchungen", "2026-11-01", "2026-11-30")).toBe("buchungen-2026-11.csv");
  });

  it("names any other range after its days", () => {
    expect(transactionsCsvFileName("buchungen", "2026-11-01", "2026-11-22")).toBe("buchungen-2026-11-01_2026-11-22.csv");
    expect(transactionsCsvFileName("buchungen", "2026-11-01", null)).toBe("buchungen-2026-11-01.csv");
  });

  it("falls back to the base name without a range or with invalid days from the URL", () => {
    expect(transactionsCsvFileName("transactions", "", "")).toBe("transactions.csv");
    expect(transactionsCsvFileName("buchungen", "../../etc", "2026-02-30")).toBe("buchungen.csv");
  });
});
