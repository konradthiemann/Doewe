import { describe, expect, it } from "vitest";

import {
  buildRecurringYearMatrix,
  classifyRecurringKind,
  type RecurringYearItem
} from "./recurringYear";

const ZEROS = Array.from({ length: 12 }, () => 0);

function item(overrides: Partial<RecurringYearItem> & Pick<RecurringYearItem, "id">): RecurringYearItem {
  return {
    description: overrides.id,
    categoryId: null,
    categoryName: null,
    kind: "expense",
    amountCents: -1000,
    intervalMonths: 1,
    nextYear: 2025,
    nextMonth: 1,
    skippedMonths: [],
    ...overrides
  };
}

const allRows = (m: ReturnType<typeof buildRecurringYearMatrix>) => [
  ...m.income.rows,
  ...m.expenses.rows,
  ...m.savings.rows
];

describe("classifyRecurringKind", () => {
  it("classifies positive amounts as income", () => {
    expect(classifyRecurringKind(5000, false)).toBe("income");
  });
  it("classifies negative amounts as expense", () => {
    expect(classifyRecurringKind(-5000, false)).toBe("expense");
  });
  it("classifies zero as income", () => {
    expect(classifyRecurringKind(0, false)).toBe("income");
  });
  it("prefers savings over the sign", () => {
    expect(classifyRecurringKind(-5000, true)).toBe("savings");
    expect(classifyRecurringKind(5000, true)).toBe("savings");
    expect(classifyRecurringKind(0, true)).toBe("savings");
  });
});

describe("buildRecurringYearMatrix", () => {
  it("returns empty groups with 12 zero months for empty input", () => {
    const m = buildRecurringYearMatrix([], 2026);
    expect(m.year).toBe(2026);
    for (const g of [m.income, m.expenses, m.savings]) {
      expect(g.rows).toEqual([]);
      expect(g.monthlyTotalsCents).toEqual(ZEROS);
      expect(g.totalCents).toBe(0);
      expect(g.monthlyAverageCents).toBe(0);
    }
    expect(m.net.monthlyTotalsCents).toEqual(ZEROS);
    expect(m.net.totalCents).toBe(0);
    expect(m.net.monthlyAverageCents).toBe(0);
  });

  it("fills all 12 months for a monthly item anchored in January of the same year", () => {
    const m = buildRecurringYearMatrix([item({ id: "rent", amountCents: -80000, nextYear: 2026, nextMonth: 1 })], 2026);
    const row = m.expenses.rows[0];
    expect(row.monthlyCents).toEqual(Array.from({ length: 12 }, () => -80000));
    expect(row.totalCents).toBe(-960000);
    expect(row.intervalMonths).toBe(1);
    expect(row.amountCents).toBe(-80000);
  });

  it("fills only due months for a quarterly item anchored in February", () => {
    const m = buildRecurringYearMatrix(
      [item({ id: "ins", amountCents: -30000, intervalMonths: 3, nextYear: 2026, nextMonth: 2 })],
      2026
    );
    const row = m.expenses.rows[0];
    const expected = [...ZEROS];
    for (const month of [2, 5, 8, 11]) expected[month - 1] = -30000;
    expect(row.monthlyCents).toEqual(expected);
    expect(row.totalCents).toBe(-120000);
  });

  it("shows a yearly item anchored in March of the previous year only in March", () => {
    const m = buildRecurringYearMatrix(
      [item({ id: "tax", amountCents: -50000, intervalMonths: 12, nextYear: 2025, nextMonth: 3 })],
      2026
    );
    const expected = [...ZEROS];
    expected[2] = -50000;
    expect(m.expenses.rows[0].monthlyCents).toEqual(expected);
    expect(m.expenses.rows[0].totalCents).toBe(-50000);
  });

  it("keeps a row of 12 zeros when the anchor lies in the following year", () => {
    const m = buildRecurringYearMatrix([item({ id: "future", nextYear: 2027, nextMonth: 1 })], 2026);
    expect(m.expenses.rows).toHaveLength(1);
    expect(m.expenses.rows[0].monthlyCents).toEqual(ZEROS);
    expect(m.expenses.rows[0].totalCents).toBe(0);
  });

  it("leaves months before the anchor month at 0", () => {
    const m = buildRecurringYearMatrix([item({ id: "late", amountCents: -100, nextYear: 2026, nextMonth: 6 })], 2026);
    const row = m.expenses.rows[0];
    expect(row.monthlyCents.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(row.monthlyCents.slice(5)).toEqual(Array.from({ length: 7 }, () => -100));
    expect(row.totalCents).toBe(-700);
  });

  it("zeroes a skipped month and excludes it from the total", () => {
    const m = buildRecurringYearMatrix(
      [item({ id: "rent", amountCents: -1000, nextYear: 2026, nextMonth: 1, skippedMonths: [7] })],
      2026
    );
    const row = m.expenses.rows[0];
    expect(row.monthlyCents[6]).toBe(0);
    expect(row.monthlyCents.filter((c) => c !== 0)).toHaveLength(11);
    expect(row.totalCents).toBe(-11000);
  });

  it("groups items by kind and keeps input order within a group", () => {
    const m = buildRecurringYearMatrix(
      [
        item({ id: "e1", kind: "expense", amountCents: -100 }),
        item({ id: "i1", kind: "income", amountCents: 500 }),
        item({ id: "s1", kind: "savings", amountCents: -200 }),
        item({ id: "e2", kind: "expense", amountCents: -300 }),
        item({ id: "i2", kind: "income", amountCents: 700 })
      ],
      2026
    );
    expect(m.income.rows.map((r) => r.id)).toEqual(["i1", "i2"]);
    expect(m.expenses.rows.map((r) => r.id)).toEqual(["e1", "e2"]);
    expect(m.savings.rows.map((r) => r.id)).toEqual(["s1"]);
    expect(allRows(m)).toHaveLength(5);
  });

  it("carries id, description and category info into the row", () => {
    const m = buildRecurringYearMatrix(
      [item({ id: "x", description: "Gehalt", categoryId: "c1", categoryName: "Job", kind: "income", amountCents: 100 })],
      2026
    );
    expect(m.income.rows[0]).toMatchObject({
      id: "x",
      description: "Gehalt",
      categoryId: "c1",
      categoryName: "Job",
      kind: "income",
      amountCents: 100
    });
  });

  it("computes group sums, total and rounded monthly average", () => {
    const m = buildRecurringYearMatrix(
      [
        item({ id: "a", amountCents: -1000, nextYear: 2026, nextMonth: 1 }),
        item({ id: "b", amountCents: -500, intervalMonths: 12, nextYear: 2026, nextMonth: 4 })
      ],
      2026
    );
    const expectedMonths = Array.from({ length: 12 }, () => -1000);
    expectedMonths[3] = -1500;
    expect(m.expenses.monthlyTotalsCents).toEqual(expectedMonths);
    expect(m.expenses.totalCents).toBe(-12500);
    expect(m.expenses.monthlyAverageCents).toBe(Math.round(-12500 / 12));
  });

  it("rounds the monthly average to whole cents", () => {
    const m = buildRecurringYearMatrix(
      [item({ id: "y", amountCents: 1000, kind: "income", intervalMonths: 12, nextYear: 2026, nextMonth: 5 })],
      2026
    );
    expect(m.income.totalCents).toBe(1000);
    expect(m.income.monthlyAverageCents).toBe(83); // 1000 / 12 = 83.33
  });

  it("computes net as the signed sum across all groups per month", () => {
    const m = buildRecurringYearMatrix(
      [
        item({ id: "salary", kind: "income", amountCents: 300000, nextYear: 2026, nextMonth: 1 }),
        item({ id: "rent", kind: "expense", amountCents: -80000, nextYear: 2026, nextMonth: 1 }),
        item({ id: "etf", kind: "savings", amountCents: -20000, nextYear: 2026, nextMonth: 1 })
      ],
      2026
    );
    expect(m.net.monthlyTotalsCents).toEqual(Array.from({ length: 12 }, () => 200000));
    expect(m.net.totalCents).toBe(2400000);
    expect(m.net.monthlyAverageCents).toBe(200000);
  });
});
