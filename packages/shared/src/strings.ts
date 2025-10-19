// Simple branded string and helper to ensure non-empty input.
export type NonEmptyString = string & { readonly __brand: "NonEmptyString" };

export function ensureNonEmpty(value: string): NonEmptyString {
  const v = value.trim();
  if (v.length === 0) {
    throw new Error("Expected non-empty string");
  }
  return v as NonEmptyString;
}