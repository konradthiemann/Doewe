import { describe, expect, it } from "vitest";

import { dateInputToISO, toDateInputValue } from "../lib/dateInput";

describe("toDateInputValue", () => {
  it("formats a local date as yyyy-mm-dd", () => {
    // Monate sind 0-basiert: 7 = August.
    expect(toDateInputValue(new Date(2026, 7, 5, 14, 30))).toBe("2026-08-05");
  });

  it("zero-pads month and day", () => {
    expect(toDateInputValue(new Date(2026, 0, 3))).toBe("2026-01-03");
  });

  it("round-trips through dateInputToISO for the same local day", () => {
    const date = new Date(2026, 2, 9, 8, 15);
    const iso = dateInputToISO(toDateInputValue(date), date);
    expect(new Date(iso).getTime()).toBe(date.getTime());
  });
});

describe("dateInputToISO", () => {
  it("preserves the exact timestamp when the chosen day is unchanged", () => {
    // Edit ohne Datumsänderung / Create für heute → Original-Uhrzeit bleibt.
    const base = new Date(2026, 7, 5, 14, 30, 0);
    expect(dateInputToISO("2026-08-05", base)).toBe(base.toISOString());
  });

  it("uses local noon when the chosen day differs from the reference", () => {
    const base = new Date(2026, 7, 5, 14, 30, 0);
    const result = new Date(dateInputToISO("2026-07-15", base));
    // In lokaler Zeit geprüft (TZ-unabhängig), da lokaler Mittag round-trippt.
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6); // Juli
    expect(result.getDate()).toBe(15);
    expect(result.getHours()).toBe(12);
  });

  it("keeps the calendar day at a month boundary (no timezone off-by-one)", () => {
    // Der eigentliche Zweck: Buchung auf den 1. eines Monats darf in lokaler
    // Anzeige nicht auf den letzten Tag des Vormonats kippen.
    const julyReference = new Date(2026, 6, 31, 23, 0, 0);
    const result = new Date(dateInputToISO("2026-08-01", julyReference));
    expect(result.getMonth()).toBe(7); // August, nicht Juli
    expect(result.getDate()).toBe(1);
  });

  it("supports back-dating into a previous month (the feature's core use case)", () => {
    const today = new Date(2026, 8, 10, 9, 0, 0); // 10. September
    const result = new Date(dateInputToISO("2026-08-28", today));
    expect(result.getMonth()).toBe(7); // August
    expect(result.getDate()).toBe(28);
  });
});
