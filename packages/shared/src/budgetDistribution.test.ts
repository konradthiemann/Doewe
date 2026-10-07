import { describe, expect, it } from "vitest";

import {
  BUDGET_PERIODS,
  distributeYearlyBudget,
  planMonthlyCents,
  resolveEffectiveBudgets
} from "./budgetDistribution";

const flat = (value: number) => Array.from({ length: 12 }, () => value);
const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

describe("BUDGET_PERIODS", () => {
  it("lists MONTHLY and YEARLY", () => {
    expect([...BUDGET_PERIODS]).toEqual(["MONTHLY", "YEARLY"]);
  });
});

describe("distributeYearlyBudget", () => {
  it("spreads evenly over equal months", () => {
    expect(distributeYearlyBudget(1200, flat(100))).toEqual(flat(100));
  });

  it("weights by available amount per month", () => {
    expect(distributeYearlyBudget(1400, [300, ...flat(100).slice(1)])).toEqual([300, ...flat(100).slice(1)]);
  });

  it("gives months with negative or zero availability nothing", () => {
    const available = [-500, 0, ...flat(100).slice(2)];
    expect(distributeYearlyBudget(1000, available)).toEqual([0, 0, ...flat(100).slice(2)]);
  });

  it("falls back to equal weights when nothing is available", () => {
    expect(distributeYearlyBudget(1200, flat(-1))).toEqual(flat(100));
  });

  it("puts the remainder on the first month in the equal-weight fallback", () => {
    expect(distributeYearlyBudget(1205, flat(-1))).toEqual([105, ...flat(100).slice(1)]);
  });

  it("puts the whole remainder on the month with the largest weight", () => {
    expect(distributeYearlyBudget(100, [1, 2, ...flat(0).slice(2)])).toEqual([33, 67, ...flat(0).slice(2)]);
  });

  it("breaks weight ties by the smallest month index", () => {
    expect(distributeYearlyBudget(100, [1, 1, 1, ...flat(0).slice(3)])).toEqual([34, 33, 33, ...flat(0).slice(3)]);
  });

  it("returns twelve zeros for a yearly amount of 0", () => {
    expect(distributeYearlyBudget(0, [10, 20, ...flat(5).slice(2)])).toEqual(flat(0));
  });

  it("always sums exactly to the yearly amount with non-negative months", () => {
    const available = [1234, -50, 0, 777, 31, 4096, 5, 5, 999, -3, 12, 8001];
    for (const yearly of [1, 7, 99, 1000, 123457, 1_000_000_000]) {
      const result = distributeYearlyBudget(yearly, available);
      expect(result).toHaveLength(12);
      expect(sum(result)).toBe(yearly);
      expect(result.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
    }
  });

  it("rejects a vector that is not 12 long", () => {
    expect(() => distributeYearlyBudget(1200, flat(100).slice(0, 11))).toThrow(RangeError);
    expect(() => distributeYearlyBudget(1200, [...flat(100), 1])).toThrow(RangeError);
  });

  it("rejects negative or non-integer yearly amounts", () => {
    expect(() => distributeYearlyBudget(-1, flat(100))).toThrow(RangeError);
    expect(() => distributeYearlyBudget(1.5, flat(100))).toThrow(RangeError);
  });
});

describe("planMonthlyCents", () => {
  it("repeats a MONTHLY amount for every month", () => {
    expect(planMonthlyCents({ period: "MONTHLY", amountCents: 250 }, [1, 2, ...flat(0).slice(2)])).toEqual(flat(250));
  });

  it("distributes a YEARLY amount by availability", () => {
    expect(planMonthlyCents({ period: "YEARLY", amountCents: 100 }, [1, 2, ...flat(0).slice(2)])).toEqual([
      33,
      67,
      ...flat(0).slice(2)
    ]);
  });
});

describe("resolveEffectiveBudgets", () => {
  const available = [1, 2, ...flat(0).slice(2)];

  it("resolves a MONTHLY plan to its amount", () => {
    const result = resolveEffectiveBudgets({
      plans: [{ categoryId: "c1", period: "MONTHLY", amountCents: 500 }],
      overrides: {},
      month: 7,
      availablePerMonth: available
    });
    expect(result).toEqual({ c1: 500 });
  });

  it("resolves a YEARLY plan to the share of the requested month (month 2 = index 1)", () => {
    const plans = [{ categoryId: "c1", period: "YEARLY" as const, amountCents: 100 }];
    expect(resolveEffectiveBudgets({ plans, overrides: {}, month: 1, availablePerMonth: available })).toEqual({ c1: 33 });
    expect(resolveEffectiveBudgets({ plans, overrides: {}, month: 2, availablePerMonth: available })).toEqual({ c1: 67 });
    expect(resolveEffectiveBudgets({ plans, overrides: {}, month: 12, availablePerMonth: available })).toEqual({ c1: 0 });
  });

  it("lets an override beat the plan", () => {
    const result = resolveEffectiveBudgets({
      plans: [{ categoryId: "c1", period: "MONTHLY", amountCents: 500 }],
      overrides: { c1: 900 },
      month: 3,
      availablePerMonth: available
    });
    expect(result).toEqual({ c1: 900 });
  });

  it("adds an override for a category without a plan", () => {
    const result = resolveEffectiveBudgets({
      plans: [{ categoryId: "c1", period: "MONTHLY", amountCents: 500 }],
      overrides: { c2: 300 },
      month: 3,
      availablePerMonth: available
    });
    expect(result).toEqual({ c1: 500, c2: 300 });
  });

  it("omits categories with neither plan nor override", () => {
    const result = resolveEffectiveBudgets({ plans: [], overrides: {}, month: 1, availablePerMonth: available });
    expect(result).toEqual({});
    expect(result).not.toHaveProperty("c1");
  });
});
