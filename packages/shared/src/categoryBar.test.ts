import { describe, expect, it } from "vitest";

import { computeCategoryBar } from "./categoryBar";

describe("computeCategoryBar", () => {
  describe("share mode (no budget)", () => {
    it("uses the share of total outcome as ratio", () => {
      const bar = computeCategoryBar({ spentCents: 2500, budgetCents: null, totalOutcomeCents: 10000 });
      expect(bar.mode).toBe("share");
      expect(bar.fillRatio).toBeCloseTo(0.25);
      expect(bar.percent).toBe(25);
      expect(bar.over).toBe(false);
      expect(bar.overByCents).toBe(0);
      expect(bar.remainingCents).toBe(0);
    });

    it("gives two categories different values; the largest is not automatically full", () => {
      const a = computeCategoryBar({ spentCents: 6000, budgetCents: null, totalOutcomeCents: 10000 });
      const b = computeCategoryBar({ spentCents: 4000, budgetCents: null, totalOutcomeCents: 10000 });
      expect(a.fillRatio).toBeCloseTo(0.6);
      expect(a.percent).toBe(60);
      expect(b.fillRatio).toBeCloseTo(0.4);
      expect(b.percent).toBe(40);
    });

    it("returns 0 / 0 when total outcome is 0", () => {
      const bar = computeCategoryBar({ spentCents: 0, budgetCents: null, totalOutcomeCents: 0 });
      expect(bar.mode).toBe("share");
      expect(bar.fillRatio).toBe(0);
      expect(bar.percent).toBe(0);
    });
  });

  describe("budget mode", () => {
    it("under budget: fill 0.8, 80 %, remaining 2000, not over", () => {
      const bar = computeCategoryBar({ spentCents: 8000, budgetCents: 10000, totalOutcomeCents: 50000 });
      expect(bar.mode).toBe("budget");
      expect(bar.fillRatio).toBeCloseTo(0.8);
      expect(bar.percent).toBe(80);
      expect(bar.remainingCents).toBe(2000);
      expect(bar.over).toBe(false);
      expect(bar.overByCents).toBe(0);
    });

    it("over budget: fill capped at 1, percent uncapped (130), overBy 3000", () => {
      const bar = computeCategoryBar({ spentCents: 13000, budgetCents: 10000, totalOutcomeCents: 50000 });
      expect(bar.mode).toBe("budget");
      expect(bar.fillRatio).toBe(1);
      expect(bar.percent).toBe(130);
      expect(bar.over).toBe(true);
      expect(bar.overByCents).toBe(3000);
      expect(bar.remainingCents).toBe(0);
    });

    it("exactly on budget: 100 %, not over", () => {
      const bar = computeCategoryBar({ spentCents: 10000, budgetCents: 10000, totalOutcomeCents: 50000 });
      expect(bar.fillRatio).toBe(1);
      expect(bar.percent).toBe(100);
      expect(bar.over).toBe(false);
      expect(bar.overByCents).toBe(0);
      expect(bar.remainingCents).toBe(0);
    });
  });

  describe("zero budget", () => {
    it("spent > 0: full bar, 100 %, over by spent", () => {
      const bar = computeCategoryBar({ spentCents: 500, budgetCents: 0, totalOutcomeCents: 5000 });
      expect(bar.mode).toBe("budget");
      expect(bar.fillRatio).toBe(1);
      expect(bar.percent).toBe(100);
      expect(bar.over).toBe(true);
      expect(bar.overByCents).toBe(500);
    });

    it("spent 0: empty bar, 0 %, not over", () => {
      const bar = computeCategoryBar({ spentCents: 0, budgetCents: 0, totalOutcomeCents: 5000 });
      expect(bar.mode).toBe("budget");
      expect(bar.fillRatio).toBe(0);
      expect(bar.percent).toBe(0);
      expect(bar.over).toBe(false);
      expect(bar.overByCents).toBe(0);
    });
  });
});
