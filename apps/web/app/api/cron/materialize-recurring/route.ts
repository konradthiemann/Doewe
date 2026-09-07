/**
 * POST /api/cron/materialize-recurring — fällige Daueraufträge echt buchen.
 *
 * Täglich von einer Railway-Cron aufgerufen (Secret-Header, in der Middleware
 * ausgenommen — siehe cron/send-reminders, cron/notify-monthly-review für das
 * gleiche Muster). Bucht für jeden Dauerauftrag jeden fälligen, noch nicht
 * gebuchten und nicht geskippten Monat als echte Transaction — inklusive
 * bisher verpasster Monate in der Vergangenheit (einmaliges Nachbuchen läuft
 * über denselben Code-Pfad wie der laufende Tagesbetrieb).
 *
 * `?dryRun=true` schreibt nichts, sondern listet nur, was gebucht würde —
 * vor dem ersten Rollout auf echten Daten Pflicht (siehe recurringBooking.ts,
 * bekannte Grenze bei bereits von Hand gebuchten Monaten).
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
