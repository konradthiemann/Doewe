/**
 * GET /api/tax?year=YYYY — Steuerrelevante Transaktionen eines Jahres
 *
 * Authentifizierung: Pflicht (401). Liefert alle als steuerrelevant
 * vorgemerkten Transaktionen des Jahres (UTC-Grenzen auf occurredAt) inkl.
 * Kategorie und Beleg-Metadaten (nie die Datei-Bytes) sowie Summen je
 * Kategorie. year: 2000–2100, Default = aktuelles Jahr, sonst 400.
 */
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const yearParam = url.searchParams.get("year");
  const year = yearParam === null ? new Date().getFullYear() : Number(yearParam);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      account: { userId: user.id },
      taxRelevant: true,
      occurredAt: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1))
      }
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

  const sums = new Map<
    string | null,
    { categoryId: string | null; categoryName: string | null; totalCents: number; count: number; withReceiptCount: number }
  >();
  for (const tx of transactions) {
    const key = tx.category?.id ?? null;
    const entry = sums.get(key) ?? {
      categoryId: tx.category?.id ?? null,
      categoryName: tx.category?.name ?? null,
      totalCents: 0,
      count: 0,
      withReceiptCount: 0
    };
    entry.totalCents += tx.amountCents;
    entry.count += 1;
    if (tx.attachments.length > 0) entry.withReceiptCount += 1;
    sums.set(key, entry);
  }
  const categorySums = Array.from(sums.values()).sort(
    (a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents)
  );

  return NextResponse.json({ year, transactions, categorySums });
}
