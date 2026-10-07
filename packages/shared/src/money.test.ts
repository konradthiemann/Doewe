import { describe, it, expect } from "vitest";

import { add, formatEuro, fromCents, multiply, parseCents, parseMoneyInput, sub, toDecimalString } from "./money";

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

  it("formats cents as a localized Euro amount", () => {
    // Intl inserts a non-breaking space (U+00A0) before the trailing "€" in de-DE.
    expect(formatEuro(fromCents(123456), "de")).toBe("1.234,56 €");
    expect(formatEuro(fromCents(-500), "de")).toBe("-5,00 €");
    expect(formatEuro(fromCents(123456), "en")).toBe("€1,234.56");
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

describe("parseMoneyInput", () => {
  it.each([
    ["1.234,56", 123456],
    ["50", 5000],
    ["12,5", 1250],
    ["12.5", 1250],
    ["1.234", 123400],
    ["1.234.567", 123456700],
    ["1.234.567,8", 123456780],
    ["12.50", 1250],
    ["0,5", 50],
    ["0.5", 50],
    ["0,00", 0],
    ["  7,05  ", 705],
    ["1234,56", 123456],
    ["12,", 1200],
    [",5", 50]
  ])("parses %j to %i cents", (input, cents) => {
    expect(parseMoneyInput(input)).toBe(cents);
  });

  it.each(["", "   ", "abc", "-5", "1,234,5", "1,234", "12,345", "1.2345", "1.23.4", "1..2", "12 €", ".", ",", "1,2.3"])(
    "returns null for %j",
    (input) => {
      expect(parseMoneyInput(input)).toBeNull();
    }
  );

  it("is exact for values that break float arithmetic", () => {
    expect(parseMoneyInput("0,29")).toBe(29);
    expect(parseMoneyInput("1.005,07")).toBe(100507);
    expect(parseMoneyInput("19,99")).toBe(1999);
  });
});
