import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // NOTE: Nur das erste Konto wird verwendet — Multi-Account ist eine bekannte zukünftige Erweiterung.
  const account = await prisma.account.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  if (!account) {
    return NextResponse.json({ error: "No account found for user" }, { status: 404 });
  }

  const accountId = account.id;
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-indexed
  const currentYear = now.getFullYear();

  // Letzte 3 Monate inkl. aktuellem Monat
  const months: Array<{ month: number; year: number }> = [];
  for (let i = 2; i >= 0; i--) {
    const date = new Date(currentYear, currentMonth - i, 1);
    months.push({ month: date.getMonth() + 1, year: date.getFullYear() });
  }

  // Spar-Kategorie auflösen — case-insensitive, EN + DE (konsistent mit summary-Route)
  const SAVINGS_NAMES = ["savings", "sparen"];
  const savingsCategory = await prisma.category.findFirst({
    where: {
      userId: user.id,
      name: { in: SAVINGS_NAMES, mode: "insensitive" }
    },
    select: { id: true }
  });
  const savingsCatId = savingsCategory?.id ?? null;

  // Monatsgrenzen berechnen
  const starts = months.map(({ month, year }) => new Date(year, month - 1, 1));
  const ends = months.map(({ month, year }) => new Date(year, month, 1));
  const overallEnd = ends[ends.length - 1]; // Ende des letzten Monats

  // Eine einzige Abfrage für alle benötigten Daten — ersetzt 3 separate findMany-Aufrufe
  // für den kumulativen Kontostand (vorher O(n²): 3 Vollscans pro Request).
  const allTxs = await prisma.transaction.findMany({
    where: { accountId, occurredAt: { lt: overallEnd } },
    select: { amountCents: true, categoryId: true, occurredAt: true }
  });

  // Alle Berechnungen in Integer-Cents im Speicher — keine weiteren DB-Abfragen nötig
  const quarters = months.map(({ month, year }, i) => {
    const startMs = starts[i].getTime();
    const endMs = ends[i].getTime();

    let income = 0;
    let outcome = 0;
    let savings = 0;
    let balance = 0;

    for (const t of allTxs) {
      const tMs = t.occurredAt.getTime();

      if (tMs < endMs) {
        balance += t.amountCents; // kumulativer Kontostand bis Monatsende
      }

      if (tMs >= startMs && tMs < endMs) {
        const amt = t.amountCents;
        if (amt >= 0) {
          income += amt;
        } else if (savingsCatId && t.categoryId === savingsCatId) {
          savings += -amt;
        } else {
          outcome += -amt;
        }
      }
    }

    return { month, year, incomeCents: income, outcomeCents: outcome, savingsCents: savings, balanceCents: balance };
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
