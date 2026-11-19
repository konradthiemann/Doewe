import { describe, expect, it } from "vitest";

import {
  filterTransactions,
  listTotals,
  monthDayRange,
  monthOfDayRange,
  monthsWithTransactions
} from "./transactionFilter";

const SAVINGS = new Set(["cat-savings"]);

// October 2026 in Europe/Berlin runs from 2026-09-30T22:00Z (CEST) to
// 2026-10-31T23:00Z (CET, clocks went back on 25 Oct).
const rows = [
  { id: "sep-last-second", amountCents: -100, categoryId: "cat-food", occurredAt: "2026-09-30T21:59:59.000Z" },
  { id: "oct-first-minute", amountCents: -900, categoryId: "cat-food", occurredAt: "2026-09-30T22:00:30.000Z" },
  { id: "oct-salary", amountCents: 300_000, categoryId: "cat-salary", occurredAt: "2026-10-01T10:00:00.000Z" },
  { id: "oct-deposit", amountCents: -20_000, categoryId: "cat-savings", occurredAt: "2026-10-15T10:00:00.000Z" },
  { id: "oct-withdrawal", amountCents: 5_000, categoryId: "cat-savings", occurredAt: "2026-10-20T10:00:00.000Z" },
  { id: "oct-refund", amountCents: 2_000, categoryId: "cat-food", occurredAt: "2026-10-21T10:00:00.000Z" },
  { id: "oct-last-day-utc-midnight", amountCents: -80_000, categoryId: "cat-rent", occurredAt: "2026-10-31T00:00:00.000Z" },
  { id: "oct-last-day-noon", amountCents: -4_999, categoryId: null, occurredAt: "2026-10-31T11:00:00.000Z" },
  { id: "oct-last-day-evening", amountCents: -1_250, categoryId: "cat-food", occurredAt: "2026-10-31T22:45:00.000Z" },
  { id: "nov-first-minute", amountCents: -1_200, categoryId: "cat-food", occurredAt: "2026-10-31T23:00:30.000Z" }
];

const ids = (list: Array<{ id: string }>) => list.map((row) => row.id);
const october = { fromDay: "2026-10-01", toDay: "2026-10-31" };

describe("filterTransactions — date range", () => {
  it("includes the whole last day of the range", () => {
    const result = ids(filterTransactions(rows, october, SAVINGS));
    expect(result).toContain("oct-last-day-utc-midnight");
    expect(result).toContain("oct-last-day-noon");
    expect(result).toContain("oct-last-day-evening");
  });

  it("cuts the month at Berlin midnight, not UTC midnight", () => {
    const result = ids(filterTransactions(rows, october, SAVINGS));
    expect(result).toContain("oct-first-minute");
    expect(result).not.toContain("sep-last-second");
    expect(result).not.toContain("nov-first-minute");
    expect(result).toHaveLength(8);
  });

  it("returns that day's rows when from and to are the same day", () => {
    const result = ids(filterTransactions(rows, { fromDay: "2026-10-31", toDay: "2026-10-31" }, SAVINGS));
    expect(result).toEqual(["oct-last-day-utc-midnight", "oct-last-day-noon", "oct-last-day-evening"]);
  });

  it("supports open ranges", () => {
    expect(ids(filterTransactions(rows, { fromDay: "2026-11-01" }, SAVINGS))).toEqual(["nov-first-minute"]);
    expect(ids(filterTransactions(rows, { toDay: "2026-09-30" }, SAVINGS))).toEqual(["sep-last-second"]);
  });

  it("ignores a day that is not a valid date instead of emptying the list", () => {
    expect(filterTransactions(rows, { fromDay: "2026-1", toDay: "" }, SAVINGS)).toHaveLength(rows.length);
  });

  it("accepts Date objects as occurredAt", () => {
    const asDates = rows.map((row) => ({ ...row, occurredAt: new Date(row.occurredAt) }));
    expect(filterTransactions(asDates, october, SAVINGS)).toHaveLength(8);
  });
});

describe("filterTransactions — type and category", () => {
  it("keeps savings rows out of income and outcome", () => {
    expect(ids(filterTransactions(rows, { ...october, type: "outcome" }, SAVINGS))).toEqual([
      "oct-first-minute",
      "oct-last-day-utc-midnight",
      "oct-last-day-noon",
      "oct-last-day-evening"
    ]);
    expect(ids(filterTransactions(rows, { ...october, type: "income" }, SAVINGS))).toEqual([
      "oct-salary",
      "oct-refund"
    ]);
    expect(ids(filterTransactions(rows, { ...october, type: "savings" }, SAVINGS))).toEqual([
      "oct-deposit",
      "oct-withdrawal"
    ]);
  });

  it("partitions the list: income + outcome + savings = all", () => {
    const count = (type: "income" | "outcome" | "savings") =>
      filterTransactions(rows, { type }, SAVINGS).length;
    expect(count("income") + count("outcome") + count("savings")).toBe(rows.length);
  });

  it("combines category with type", () => {
    expect(ids(filterTransactions(rows, { ...october, type: "outcome", categoryId: "cat-food" }, SAVINGS))).toEqual([
      "oct-first-minute",
      "oct-last-day-evening"
    ]);
    expect(ids(filterTransactions(rows, { ...october, type: "income", categoryId: "cat-food" }, SAVINGS))).toEqual([
      "oct-refund"
    ]);
  });
});

describe("listTotals", () => {
  it("totals a month the way the review does", () => {
    const month = filterTransactions(rows, october, SAVINGS);
    expect(listTotals(month, SAVINGS)).toEqual({
      count: 8,
      incomeCents: 302_000,
      outcomeCents: 87_149,
      savingsCents: 15_000,
      netCents: 199_851
    });
  });

  it("gives the same outcome whether or not the type filter is set", () => {
    const all = listTotals(filterTransactions(rows, october, SAVINGS), SAVINGS);
    const onlyOutcome = listTotals(filterTransactions(rows, { ...october, type: "outcome" }, SAVINGS), SAVINGS);
    expect(onlyOutcome.outcomeCents).toBe(all.outcomeCents);
    expect(onlyOutcome.incomeCents).toBe(0);
    expect(onlyOutcome.savingsCents).toBe(0);
  });
});

describe("month helpers", () => {
  it("builds the day range of a month, including leap February", () => {
    expect(monthDayRange({ year: 2026, month: 10 })).toEqual({ fromDay: "2026-10-01", toDay: "2026-10-31" });
    expect(monthDayRange({ year: 2028, month: 2 })).toEqual({ fromDay: "2028-02-01", toDay: "2028-02-29" });
  });

  it("recognises a range that spans exactly one month", () => {
    expect(monthOfDayRange("2026-10-01", "2026-10-31")).toEqual({ year: 2026, month: 10 });
    expect(monthOfDayRange("2026-10-01", "2026-10-30")).toBeNull();
    expect(monthOfDayRange("2026-10-02", "2026-10-31")).toBeNull();
    expect(monthOfDayRange("2026-10-01", "2026-11-30")).toBeNull();
    expect(monthOfDayRange("2026-10-01", "")).toBeNull();
  });

  it("lists the months that have rows, newest first, in Berlin time", () => {
    expect(monthsWithTransactions(rows)).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 10 },
      { year: 2026, month: 9 }
    ]);
  });
});
