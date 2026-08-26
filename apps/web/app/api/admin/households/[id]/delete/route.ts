/**
 * POST /api/admin/households/:id/delete — Soft-Delete eines kompletten
 * Haushalts, aufgerufen vom Symfony-Control-Plane-Backend.
 *
 * Bewusst NIEMALS ein Hard-Delete (gleiche Produktentscheidung wie beim
 * Nutzer-Löschen) — Haushalt und Konten/Transaktionen bleiben erhalten, nur
 * der Zugriff wird entzogen.
 *
 * Auth: `Authorization: Bearer <DOEWE_SERVICE_TOKEN>` (isAuthorizedService),
 * NICHT die Household-Session — analog zu `admin/stats/route.ts`, dieser
 * Endpoint übergreift bewusst Haushaltsgrenzen (Teil D) und hat keine
 * zusätzliche Ownership-Prüfung über den Token hinaus.
 *
 * Wirkung: Setzt `Household.deletedAt` UND `deletedAt` auf jedem aktuellen
 * Mitglied — ein gelöschter Haushalt lässt niemanden mehr rein, nicht nur
 * "verschwindet" er aus der Übersicht. Nutzt denselben Session-Eviction-
 * Mechanismus wie das einzelne Nutzer-Löschen (jwt-Callback in
 * `authOptions.ts`), daher sofortige Wirkung ohne Re-Login.
 *
 * Kein Body. Idempotent: ein bereits gelöschter Haushalt bleibt gelöscht,
 * kein Fehler bei wiederholtem Aufruf (bereits gelöschte Mitglieder werden
 * dabei nicht erneut angefasst).
 *
 * Body-Shape (Antwort): `{ ok: true, deletedAt: string, memberCount: number }`
 */
import { NextResponse } from "next/server";

import { logAdminAction, CONTROL_PLANE_ACTOR } from "../../../../../../lib/adminActionLog";
import { prisma } from "../../../../../../lib/prisma";
import { isAuthorizedService } from "../../../../../../lib/serviceAuth";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthorizedService(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.household.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      deletedAt: true,
      members: { select: { userId: true } }
    }
  });
  if (!existing) {
    return NextResponse.json({ error: "Household not found" }, { status: 404 });
  }

  if (existing.deletedAt) {
    return NextResponse.json({ ok: true, deletedAt: existing.deletedAt, memberCount: existing.members.length });
  }

  const now = new Date();
  const memberIds = existing.members.map((m) => m.userId);

  await prisma.$transaction([
    prisma.household.update({ where: { id: params.id }, data: { deletedAt: now } }),
    prisma.user.updateMany({
      where: { id: { in: memberIds }, deletedAt: null },
      data: { deletedAt: now }
    })
  ]);

  await logAdminAction({
    actor: CONTROL_PLANE_ACTOR,
    action: "delete",
    targetType: "household",
    targetId: params.id,
    metadata: { memberIds }
  });

  return NextResponse.json({ ok: true, deletedAt: now, memberCount: memberIds.length });
}
