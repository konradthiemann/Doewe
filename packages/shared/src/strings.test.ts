import { describe, expect, it } from "vitest";

import { ensureNonEmpty } from "./strings";

describe("ensureNonEmpty", () => {
  it("returns a branded non-empty string when input has content", () => {
    const s = ensureNonEmpty("  hello ");
    expect(s).toBe("hello");
  });

  it("throws for empty or whitespace-only strings", () => {
    expect(() => ensureNonEmpty("")).toThrowError();
    expect(() => ensureNonEmpty("   ")).toThrowError();
  });
});