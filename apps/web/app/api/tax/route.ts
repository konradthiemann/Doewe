/**
 * GET /api/tax?year=YYYY — Steuerrelevante Transaktionen eines Jahres
 *
 * Authentifizierung: Pflicht (401). Liefert alle als steuerrelevant
 * vorgemerkten Transaktionen des Jahres inkl. Kategorie und Beleg-Metadaten
 * (nie die Datei-Bytes) sowie Summen je Kategorie. Das Jahr ist das
 * Kalenderjahr in Europe/Berlin von occurredAt (siehe
 * docs/calculations/00-grundregeln.md): eine Buchung vom 1. Januar 00:30 Uhr
 * gehört ins neue Steuerjahr. year: 2000–2100, Default = aktuelles Jahr
 * (ebenfalls Berlin), sonst 400.
 */
import { groupTaxTransactionsByCategory, zonedDate, zonedYearRange } from "@doewe/shared";
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const yearParam = url.searchParams.get("year");
  const year = yearParam === null ? zonedDate(new Date()).year : Number(yearParam);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const { start, end } = zonedYearRange(year);
  const transactions = await prisma.transaction.findMany({
    where: {
      account: { householdId: user.householdId },
      taxRelevant: true,
      occurredAt: { gte: start, lt: end }
    },
    orderBy: { occurredAt: "desc" },
    select: {
      id: true,
      amountCents: true,
      description: true,
      occurredAt: true,
      category: { select: { id: true, name: true } },
      attachments: {
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  const { categorySums } = groupTaxTransactionsByCategory(transactions);

  return NextResponse.json({ year, transactions, categorySums });
}
