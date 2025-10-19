import { describe, it, expect } from "vitest";

import { add, fromCents, multiply, parseCents, sub, toDecimalString } from "./money";

describe("money", () => {
  it("parses valid strings to cents", () => {
    expect(parseCents("0")).toBe(0);
    expect(parseCents("1")).toBe(100);
    expect(parseCents("1.2")).toBe(120);
    expect(parseCents("1,23")).toBe(123);
    expect(parseCents("-5.05")).toBe(-505);
  });

  it("formats cents to decimal string", () => {
    expect(toDecimalString(fromCents(0))).toBe("0.00");
    expect(toDecimalString(fromCents(7))).toBe("0.07");
    expect(toDecimalString(fromCents(123))).toBe("1.23");
    expect(toDecimalString(fromCents(-123))).toBe("-1.23");
  });

  it("adds/subtracts/multiplies cents safely", () => {
    const a = fromCents(123);
    const b = fromCents(200);
    expect(add(a, b)).toBe(323);
    expect(sub(b, a)).toBe(77);
    expect(multiply(fromCents(105), 1.1)).toBe(116); // 1.05 * 1.1 = 1.155 -> 1.16
  });

  it("rejects invalid parse inputs", () => {
    expect(() => parseCents("")).toThrow();
    expect(() => parseCents("abc")).toThrow();
    expect(() => parseCents("1.234")).toThrow();
  });
});