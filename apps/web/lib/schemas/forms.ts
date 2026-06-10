import { parseCents } from "@doewe/shared";
import { z } from "zod";

/** Validates that a string can be parsed as a non-zero cent amount. */
const centsString = z
  .string()
  .min(1, "Betrag erforderlich")
  .refine(
    (val) => {
      try {
        parseCents(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Ungültiger Betrag (z.B. 12,50 oder 12.50)" }
  );

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

export const plannedSavingFormSchema = z.object({
  title: z.string().min(1, "Name erforderlich"),
  amount: centsString,
  accountId: z.string().min(1, "Konto erforderlich"),
  targetMonth: z.string().regex(/^\d{4}-\d{2}$/, "Gültigen Monat wählen"),
});
export type PlannedSavingFormValues = z.infer<typeof plannedSavingFormSchema>;
