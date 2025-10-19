import { fromCents, type Cents } from "./money";
import { ensureNonEmpty, type NonEmptyString } from "./strings";

export type TransactionId = string & { readonly __brand: "TransactionId" };
export type AccountId = string & { readonly __brand: "AccountId" };
export type CategoryId = string & { readonly __brand: "CategoryId" };

function id<T extends string>(value: string, _brand: T): string & { readonly __brand: T } {
  if (value.trim().length === 0) throw new Error("Id must be non-empty");
  return value as string & { readonly __brand: T };
}

function toISODate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${value}`);
  return d.toISOString();
}

export interface Transaction {
  id: TransactionId;
  accountId: AccountId;
  amount: Cents; // positive = income, negative = expense
  description: NonEmptyString;
  occurredAt: string; // ISO string
  categoryId?: CategoryId;
}

export interface CreateTransactionInput {
  id: string;
  accountId: string;
  amountCents: number; // integer cents (can be negative)
  description: string;
  occurredAt: Date | string;
  categoryId?: string;
}

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