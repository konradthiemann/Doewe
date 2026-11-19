/**
 * GET /api/analytics/quarterly
 *
 * Authentifizierung: Pflicht (401). Quartalsübersicht des Dashboards: die letzten drei
 * Kalendermonate inkl. des laufenden (Kalender Europe/Berlin, alle Konten des Haushalts,
 * nur Gebuchtes — siehe docs/calculations/00-grundregeln.md).
 *
 * - `quarters` — je Monat `month`, `year`, `incomeCents`, `outcomeCents`, `savingsCents`
 *                (netto: Einzahlungen − Entnahmen) und `balanceCents` (Kontostand am
 *                Monatsende = Summe aller Buchungen vor dem Ende des Monats)
 * - `totals`   — Summen der drei Monate (`incomeCents`, `outcomeCents`, `savingsCents`)
 *
 * Einordnung wie überall (classifyFlow): Spar-Kategorie zuerst, sonst das Vorzeichen.
 * Jede Spalte entspricht dem Rückblick desselben Monats (/api/analytics/monthly-review).
 * Vor dem Rechnen werden fällige, nie gebuchte Daueraufträge abgeschlossener Monate
 * nachgebucht — wie in summary und monthly-review, damit die parallel geladenen
 * Dashboard-Kacheln dieselben Buchungen sehen.
 *
 * 404, wenn der Haushalt kein Konto hat.
 */
import { addFlow, emptyFlowTotals, shiftMonth, zonedMonth, zonedMonthRange } from "@doewe/shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { catchUpPastRecurringForHousehold } from "../../../../lib/recurringBooking";
import { loadSavingsCategoryIds } from "../../../../lib/savingsCategory";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = user.householdId;
  const anyAccount = await prisma.account.findFirst({ where: { householdId }, select: { id: true } });
  if (!anyAccount) {
    return NextResponse.json({ error: "No account found for user" }, { status: 404 });
  }

  const now = new Date();

  // Selbstheilung: fällige, nie gebuchte Daueraufträge abgeschlossener Monate
  // nachbuchen, bevor gerechnet wird (siehe catchUpPastRecurringForHousehold).
  await catchUpPastRecurringForHousehold(householdId, now);

  // Letzte 3 Monate inkl. aktuellem Monat (App-Kalender), je halboffen [start, end)
  const current = zonedMonth(now);
  const months = [-2, -1, 0].map((delta) => {
    const ref = shiftMonth(current, delta);
    return { ...ref, ...zonedMonthRange(ref.year, ref.month) };
  });
  const overallEnd = months[months.length - 1].end; // Ende des laufenden Monats

  const savingsIds = await loadSavingsCategoryIds(householdId);

  // Eine einzige Abfrage für alle benötigten Daten — der kumulative Kontostand
  // braucht auch alles vor dem ersten Monat.
  const allTxs = await prisma.transaction.findMany({
    where: { account: { householdId }, occurredAt: { lt: overallEnd } },
    select: { amountCents: true, categoryId: true, occurredAt: true }
  });

  // Alle Berechnungen in Integer-Cents im Speicher — keine weiteren DB-Abfragen nötig
  const quarters = months.map(({ month, year, start, end }) => {
    const startMs = start.getTime();
    const endMs = end.getTime();

    const flows = emptyFlowTotals();
    let balance = 0;

    for (const t of allTxs) {
      const tMs = t.occurredAt.getTime();
      if (tMs >= endMs) continue;
      balance += t.amountCents; // kumulativer Kontostand bis Monatsende
      if (tMs >= startMs) addFlow(flows, t, savingsIds);
    }

    return {
      month,
      year,
      incomeCents: flows.incomeCents,
      outcomeCents: flows.outcomeCents,
      savingsCents: flows.savingsCents,
      balanceCents: balance
    };
  });

  const totalIncomeCents = quarters.reduce((sum, q) => sum + q.incomeCents, 0);
  const totalOutcomeCents = quarters.reduce((sum, q) => sum + q.outcomeCents, 0);
  const totalSavingsCents = quarters.reduce((sum, q) => sum + q.savingsCents, 0);

  return NextResponse.json({
    quarters,
    totals: {
      incomeCents: totalIncomeCents,
      outcomeCents: totalOutcomeCents,
      savingsCents: totalSavingsCents
    }
  });
}
