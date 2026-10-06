/**
 * GET /api/recurring-transactions/export?year=YYYY — CSV der wiederkehrenden Ausgaben
 *
 * Authentifizierung: Pflicht (401). Liefert pro Dauerauftrag die Monatsbeträge des
 * Jahres (Anker-Monat + Intervall, übersprungene Monate abgezogen). Einnahmen werden
 * ausgelassen; Sparen-Kategorien ("Sparen"/"Savings") stehen separat markiert und mit
 * eigener Summenzeile. Nur Daueraufträge des eigenen Haushalts, ohne Soft-Deletes.
 */
import { buildRecurringCsv, type RecurringExportItem } from "@doewe/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { SAVINGS_CATEGORY_NAMES } from "../../saving-plan/savings";

export const dynamic = "force-dynamic";

const ExportQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear())
});

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = ExportQuery.safeParse({ year: new URL(req.url).searchParams.get("year") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  const { year } = parsed.data;

  const rows = await prisma.recurringTransaction.findMany({
    where: { deletedAt: null, account: { householdId: user.householdId } },
    include: { category: true, skips: { where: { year } } },
    orderBy: { description: "asc" }
  });

  const items: RecurringExportItem[] = rows.map((r) => ({
    description: r.description,
    category: r.category?.name ?? "",
    isIncome: r.category?.isIncome ?? false,
    isSavings: SAVINGS_CATEGORY_NAMES.includes((r.category?.name ?? "").toLowerCase().trim()),
    amountCents: r.amountCents,
    intervalMonths: r.intervalMonths,
    skippedMonths: r.skips.map((s) => s.month),
    nextYear: r.nextOccurrence.getFullYear(),
    nextMonth: r.nextOccurrence.getMonth() + 1
  }));

  // BOM so Excel opens the UTF-8 file with correct umlauts.
  return new Response("\uFEFF" + buildRecurringCsv(items, year), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wiederkehrend-${year}.csv"`,
      "Cache-Control": "private, no-store"
    }
  });
}
