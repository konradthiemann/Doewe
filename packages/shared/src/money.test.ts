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

  it("parses both comma and dot decimal separators", () => {
    // German format with comma
    expect(parseCents("12,34")).toBe(1234);
    expect(parseCents("0,99")).toBe(99);
    expect(parseCents("100,00")).toBe(10000);
    expect(parseCents("-50,25")).toBe(-5025);
    
    // English format with dot
    expect(parseCents("12.34")).toBe(1234);
    expect(parseCents("0.99")).toBe(99);
    expect(parseCents("100.00")).toBe(10000);
    expect(parseCents("-50.25")).toBe(-5025);
    
    // Single decimal place
    expect(parseCents("5,5")).toBe(550);
    expect(parseCents("5.5")).toBe(550);
    
    // Whitespace trimming
    expect(parseCents("  12,34  ")).toBe(1234);
    expect(parseCents("  12.34  ")).toBe(1234);
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
    expect(() => parseCents("1.234")).toThrow(); // more than 2 decimal places
    expect(() => parseCents("1,234")).toThrow(); // more than 2 decimal places
    expect(() => parseCents("12,34,56")).toThrow(); // multiple separators
    expect(() => parseCents("12.34.56")).toThrow(); // multiple separators
    expect(() => parseCents("1.234,56")).toThrow(); // mixed separators (thousand + decimal)
    expect(() => parseCents("12a34")).toThrow(); // letters in number
  });
});