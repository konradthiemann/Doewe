/**
 * Cents — ein "branded type" für Geldbeträge als ganze Zahlen.
 *
 * Warum kein `number`? Weil `0.1 + 0.2 !== 0.3` in JavaScript.
 * Alle Beträge werden als Cent-Integer gespeichert: 12,50 € = 1250.
 * Positive Werte = Einnahmen, negative Werte = Ausgaben.
 *
 * Das `__brand`-Feld existiert nur im Typsystem — zur Laufzeit ist Cents eine normale Zahl.
 * Damit verhindert TypeScript, dass man versehentlich rohe `number`-Werte
 * dort übergeben kann, wo `Cents` erwartet wird.
 */
export type Cents = number & { readonly __brand: "Cents" };

/** Interne Validierung: nur ganze Zahlen erlaubt. Negative Werte (Ausgaben) sind ok. */
function brand(n: number): Cents {
  if (!Number.isInteger(n)) throw new Error("Cents must be an integer");
  return n as Cents;
}

/**
 * Wandelt einen Eingabe-String in Cents um.
 *
 * Akzeptiert: "123", "123.45", "123,45", "-99.99"
 * Wirft einen Fehler bei: leeren Strings, mehr als 2 Nachkommastellen, ungültigen Zeichen.
 *
 * @example
 * parseCents("12.50")  // → 1250
 * parseCents("-5,00")  // → -500
 * parseCents("0")      // → 0
 */
export function parseCents(input: string): Cents {
  const trimmed = input.trim();
  if (trimmed.length === 0) throw new Error("Empty money string");
  // Komma zu Punkt normalisieren (deutsche Eingabe)
  const norm = trimmed.replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(norm)) {
    throw new Error(`Invalid money string: ${input}`);
  }
  const isNegative = norm.startsWith("-");
  const unsigned = isNegative ? norm.slice(1) : norm;
  const [intPart, frac = ""] = unsigned.split(".");
  // "5" → "50", "50" → "50" — immer 2 Stellen
  const fracPadded = (frac + "00").slice(0, 2);
  const absCents = Number(intPart) * 100 + Number(fracPadded);
  const signed = isNegative ? -absCents : absCents;
  return brand(signed);
}

/**
 * Erstellt einen `Cents`-Wert aus einer rohen ganzen Zahl.
 * Verwende dies, wenn du einen Integer aus der Datenbank liest (`amountCents`).
 *
 * @example
 * fromCents(1250)  // → 1250 als Cents-Typ
 */
export function fromCents(n: number): Cents {
  return brand(n);
}

/** Addiert zwei Geldbeträge. Ergebnis ist ebenfalls `Cents`. */
export function add(a: Cents, b: Cents): Cents {
  return brand(a + b);
}

/** Subtrahiert `b` von `a`. Kann negatives Ergebnis liefern. */
export function sub(a: Cents, b: Cents): Cents {
  return brand(a - b);
}

/**
 * Multipliziert einen Geldbetrag mit einem Faktor (z.B. für Prozentrechnungen).
 * Rundet auf den nächsten Cent.
 *
 * @example
 * multiply(fromCents(1000), 0.19)  // → 190 (19% von 10,00 €)
 */
export function multiply(a: Cents, factor: number): Cents {
  return brand(Math.round(a * factor));
}

/**
 * Formatiert Cents als Dezimal-String zur Anzeige.
 * Kein Währungssymbol — das gehört in die UI-Schicht.
 *
 * @example
 * toDecimalString(fromCents(1250))   // → "12.50"
 * toDecimalString(fromCents(-500))   // → "-5.00"
 */
export function toDecimalString(c: Cents): string {
  const sign = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  const euros = Math.trunc(abs / 100);
  const cents = abs % 100;
  return `${sign}${euros}.${cents.toString().padStart(2, "0")}`;
}