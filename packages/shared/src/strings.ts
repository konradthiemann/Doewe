/**
 * NonEmptyString — ein "branded type" für Strings, die garantiert nicht leer sind.
 *
 * Genau wie `Cents` für Zahlen: Das `__brand`-Feld existiert nur im Typsystem.
 * Damit sieht man sofort an der Signatur, ob eine Funktion einen validierten
 * oder einen rohen String erwartet.
 */
export type NonEmptyString = string & { readonly __brand: "NonEmptyString" };

/**
 * Validiert und konvertiert einen String zu `NonEmptyString`.
 * Trimmt Whitespace bevor der Leer-Check stattfindet.
 *
 * Wirft einen Fehler wenn der String (nach trim) leer ist.
 *
 * @example
 * ensureNonEmpty("  Miete  ")  // → "Miete" als NonEmptyString
 * ensureNonEmpty("   ")        // → wirft Error
 */
export function ensureNonEmpty(value: string): NonEmptyString {
  const v = value.trim();
  if (v.length === 0) {
    throw new Error("Expected non-empty string");
  }
  return v as NonEmptyString;
}