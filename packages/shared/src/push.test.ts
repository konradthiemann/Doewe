import { describe, expect, it } from "vitest";

import {
  BUDGET_ALERT_THRESHOLDS,
  budgetPercent,
  isReminderDue,
  isReminderWeekday,
  parseTimeToMinutes,
  reachedBudgetThresholds
} from "./push";

describe("budgetPercent", () => {
  it("computes percent from cents", () => {
    expect(budgetPercent(9000, 10000)).toBe(90);
    expect(budgetPercent(10000, 10000)).toBe(100);
    expect(budgetPercent(12000, 10000)).toBe(120);
  });

  it("returns 0 for a zero or negative budget", () => {
    expect(budgetPercent(500, 0)).toBe(0);
    expect(budgetPercent(500, -100)).toBe(0);
  });
});

describe("reachedBudgetThresholds", () => {
  it.each([
    [7900, 10000, []],
    [8000, 10000, [80]],
    [9500, 10000, [80]],
    [10000, 10000, [80, 100]],
    [15000, 10000, [80, 100]]
  ])("spent %i / budget %i → %j", (spent, budget, expected) => {
    expect(reachedBudgetThresholds(spent, budget)).toEqual(expected);
  });

  it("uses the shared default thresholds", () => {
    expect(BUDGET_ALERT_THRESHOLDS).toEqual([80, 100]);
  });

  it("never warns on a zero budget", () => {
    expect(reachedBudgetThresholds(5000, 0)).toEqual([]);
  });
});

describe("isReminderWeekday", () => {
  it("reads the bitmask (bit 0 = Sunday … bit 6 = Saturday)", () => {
    expect(isReminderWeekday(127, 0)).toBe(true); // all days
    expect(isReminderWeekday(127, 6)).toBe(true);
    expect(isReminderWeekday(0, 3)).toBe(false); // no days
    // Weekdays only: Mon(1)..Fri(5) = 0b0111110 = 62
    expect(isReminderWeekday(62, 1)).toBe(true);
    expect(isReminderWeekday(62, 0)).toBe(false); // Sunday off
    expect(isReminderWeekday(62, 6)).toBe(false); // Saturday off
  });

  it("rejects out-of-range weekdays", () => {
    expect(isReminderWeekday(127, -1)).toBe(false);
    expect(isReminderWeekday(127, 7)).toBe(false);
  });
});

describe("parseTimeToMinutes", () => {
  it("parses valid HH:MM", () => {
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("20:00")).toBe(1200);
    expect(parseTimeToMinutes("23:59")).toBe(1439);
  });

  it("rejects malformed input", () => {
    expect(parseTimeToMinutes("24:00")).toBeNull();
    expect(parseTimeToMinutes("8:00")).toBeNull();
    expect(parseTimeToMinutes("20:60")).toBeNull();
    expect(parseTimeToMinutes("abc")).toBeNull();
  });
});

describe("isReminderDue", () => {
  it("fires inside the window and not outside", () => {
    const targetMinutes = 1200; // 20:00
    const windowMinutes = 15;
    expect(isReminderDue({ targetMinutes, localMinutes: 1200, windowMinutes })).toBe(true);
    expect(isReminderDue({ targetMinutes, localMinutes: 1214, windowMinutes })).toBe(true);
    // right edge is exclusive so neighbouring cron runs don't double-send
    expect(isReminderDue({ targetMinutes, localMinutes: 1215, windowMinutes })).toBe(false);
    expect(isReminderDue({ targetMinutes, localMinutes: 1199, windowMinutes })).toBe(false);
  });
});
