/**
 * POST /api/recurring-transactions/[id]/link-booking — einen Vorschlag bestätigen
 *
 * Verknüpft eine von Hand erfasste Buchung als das Vorkommen eines Monats dieses
 * Dauerauftrags. Das Dashboard schlägt solche Buchungen vor
 * (`recurringSuggestions` in GET /api/analytics/summary); verknüpft wird nur hier, auf
 * Bestätigung des Nutzers — nie automatisch (siehe
 * docs/calculations/03-wiederkehrende-transaktionen.md, "Vorschlag und Bestätigung").
 *
 * Body: { transactionId: string, period: "JJJJ-MM" }
 *
 * Unter dem Advisory-Lock des Dauerauftrags (derselbe wie beim automatischen Buchen) wird
 * erneut geprüft, ob die Buchung noch passt: gleiches Konto, gleicher Betrag, gleiche
 * Kategorie (ohne Kategorie: gleiche Beschreibung), nicht gelöscht, mit keinem Dauerauftrag
 * verknüpft, höchstens 7 Tage um den Fälligkeitstag der Periode; die Periode ist ein
 * fälliger Monat des Dauerauftrags, liegt nicht vor `bookFromPeriod` und ist weder
 * übersprungen noch schon gebucht. Dann bekommt die Buchung `recurringTransactionId` und
 * `recurringPeriod` — sonst ändert sich nichts an ihr. Danach gilt das Vorkommen als
 * gebucht: das Dashboard plant es nicht mehr, der Buchungslauf bucht es nicht.
 *
 * 200 { id, recurringTransactionId, recurringPeriod }
 * 400 Body fehlt oder ist fehlerhaft
 * 401 ohne Session
 * 404 Dauerauftrag oder Buchung gibt es im Haushalt nicht
 * 409 { error } — die Buchung passt nicht (mehr) oder das Vorkommen ist schon gebucht,
 *     übersprungen oder kein fälliger Monat
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../../lib/auth";
import { linkBookingToOccurrence } from "../../../../../lib/recurringBooking";

const LinkInput = z.object({
  transactionId: z.string().min(1),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM")
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = LinkInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await linkBookingToOccurrence({
    householdId: user.householdId,
    recurringId: params.id,
    transactionId: parsed.data.transactionId,
    period: parsed.data.period
  });

  if (result.status === "not_found") return NextResponse.json({ error: result.error }, { status: 404 });
  if (result.status === "conflict") return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({
    id: result.id,
    recurringTransactionId: result.recurringTransactionId,
    recurringPeriod: result.recurringPeriod
  });
}
