import { describe, expect, it } from "vitest";

import { cascadeGoalProgress, goalPercent } from "../lib/savingGoalProgress";

describe("goalPercent", () => {
  it("is 100 only when the target is fully covered", () => {
    expect(goalPercent(100000, 100000)).toBe(100);
    expect(goalPercent(120000, 100000)).toBe(100);
    // 995.00 of 1,000.00 would round to 100 — it is not reached.
    expect(goalPercent(99500, 100000)).toBe(99);
    expect(goalPercent(99999, 100000)).toBe(99);
  });

  it("rounds commercially below that", () => {
    expect(goalPercent(50400, 100000)).toBe(50);
    expect(goalPercent(50500, 100000)).toBe(51);
    expect(goalPercent(0, 100000)).toBe(0);
    expect(goalPercent(1, 100000)).toBe(0);
  });

  it("counts a goal without a target as reached and never goes below 0", () => {
    expect(goalPercent(0, 0)).toBe(100);
    expect(goalPercent(-500, 100000)).toBe(0);
  });
});

describe("cascadeGoalProgress", () => {
  const goals = [
    { id: "a", amountCents: 100000 },
    { id: "b", amountCents: 50000 },
    { id: "c", amountCents: 20000 }
  ];

  it("fills the goals in order", () => {
    const result = cascadeGoalProgress(goals, 120000);
    expect(result.map((g) => [g.id, g.achievedCents, g.percent, g.status, g.cumulativeTargetCents])).toEqual([
      ["a", 100000, 100, "complete", 100000],
      ["b", 20000, 40, "current", 150000],
      ["c", 0, 0, "upcoming", 170000]
    ]);
  });

  it("does not mark a goal complete that is 5 euros short", () => {
    const [first, second] = cascadeGoalProgress(goals, 99500);
    expect(first).toMatchObject({ achievedCents: 99500, percent: 99, status: "current" });
    expect(second).toMatchObject({ achievedCents: 0, percent: 0, status: "upcoming" });
  });

  it("marks every goal complete when the savings cover all targets", () => {
    expect(cascadeGoalProgress(goals, 500000).every((g) => g.status === "complete" && g.percent === 100)).toBe(true);
  });

  it("treats a goal without an amount as complete and passes the savings on", () => {
    const result = cascadeGoalProgress(
      [
        { id: "idea", amountCents: null },
        { id: "b", amountCents: 50000 }
      ],
      10000
    );
    expect(result[0]).toMatchObject({ achievedCents: 0, percent: 100, status: "complete", cumulativeTargetCents: 0 });
    expect(result[1]).toMatchObject({ achievedCents: 10000, percent: 20, status: "current" });
  });

  it("keeps the goal's own fields and handles no savings", () => {
    const result = cascadeGoalProgress([{ id: "a", title: "Urlaub", amountCents: 100000 }], 0);
    expect(result).toEqual([
      { id: "a", title: "Urlaub", amountCents: 100000, achievedCents: 0, percent: 0, status: "upcoming", cumulativeTargetCents: 100000 }
    ]);
  });
});
