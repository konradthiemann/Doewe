/**
 * GET /api/sync/pull — Zwei-Wege-Sync, Pull-Richtung (Phase 3b).
 *
 * Authentifizierung: Pflicht (401 sonst).
 * Autorisierung: Alle Queries über `householdId` (Teil D).
 *
 * v1 liefert einen vollständigen Haushalts-Snapshot (kein Delta-Cursor):
 * lebende (nicht getombstonete) Accounts, Kategorien, Transaktionen, Budgets
 * und Daueraufträge. Der Soft-Delete-Filter aus `lib/prisma.ts` blendet
 * getombstonete Zeilen automatisch aus — der Client ersetzt seinen Cache damit
 * komplett, gelöschte Zeilen verschwinden also von selbst.
 *
 * ETag/304: Über den Inhalts-Hash bricht ein unveränderter Snapshot früh ab
 * (304, kein Body), damit häufiges Pollen billig bleibt.
 */
import { createHash } from "crypto";

import { NextResponse } from "next/server";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdScope = { account: { householdId: user.householdId } };

  const [accounts, categories, transactions, budgets, recurring] = await Promise.all([
    prisma.account.findMany({ where: { householdId: user.householdId } }),
    prisma.category.findMany({ where: { householdId: user.householdId } }),
    prisma.transaction.findMany({ where: householdScope, orderBy: { occurredAt: "desc" } }),
    prisma.budget.findMany({ where: householdScope }),
    prisma.recurringTransaction.findMany({ where: householdScope })
  ]);

  const snapshot = { accounts, categories, transactions, budgets, recurring };
  const body = JSON.stringify(snapshot);
  const etag = `"${createHash("sha1").update(body).digest("hex")}"`;

  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "application/json", ETag: etag }
  });
}
