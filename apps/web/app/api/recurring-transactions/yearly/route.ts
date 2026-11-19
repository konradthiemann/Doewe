/**
 * GET /api/recurring-transactions/yearly?year=YYYY — Jahresmatrix der Daueraufträge
 *
 * Authentifizierung: Pflicht (401). Liefert eine RecurringYearMatrix (siehe
 * @doewe/shared): pro Dauerauftrag die Monatsbeträge des Jahres (Anker-Monat +
 * Intervall, übersprungene Monate = 0), gruppiert in Einnahmen/Ausgaben/Sparen mit
 * Summen, Saldo und Monatsdurchschnitt. Haushaltsbezogen, ohne Soft-Deletes. Kein
 * DEMO-Ausschluss: der Demo-Nutzer sieht nur seine eigenen Daten. Der Anker-Monat und
 * das Standardjahr (ohne `year`) sind Kalenderwerte in Europe/Berlin.
 */
import { zonedDate } from "@doewe/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../lib/auth";
import { loadRecurringYearMatrix } from "../../../../lib/recurringYear";

export const dynamic = "force-dynamic";

const YearlyQuery = z.object({
  // Evaluated per request: a module-level default would freeze the year at server start.
  year: z.coerce.number().int().min(2000).max(2100).default(() => zonedDate(new Date()).year)
});

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = YearlyQuery.safeParse({ year: new URL(req.url).searchParams.get("year") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  const { year } = parsed.data;

  return NextResponse.json(await loadRecurringYearMatrix(user.householdId, year));
}
