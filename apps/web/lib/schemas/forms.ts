import { parseCents } from "@doewe/shared";
import { z } from "zod";

/** True when a string parses as a valid cent amount. */
function isParseableCents(val: string): boolean {
  try {
    parseCents(val);
    return true;
  } catch {
    return false;
  }
}

/** Validates that a string can be parsed as a non-zero cent amount. */
const centsString = z
  .string()
  .min(1, "Betrag erforderlich")
  .refine(isParseableCents, { message: "Ungültiger Betrag (z.B. 12,50 oder 12.50)" });

export const transactionFormSchema = z.object({
  description: z.string().min(1, "Beschreibung erforderlich"),
  amount: centsString,
  accountId: z.string().min(1, "Konto erforderlich"),
  categoryId: z.string().optional(),
});
export type TransactionFormValues = z.infer<typeof transactionFormSchema>;

export const recurringTransactionFormSchema = z.object({
  description: z.string().min(1, "Beschreibung erforderlich"),
  amount: centsString,
  accountId: z.string().min(1, "Konto erforderlich"),
  categoryId: z.string().optional(),
  intervalMonths: z.number().int().min(1).max(24),
  dayOfMonth: z.number().int().min(1).max(31),
});
export type RecurringTransactionFormValues = z.infer<typeof recurringTransactionFormSchema>;

export const plannedSavingFormSchema = z
  .object({
    title: z.string().min(1, "Name erforderlich"),
    // Amount is optional (empty allowed): an undated idea may not have a target yet.
    amount: z.string(),
    accountId: z.string().min(1, "Konto erforderlich"),
    // When false the goal is "undated" (idea backlog) and needs no target month.
    scheduled: z.boolean(),
    targetMonth: z.string(),
  })
  .refine((data) => !data.scheduled || /^\d{4}-\d{2}$/.test(data.targetMonth), {
    message: "Gültigen Monat wählen",
    path: ["targetMonth"],
  })
  // Dated goals must have a concrete amount (progress needs a target);
  // undated ideas may leave it blank.
  .refine((data) => !data.scheduled || data.amount.trim() !== "", {
    message: "Betrag erforderlich",
    path: ["amount"],
  })
  .refine((data) => data.amount.trim() === "" || isParseableCents(data.amount), {
    message: "Ungültiger Betrag (z.B. 12,50 oder 12.50)",
    path: ["amount"],
  });
export type PlannedSavingFormValues = z.infer<typeof plannedSavingFormSchema>;
