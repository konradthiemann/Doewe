/**
 * GET /api/recurring-transactions/yearly?year=YYYY — Jahresmatrix der Daueraufträge
 *
 * Authentifizierung: Pflicht (401). Liefert eine RecurringYearMatrix (siehe
 * @doewe/shared): pro Dauerauftrag die Monatsbeträge des Jahres (Anker-Monat +
 * Intervall, übersprungene Monate = 0), gruppiert in Einnahmen/Ausgaben/Sparen mit
 * Summen, Saldo und Monatsdurchschnitt. Haushaltsbezogen, ohne Soft-Deletes. Kein
 * DEMO-Ausschluss: der Demo-Nutzer sieht nur seine eigenen Daten.
 */
import {
  buildRecurringYearMatrix,
  classifyRecurringKind,
  type RecurringYearItem
} from "@doewe/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { SAVINGS_CATEGORY_NAMES } from "../../saving-plan/savings";

export const dynamic = "force-dynamic";

const YearlyQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear())
});

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = YearlyQuery.safeParse({ year: new URL(req.url).searchParams.get("year") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  const { year } = parsed.data;

  // The soft-delete extension in lib/prisma.ts already excludes deletedAt rows.
  const rows = await prisma.recurringTransaction.findMany({
    where: { account: { householdId: user.householdId } },
    include: { category: true, skips: { where: { year } } },
    orderBy: { description: "asc" }
  });

  const items: RecurringYearItem[] = rows.map((r) => {
    const isSavings = SAVINGS_CATEGORY_NAMES.includes((r.category?.name ?? "").toLowerCase().trim());
    return {
      id: r.id,
      description: r.description,
      categoryId: r.categoryId ?? null,
      categoryName: r.category?.name ?? null,
      kind: classifyRecurringKind(r.amountCents, isSavings),
      amountCents: r.amountCents,
      intervalMonths: r.intervalMonths,
      skippedMonths: r.skips.map((s) => s.month),
      nextYear: r.nextOccurrence.getFullYear(),
      nextMonth: r.nextOccurrence.getMonth() + 1
    };
  });

  return NextResponse.json(buildRecurringYearMatrix(items, year));
}
