import { parseDayKey } from "@doewe/shared";
import { z } from "zod";

import { INT4_MAX, INT4_MIN, isStorableText } from "../schema";

// Cent-Beträge sind ganze Zahlen im Bereich der Postgres-Spalte `Int` (int4);
// alles andere wird hier als 400 mit Feldpfad abgewiesen statt in der
// Datenbank zu scheitern (500).
const CentsInput = z.number().int().min(INT4_MIN).max(INT4_MAX);
const NOT_STORABLE = { message: "Contains characters that cannot be stored" };

const LineItemInput = z.object({
  name: z.string().min(1).refine(isStorableText, NOT_STORABLE),
  quantity: z.number().finite().positive().default(1),
  unitPriceCents: CentsInput,
  // Negativ = Rabatt, Gutschein oder Pfandrückgabe.
  totalCents: CentsInput,
  position: z.number().int().min(0).max(INT4_MAX)
});

const GroupInput = z
  .object({
    categoryId: z.string().min(1),
    items: z.array(LineItemInput).min(1)
  })
  .superRefine((group, ctx) => {
    // Die Gruppensumme wird mit umgekehrtem Vorzeichen als ein Buchungsbetrag
    // gespeichert, muss also in beiden Richtungen in int4 passen.
    const totalCents = group.items.reduce((sum, item) => sum + item.totalCents, 0);
    if (Math.abs(totalCents) > INT4_MAX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "Sum of totalCents is out of range"
      });
    }
  });

export const BatchTransactionInput = z.object({
  // Kalendertag des Belegs, wie ihn ein <input type="date"> liefert.
  receiptDate: z
    .string()
    .refine((value) => parseDayKey(value) !== null, { message: "Expected a calendar day (yyyy-mm-dd)" }),
  receiptMerchant: z.string().refine(isStorableText, NOT_STORABLE).optional(),
  accountId: z.string().min(1),
  // Kein Default: fehlt das Feld, erbt jede Buchung `isTaxRelevant` ihrer
  // Kategorie (wie POST /api/transactions).
  taxRelevant: z.boolean().optional(),
  groups: z.array(GroupInput).min(1)
});

export type BatchTransactionInputType = z.infer<typeof BatchTransactionInput>;
