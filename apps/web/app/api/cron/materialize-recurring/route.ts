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
 * Von Hand erfasste Zahlung: Steht eine von Hand angelegte Buchung für das
 * Vorkommen (gleiches Konto, gleicher Betrag, gleiche Kategorie, höchstens 7
 * Tage um den Fälligkeitstag — siehe lib/recurringBooking.ts), wird sie
 * übernommen statt neu gebucht. Solche Einträge tragen in `occurrences`
 * `adopted: true`; `transactionId` ist dann die übernommene Buchung.
 *
 * Antwort: { ok, dryRun, booked, adopted, occurrences } — `booked` zählt alle
 * Einträge von `occurrences`, `adopted` die übernommenen darunter.
 *
 * `?dryRun=true` schreibt nichts, sondern listet nur, was gebucht bzw.
 * übernommen würde.
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

  return NextResponse.json({
    ok: true,
    dryRun,
    booked: booked.length,
    adopted: booked.filter((occurrence) => occurrence.adopted).length,
    occurrences: booked
  });
}
