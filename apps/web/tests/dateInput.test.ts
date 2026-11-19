import { describe, expect, it } from "vitest";

import { dateInputToISO, firstDayOfCurrentMonth, toDateInputValue } from "../lib/dateInput";

// Alle Fixtures sind feste UTC-Zeitpunkte: die Erwartungen gelten in jeder
// Prozess-Zeitzone (TZ=UTC, Europe/Berlin, America/Los_Angeles). Der Kalendertag
// ist immer der Berliner Tag, nicht der des Geräts.

describe("toDateInputValue", () => {
  it("formats the Berlin calendar day as yyyy-mm-dd", () => {
    // 5 Aug 2026, 14:30 in Berlin (UTC+2).
    expect(toDateInputValue(new Date("2026-08-05T12:30:00.000Z"))).toBe("2026-08-05");
  });

  it("zero-pads month and day", () => {
    expect(toDateInputValue(new Date("2026-01-03T11:00:00.000Z"))).toBe("2026-01-03");
  });

  it("uses the Berlin day after midnight there, although UTC is still on the previous day", () => {
    // 1 Nov 2026, 00:30 in Berlin (UTC+1) = 31 Oct 23:30 UTC.
    expect(toDateInputValue(new Date("2026-10-31T23:30:00.000Z"))).toBe("2026-11-01");
    // 1 Aug 2026, 00:30 in Berlin (UTC+2) = 31 Jul 22:30 UTC.
    expect(toDateInputValue(new Date("2026-07-31T22:30:00.000Z"))).toBe("2026-08-01");
  });

  it("uses the Berlin day late in the evening there, although it is already tomorrow further east", () => {
    // 31 Dec 2026, 23:30 in Berlin = 22:30 UTC.
    expect(toDateInputValue(new Date("2026-12-31T22:30:00.000Z"))).toBe("2026-12-31");
  });

  it("round-trips through dateInputToISO for the same day", () => {
    const date = new Date("2026-03-09T07:15:00.000Z");
    const iso = dateInputToISO(toDateInputValue(date), date);
    expect(new Date(iso).getTime()).toBe(date.getTime());
  });
});

describe("dateInputToISO", () => {
  it("preserves the exact timestamp when the chosen day is unchanged", () => {
    // Edit ohne Datumsänderung / Create für heute → Original-Uhrzeit bleibt.
    const base = new Date("2026-08-05T12:30:00.000Z");
    expect(dateInputToISO("2026-08-05", base)).toBe(base.toISOString());
  });

  it("compares with the Berlin day of the reference, not its UTC day", () => {
    // 1 Nov 2026, 00:30 in Berlin; in UTC the reference is still 31 Oct.
    const base = new Date("2026-10-31T23:30:00.000Z");
    expect(dateInputToISO("2026-11-01", base)).toBe(base.toISOString());
    // Choosing 31 Oct is a different day → noon Berlin (CET, UTC+1) of 31 Oct.
    expect(dateInputToISO("2026-10-31", base)).toBe("2026-10-31T11:00:00.000Z");
  });

  it("writes noon in Berlin when the chosen day differs from the reference", () => {
    const base = new Date("2026-08-05T12:30:00.000Z");
    // Summer time (CEST, UTC+2).
    expect(dateInputToISO("2026-07-15", base)).toBe("2026-07-15T10:00:00.000Z");
    // Winter time (CET, UTC+1).
    expect(dateInputToISO("2026-01-15", base)).toBe("2026-01-15T11:00:00.000Z");
  });

  it("keeps the calendar day at a month boundary", () => {
    // Buchung auf den 1. eines Monats darf nicht auf den letzten Tag des Vormonats kippen.
    const julyReference = new Date("2026-07-31T21:00:00.000Z"); // 31 Jul, 23:00 in Berlin
    const iso = dateInputToISO("2026-08-01", julyReference);
    expect(iso).toBe("2026-08-01T10:00:00.000Z");
    expect(toDateInputValue(new Date(iso))).toBe("2026-08-01");
  });

  it("supports back-dating into a previous month", () => {
    const today = new Date("2026-09-10T07:00:00.000Z");
    const iso = dateInputToISO("2026-08-28", today);
    expect(toDateInputValue(new Date(iso))).toBe("2026-08-28");
  });

  it("is noon on the days the clocks change", () => {
    const base = new Date("2026-08-05T12:30:00.000Z");
    // 29 Mar 2026: CET → CEST at 02:00; noon is already UTC+2.
    expect(dateInputToISO("2026-03-29", base)).toBe("2026-03-29T10:00:00.000Z");
    // 25 Oct 2026: CEST → CET at 03:00; noon is already UTC+1.
    expect(dateInputToISO("2026-10-25", base)).toBe("2026-10-25T11:00:00.000Z");
  });
});

describe("firstDayOfCurrentMonth", () => {
  it("is the first day of the Berlin month of `now`", () => {
    expect(firstDayOfCurrentMonth(new Date("2026-11-19T10:00:00.000Z"))).toBe("2026-11-01");
  });

  it("is already the new month shortly after midnight in Berlin", () => {
    // 1 Nov 2026, 00:30 in Berlin = 31 Oct 23:30 UTC.
    expect(firstDayOfCurrentMonth(new Date("2026-10-31T23:30:00.000Z"))).toBe("2026-11-01");
    // 1 Jan 2027, 00:30 in Berlin = 31 Dec 2026 23:30 UTC.
    expect(firstDayOfCurrentMonth(new Date("2026-12-31T23:30:00.000Z"))).toBe("2027-01-01");
  });
});
