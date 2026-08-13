import { describe, expect, it } from "vitest";

import {
  detectFieldConflicts,
  isConcurrentChange,
  mergeFields,
  updateBlockedByDelete,
  valuesEqual
} from "./sync";

describe("valuesEqual", () => {
  it.each([
    [1, 1, true],
    ["a", "a", true],
    [null, undefined, true],
    [null, null, true],
    [0, "0", false],
    ["2026-01-01", "2026-01-02", false],
    [true, false, false]
  ])("valuesEqual(%o, %o) === %s", (a, b, expected) => {
    expect(valuesEqual(a, b)).toBe(expected);
  });
});

describe("mergeFields — LWW per field", () => {
  it("patch overrides only its own fields, keeps the rest from the server", () => {
    const server = { description: "Rewe", amountCents: -1000, categoryId: "c1" };
    const patch = { amountCents: -1500 };
    expect(mergeFields(server, patch)).toEqual({
      description: "Rewe",
      amountCents: -1500,
      categoryId: "c1"
    });
  });

  it("two devices patching different fields both survive when applied in order", () => {
    const server = { description: "Rewe", amountCents: -1000 };
    // device A syncs first (description), device B second (amount)
    const afterA = mergeFields(server, { description: "Rewe Süd" });
    const afterB = mergeFields(afterA, { amountCents: -1500 });
    expect(afterB).toEqual({ description: "Rewe Süd", amountCents: -1500 });
  });
});

describe("isConcurrentChange", () => {
  it("no base (fresh create) is never concurrent", () => {
    expect(isConcurrentChange(null, 100)).toBe(false);
    expect(isConcurrentChange(undefined, 100)).toBe(false);
  });

  it("server unchanged since base → not concurrent", () => {
    expect(isConcurrentChange(100, 100)).toBe(false);
  });

  it("server moved on after base → concurrent", () => {
    expect(isConcurrentChange(100, 101)).toBe(true);
  });
});

describe("detectFieldConflicts", () => {
  it("returns [] when the server has not changed since base (no lost edit)", () => {
    const conflicts = detectFieldConflicts(
      { amountCents: -1000 },
      { amountCents: -1500 },
      100,
      100
    );
    expect(conflicts).toEqual([]);
  });

  it("flags a same-field overwrite under concurrent change (LWW loser journaled)", () => {
    const conflicts = detectFieldConflicts(
      { amountCents: -1200 }, // other device already changed it
      { amountCents: -1500 }, // this device overwrites
      100, // base
      200 // server moved on
    );
    expect(conflicts).toEqual([
      { field: "amountCents", serverValue: -1200, clientValue: -1500 }
    ]);
  });

  it("different fields under concurrent change do not conflict (values match)", () => {
    // server changed 'description' concurrently; this patch only touches amount,
    // and amount still equals what the client based on → no conflict
    const conflicts = detectFieldConflicts(
      { description: "Other", amountCents: -1000 },
      { amountCents: -1000 },
      100,
      200
    );
    expect(conflicts).toEqual([]);
  });
});

describe("updateBlockedByDelete — delete wins", () => {
  it("blocks an update when the server row is tombstoned", () => {
    expect(updateBlockedByDelete(1720000000000)).toBe(true);
  });

  it("allows an update on a live row", () => {
    expect(updateBlockedByDelete(null)).toBe(false);
    expect(updateBlockedByDelete(undefined)).toBe(false);
  });
});
