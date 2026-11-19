import { zonedDate } from "@doewe/shared";
import { z } from "zod";

/**
 * Query parameters for `GET /api/tax/export`. All three are optional and
 * arrive as raw query strings (Next.js `URLSearchParams`), hence the
 * `z.coerce`/string-literal handling instead of native `number`/`boolean`.
 * `year` defaults to the current calendar year in Europe/Berlin, resolved per
 * request (not once at module load).
 */
export const TaxExportQuery = z.object({
  year: z.coerce
    .number()
    .int()
    .min(2000)
    .max(2100)
    .default(() => zonedDate(new Date()).year),
  includeReceipts: z.enum(["0", "1"]).default("1"),
  locale: z.enum(["de", "en"]).optional()
});

export type TaxExportQueryType = z.infer<typeof TaxExportQuery>;
