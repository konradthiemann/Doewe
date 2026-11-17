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
  // Request-scoped schema: when the household has categories, the JSON schema
  // sent to Claude restricts suggestions to them. This is a hint only — in
  // prod (2026-11-17) Claude still returned an off-list category, and the
  // SDK's strict `messages.parse()` then discarded the whole receipt. So the
  // response is validated locally against the lenient stable schema and
  // off-list categories are dropped per item (`normalizeCategories`).
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
  const { schema } = zodOutputFormat(requestSchema);

  // Instantiated lazily so importing this module never crashes when the key
  // is unset (the route falls back to stub behavior in that case).
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const contentBlock: Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam =
    isImageMimeType(mimeType)
      ? { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: imageBase64 } };

  const requestOnce = async (): Promise<ReceiptScanResult> => {
    let message;
    try {
      message = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          {
            role: "user",
            content: [contentBlock, { type: "text", text: buildPrompt(categoryNames) }]
          }
        ],
        output_config: { format: { type: "json_schema", schema } }
      });
    } catch (error) {
      throw new ReceiptParseError("Claude Vision request failed", { cause: error });
    }

    const result = validateResponse(message);
    return { ...result, items: normalizeCategories(result.items, categoryNames) };
  };

  try {
    return await requestOnce();
  } catch (error) {
    // Malformed/truncated output is usually a one-off — retry exactly once.
    // Request failures are not retried here: the SDK already retries
    // transport errors, 429 and 5xx (maxRetries: 2).
    if (!(error instanceof ReceiptOutputError)) throw error;
    // eslint-disable-next-line no-console -- surfaces in Railway logs, scan continues
    console.warn(`Receipt scan: invalid model output, retrying once (${error.message})`);
    return requestOnce();
  }
}

/** Long receipts (30+ line items) need headroom; output is billed per token used. */
const MAX_OUTPUT_TOKENS = 8192;

/** Model answered, but the answer was unusable — the only case worth a retry. */
class ReceiptOutputError extends ReceiptParseError {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptOutputError";
  }
}

function validateResponse(message: Anthropic.Message): ReceiptScanResult {
  // Diagnostics only — no receipt content in the logs (personal data).
  const diagnostics = `stop_reason=${message.stop_reason}, output_tokens=${message.usage?.output_tokens}`;
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ReceiptOutputError(`Claude Vision returned non-JSON output (${diagnostics}, length=${text.length})`);
  }

  const parsed = ReceiptScanResultSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new ReceiptOutputError(`Claude Vision response failed validation (${diagnostics}): ${issues}`);
  }
  return parsed.data;
}

function categoryKey(name: string): string {
  return name.normalize("NFC").trim().toLocaleLowerCase("de-DE");
}

/**
 * Maps each suggestion onto the household's canonical category name
 * (tolerating case, surrounding whitespace and Unicode NFC/NFD differences)
 * and drops suggestions that match no category. Without a household list,
 * suggestions pass through unchanged (the review step lets the user pick).
 */
function normalizeCategories(
  items: ReceiptScanResult["items"],
  categoryNames: string[]
): ReceiptScanResult["items"] {
  if (categoryNames.length === 0) return items;
  const canonical = new Map(categoryNames.map((name) => [categoryKey(name), name]));
  return items.map((item) => ({
    ...item,
    suggestedCategory:
      item.suggestedCategory === null ? null : (canonical.get(categoryKey(item.suggestedCategory)) ?? null)
  }));
}
