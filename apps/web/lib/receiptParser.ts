/**
 * Claude Vision receipt parsing (Issue #53).
 *
 * Sends a receipt photo/PDF to Claude with a structured-output schema and
 * returns validated line items. `parseReceiptImage` is the only export the
 * API route needs; the schemas are exported too so callers (and tests) can
 * validate/mock against the same shape.
 *
 * Note on the Zod import: the SDK's `zodOutputFormat()` helper is built
 * against `zod/v4` internally (it calls the v4-only `z.toJSONSchema`). Passing
 * it a schema built from the project's default `zod` import (which resolves
 * to the v3 API even on zod@3.25.x) fails at runtime because the two are
 * different class hierarchies. So this file builds its schemas from `zod/v4`
 * specifically — that subpath is fully API-compatible with the v3 syntax used
 * elsewhere in the codebase, and `.safeParse()`/`z.infer` work the same way.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";

import { env } from "../env";

export const ReceiptLineItemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unitPriceCents: z.number().int(),
  totalCents: z.number().int(),
  suggestedCategory: z.string().nullable()
});

export const ReceiptScanResultSchema = z.object({
  merchant: z.string().nullable(),
  date: z.string(),
  items: z.array(ReceiptLineItemSchema),
  subtotalCents: z.number().int().nullable(),
  taxCents: z.number().int().nullable(),
  totalCents: z.number().int(),
  confidence: z.enum(["high", "medium", "low", "none"])
});

export type ReceiptScanResult = z.infer<typeof ReceiptScanResultSchema>;

export class ReceiptParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ReceiptParseError";
  }
}

/**
 * Builds the German-language domain prompt. Since `output_config.format`
 * (structured outputs) already enforces the JSON shape, this focuses on the
 * receipt domain logic rather than on formatting instructions.
 */
export function buildPrompt(categoryNames: string[]): string {
  const categoryHint =
    categoryNames.length > 0
      ? `Wähle für jede Position, wenn möglich, eine passende Kategorie aus dieser Liste (oder lasse sie leer, wenn keine passt): ${categoryNames.join(", ")}.`
      : "Für die Kategorie steht aktuell keine Haushalts-Liste zur Verfügung — lasse das Feld leer.";

  return `Analysiere diesen deutschen Kassenbeleg (z. B. ALDI, REWE, Lidl, dm, Edeka, Penny).

Extrahiere:
- Den Namen des Geschäfts (merchant) und das Belegdatum (date, Format YYYY-MM-DD).
- Jede einzelne Position (items) mit Artikelname, Menge, Stückpreis und Gesamtpreis in Cent.
- Rabatte (z. B. "Rabatt", "Coupon", "-10%") als eigene Position mit negativem totalCents.
- Pfand (Flaschen-/Kistenpfand) als eigene Position, nicht in den Artikelpreis eingerechnet.
- Zwischensumme (subtotalCents) und ausgewiesene Steuer/MwSt. (taxCents), falls auf dem Beleg vorhanden — sonst null.
- Die Gesamtsumme (totalCents) des Belegs.

${categoryHint}

Gib eine confidence an:
- "high": Beleg ist scharf, alle Felder eindeutig lesbar.
- "medium": Beleg ist überwiegend lesbar, einzelne Werte unsicher.
- "low": Beleg ist schwer lesbar oder stark verschwommen.
- "none": Es ist kein Kassenbeleg erkennbar oder der Inhalt ist nicht auswertbar.

Wenn du dir bei den Positionen nicht sicher bist oder kein Beleg erkennbar ist, setze confidence auf "low" oder "none" und gib ein leeres items-Array zurück, statt Werte zu raten.`;
}

type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";

function isImageMimeType(mimeType: string): mimeType is ImageMimeType {
  return mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp";
}

export async function parseReceiptImage({
  imageBase64,
  mimeType,
  categoryNames
}: {
  imageBase64: string;
  mimeType: string;
  categoryNames: string[];
}): Promise<ReceiptScanResult> {
  // Request-scoped schema: when the household has categories, make it
  // structurally impossible for Claude to suggest one that doesn't exist.
  const requestSchema = ReceiptScanResultSchema.extend({
    items: z.array(
      ReceiptLineItemSchema.extend({
        suggestedCategory:
          categoryNames.length > 0
            ? z.enum(categoryNames as [string, ...string[]]).nullable()
            : z.string().nullable()
      })
    )
  });

  // Instantiated lazily so importing this module never crashes when the key
  // is unset (the route falls back to stub behavior in that case).
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const contentBlock: Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam =
    isImageMimeType(mimeType)
      ? { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: imageBase64 } };

  let message;
  try {
    message = await client.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [contentBlock, { type: "text", text: buildPrompt(categoryNames) }]
        }
      ],
      output_config: { format: zodOutputFormat(requestSchema) }
    });
  } catch (error) {
    throw new ReceiptParseError("Claude Vision request failed", { cause: error });
  }

  // Structured outputs only guarantee the JSON shape, not the business rules
  // (e.g. the stable schema's enum values) — re-validate against the stable
  // schema before handing the result back to the route.
  const parsed = ReceiptScanResultSchema.safeParse(message.parsed_output);
  if (!parsed.success) {
    throw new ReceiptParseError(`Claude Vision response failed validation: ${parsed.error.message}`);
  }

  return parsed.data;
}
