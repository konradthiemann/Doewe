/**
 * GET /api/recurring-transactions/export?year=YYYY — CSV der wiederkehrenden Ausgaben
 *
 * Authentifizierung: Pflicht (401). Liefert pro Dauerauftrag die Monatsbeträge des
 * Jahres (Anker-Monat in Europe/Berlin + Intervall, übersprungene Monate abgezogen).
 * Einordnung wie auf der Jahresseite (docs/calculations/00-grundregeln.md §2): erst die
 * Spar-Kategorie ("Sparen"/"Savings"), dann das Vorzeichen — `Category.isIncome`
 * entscheidet nichts. Einnahmen (Betrag >= 0 außerhalb einer Spar-Kategorie) werden
 * ausgelassen; Sparen steht separat markiert und mit eigener Summenzeile. Nur
 * Daueraufträge des eigenen Haushalts, ohne Soft-Deletes. Ohne `year` gilt das laufende
 * Jahr in Europe/Berlin.
 */
import { buildRecurringCsv, zonedDate } from "@doewe/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../lib/auth";
import { loadRecurringYearItems } from "../../../../lib/recurringYear";

export const dynamic = "force-dynamic";

const ExportQuery = z.object({
  // Evaluated per request: a module-level default would freeze the year at server start.
  year: z.coerce.number().int().min(2000).max(2100).default(() => zonedDate(new Date()).year)
});

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = ExportQuery.safeParse({ year: new URL(req.url).searchParams.get("year") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  const { year } = parsed.data;

  // Same loader as the yearly page, so CSV and page cannot classify differently.
  const items = await loadRecurringYearItems(user.householdId, year);

  // BOM so Excel opens the UTF-8 file with correct umlauts.
  return new Response("﻿" + buildRecurringCsv(items, year), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wiederkehrend-${year}.csv"`,
      "Cache-Control": "private, no-store"
    }
  });
}
