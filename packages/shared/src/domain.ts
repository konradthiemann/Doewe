import { fromCents, type Cents } from "./money";
import { ensureNonEmpty, type NonEmptyString } from "./strings";

/**
 * Branded ID-Typen verhindern, dass man versehentlich eine AccountId dort übergibt,
 * wo eine TransactionId erwartet wird — obwohl beides Strings sind.
 */
export type TransactionId = string & { readonly __brand: "TransactionId" };
export type AccountId = string & { readonly __brand: "AccountId" };
export type CategoryId = string & { readonly __brand: "CategoryId" };

/** Interne Hilfsfunktion: validiert und branded eine ID. */
function id<T extends string>(value: string, _brand: T): string & { readonly __brand: T } {
  if (value.trim().length === 0) throw new Error("Id must be non-empty");
  return value as string & { readonly __brand: T };
}

/** Konvertiert Date oder ISO-String zu ISO-String. Wirft bei ungültigem Datum. */
function toISODate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${value}`);
  return d.toISOString();
}

/**
 * Die zentrale Transaktion im Domain-Modell.
 *
 * `amount` ist in Cents (ganzzahlig):
 * - positiv = Einnahme (z.B. Gehalt)
 * - negativ = Ausgabe (z.B. Miete)
 *
 * `occurredAt` ist immer ein UTC ISO-String ("2026-04-23T10:00:00.000Z").
 */
export interface Transaction {
  id: TransactionId;
  accountId: AccountId;
  amount: Cents;
  description: NonEmptyString;
  occurredAt: string;
  categoryId?: CategoryId;
}

/**
 * Eingabe für `createTransaction` — rohe Typen ohne Branding.
 * Die Funktion übernimmt die Validierung und gibt ein vollständiges `Transaction`-Objekt zurück.
 */
export interface CreateTransactionInput {
  id: string;
  accountId: string;
  amountCents: number;
  description: string;
  occurredAt: Date | string;
  categoryId?: string;
}

/**
 * Erstellt ein valides `Transaction`-Objekt aus rohen Eingabedaten.
 *
 * Validierungen die diese Funktion übernimmt:
 * - `amountCents` muss eine ganze Zahl sein
 * - `description` darf nicht leer sein (nach trim)
 * - `occurredAt` muss ein gültiges Datum sein
 * - alle IDs müssen nicht-leer sein
 *
 * @throws wenn eine Validierung fehlschlägt
 */
export function createTransaction(input: CreateTransactionInput): Transaction {
  const amount = fromCents(input.amountCents);
  const description = ensureNonEmpty(input.description);
  const occurredAt = toISODate(input.occurredAt);

  return {
    id: id(input.id, "TransactionId"),
    accountId: id(input.accountId, "AccountId"),
    amount,
    description,
    occurredAt,
    categoryId: input.categoryId ? id(input.categoryId, "CategoryId") : undefined
  };
}