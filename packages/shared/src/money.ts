// Money value object: integer cents to avoid floating point errors.
export type Cents = number & { readonly __brand: "Cents" };

function brand(n: number): Cents {
  if (!Number.isInteger(n)) throw new Error("Cents must be an integer");
  // Note: allow negative (expenses) and zero.
  return n as Cents;
}

// Parse "123.45" or "123" to cents
export function parseCents(input: string): Cents {
  const trimmed = input.trim();
  if (trimmed.length === 0) throw new Error("Empty money string");
  // Normalize comma to dot
  const norm = trimmed.replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(norm)) {
    throw new Error(`Invalid money string: ${input}`);
  }
  // Extract sign and work with absolute numeric parts
  const isNegative = norm.startsWith("-");
  const unsigned = isNegative ? norm.slice(1) : norm;
  const [intPart, frac = ""] = unsigned.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  const absCents = Number(intPart) * 100 + Number(fracPadded);
  const signed = isNegative ? -absCents : absCents;
  return brand(signed);
}

export function fromCents(n: number): Cents {
  return brand(n);
}

export function add(a: Cents, b: Cents): Cents {
  return brand(a + b);
}

export function sub(a: Cents, b: Cents): Cents {
  return brand(a - b);
}

export function multiply(a: Cents, factor: number): Cents {
  // factor can be decimal; round to nearest cent
  return brand(Math.round(a * factor));
}

export function toDecimalString(c: Cents): string {
  const sign = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  const euros = Math.trunc(abs / 100);
  const cents = abs % 100;
  return `${sign}${euros}.${cents.toString().padStart(2, "0")}`;
}