/**
 * POST /api/cron/materialize-recurring — fällige Daueraufträge echt buchen.
 *
 * Täglich von einer Railway-Cron aufgerufen (Secret-Header, in der Middleware
 * ausgenommen — siehe cron/send-reminders, cron/notify-monthly-review für das
 * gleiche Muster). Bucht für jeden Dauerauftrag jeden fälligen, noch nicht
 * gebuchten und nicht geskippten Monat als echte Transaction — inklusive
 * bisher verpasster Monate in der Vergangenheit (Nachbuchen läuft über
 * denselben Code-Pfad wie der laufende Tagesbetrieb). Monate vor
 * `RecurringTransaction.bookFromPeriod` werden nicht gebucht.
 *
 * Fällig ist ein Vorkommen, sobald der Kalendertag des Laufs in Europe/Berlin
 * den Fälligkeitstag erreicht hat — unabhängig von der Zeitzone des Servers.
 * Ein Monat gilt als gebucht, sobald eine Buchung des Dauerauftrags für diese
 * Periode existiert (`recurringPeriod`), auch eine verschobene oder gelöschte.
 *
 * Von Hand erfasste Zahlungen werden nicht erkannt und nicht verknüpft: Der Lauf bucht
 * jedes offene Vorkommen. Ob eine von Hand angelegte Buchung für ein Vorkommen steht,
 * entscheidet der Nutzer — das Dashboard schlägt sie vor (`recurringSuggestions` in
 * GET /api/analytics/summary), POST /api/recurring-transactions/[id]/link-booking
 * verknüpft sie auf Bestätigung.
 *
 * Antwort: { ok, dryRun, booked, occurrences } — `booked` zählt die Einträge von
 * `occurrences`.
 *
 * `?dryRun=true` schreibt nichts, sondern listet nur, was gebucht würde.
 */
import { NextResponse } from "next/server";

import { isAuthorizedCron } from "../../../../lib/cronAuth";
import { materializeDueRecurringTransactions } from "../../../../lib/recurringBooking";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "true";
  const booked = await materializeDueRecurringTransactions(new Date(), { dryRun });

  return NextResponse.json({ ok: true, dryRun, booked: booked.length, occurrences: booked });
}
