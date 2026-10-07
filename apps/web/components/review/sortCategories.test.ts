import { describe, expect, it } from "vitest";

import { DEFAULT_SORT_DIRECTION, sortCategories, type CategorySortKey } from "./sortCategories";

type Row = { name: string; spentCents: number; budgetCents: number | null };

const row = (name: string, spentCents: number, budgetCents: number | null = null): Row => ({
  name,
  spentCents,
  budgetCents
});
const names = (rows: readonly Row[]) => rows.map((r) => r.name);

describe("DEFAULT_SORT_DIRECTION", () => {
  it("is asc for name and desc for every other key", () => {
    const keys: CategorySortKey[] = ["name", "distribution", "spent", "budget", "status"];
    expect(DEFAULT_SORT_DIRECTION.name).toBe("asc");
    for (const k of keys.filter((k) => k !== "name")) expect(DEFAULT_SORT_DIRECTION[k]).toBe("desc");
  });
});

describe("sortCategories - name", () => {
  const input = [row("Zebra", 1), row("Ärzte", 2), row("apfel", 3), row("Auto", 4)];

  it("sorts A-Z case-insensitively with German umlaut rules (Ä sorts as A: Ärzte before Auto)", () => {
    expect(names(sortCategories(input, "name", "asc"))).toEqual(["apfel", "Ärzte", "Auto", "Zebra"]);
  });

  it("reverses for desc", () => {
    expect(names(sortCategories(input, "name", "desc"))).toEqual(["Zebra", "Auto", "Ärzte", "apfel"]);
  });
});

describe("sortCategories - spent", () => {
  const input = [row("a", 200), row("b", 900), row("c", 50)];

  it("desc puts the largest first", () => {
    expect(names(sortCategories(input, "spent", "desc"))).toEqual(["b", "a", "c"]);
  });

  it("asc puts the smallest first", () => {
    expect(names(sortCategories(input, "spent", "asc"))).toEqual(["c", "a", "b"]);
  });
});

describe("sortCategories - distribution (categories without budget: ordered by spent)", () => {
  const input = [row("a", 200), row("b", 900), row("c", 50)];

  it("desc puts the largest share first", () => {
    expect(names(sortCategories(input, "distribution", "desc"))).toEqual(["b", "a", "c"]);
  });

  it("asc puts the smallest share first", () => {
    expect(names(sortCategories(input, "distribution", "asc"))).toEqual(["c", "a", "b"]);
  });
});

describe("sortCategories - budget", () => {
  const input = [row("a", 0, 300), row("nob1", 0, null), row("b", 0, 900), row("nob2", 0, null), row("c", 0, 100)];

  it("desc: largest budget first, categories without budget last", () => {
    expect(names(sortCategories(input, "budget", "desc"))).toEqual(["b", "a", "c", "nob1", "nob2"]);
  });

  it("asc: smallest budget first, categories without budget STILL last", () => {
    expect(names(sortCategories(input, "budget", "asc"))).toEqual(["c", "a", "b", "nob1", "nob2"]);
  });
});

describe("sortCategories - status (spent minus budget, positive = over budget)", () => {
  // diffs: over=+500, near=-100, under=-800
  const input = [row("near", 900, 1000), row("nob", 7000, null), row("over", 1500, 1000), row("under", 200, 1000)];

  it("desc: most over budget first, null budget last", () => {
    expect(names(sortCategories(input, "status", "desc"))).toEqual(["over", "near", "under", "nob"]);
  });

  it("asc: most under budget first, null budget STILL last", () => {
    expect(names(sortCategories(input, "status", "asc"))).toEqual(["under", "near", "over", "nob"]);
  });
});

describe("sortCategories - stability and immutability", () => {
  it("keeps input order for ties in both directions", () => {
    const input = [row("first", 100), row("second", 100), row("third", 100), row("big", 500)];
    expect(names(sortCategories(input, "spent", "desc"))).toEqual(["big", "first", "second", "third"]);
    expect(names(sortCategories(input, "spent", "asc"))).toEqual(["first", "second", "third", "big"]);
  });

  it("keeps input order for tied budgets and tied null budgets", () => {
    const input = [row("n1", 0, null), row("x", 0, 100), row("n2", 0, null), row("y", 0, 100)];
    expect(names(sortCategories(input, "budget", "asc"))).toEqual(["x", "y", "n1", "n2"]);
    expect(names(sortCategories(input, "budget", "desc"))).toEqual(["x", "y", "n1", "n2"]);
  });

  it("returns a new array and leaves the input untouched", () => {
    const input = [row("b", 1), row("a", 2)];
    const snapshot = [...input];
    const result = sortCategories(input, "name", "asc");
    expect(result).not.toBe(input);
    expect(input).toEqual(snapshot);
    expect(input[0]).toBe(snapshot[0]);
  });

  it("preserves extra properties of the generic element type", () => {
    const input = [{ ...row("a", 1), id: "x1" }, { ...row("b", 2), id: "x2" }];
    expect(sortCategories(input, "spent", "desc").map((r) => r.id)).toEqual(["x2", "x1"]);
  });

  it("handles an empty list", () => {
    expect(sortCategories([], "spent", "desc")).toEqual([]);
  });
});
