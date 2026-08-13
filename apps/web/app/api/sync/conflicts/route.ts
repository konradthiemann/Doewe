/**
 * GET /api/sync/conflicts — jüngste Sync-Konflikte des Haushalts (Phase 3b).
 *
 * Authentifizierung: Pflicht (401 sonst). Autorisierung über `householdId`.
 *
 * Speist die dezente „auf einem anderen Gerät geändert"-Meldung: sobald bei
 * `POST /api/sync/push` ein Feld per Last-Write-Wins überschrieben wurde,
 * landet der verlorene Wert im ConflictLog. Der Client pollt diese Liste bei
 * Reconnect/Fokus und blendet einmalig einen Hinweis ein.
 *
 * Bewusst schlank: nur die letzten 7 Tage, gedeckelt auf 50 Einträge.
 */
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const items = await prisma.conflictLog.findMany({
    where: { householdId: user.householdId, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return NextResponse.json(items);
}
