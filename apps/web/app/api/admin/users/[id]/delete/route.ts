/**
 * POST /api/admin/users/:id/delete — Soft-Delete eines Nutzers (setzt
 * `deletedAt`), aufgerufen vom Symfony-Control-Plane-Backend.
 *
 * Bewusst NIEMALS ein Hard-Delete (Produktentscheidung) — der Datensatz
 * bleibt erhalten, nur der Zugriff wird entzogen.
 *
 * Auth: `Authorization: Bearer <DOEWE_SERVICE_TOKEN>` (isAuthorizedService),
 * NICHT die Household-Session — analog zu `admin/stats/route.ts`, dieser
 * Endpoint übergreift bewusst Haushaltsgrenzen (Teil D) und hat keine
 * zusätzliche Ownership-Prüfung über den Token hinaus (gleiche Form wie
 * `lib/cronAuth.ts`-geschützte Endpoints).
 *
 * Wirkung: Die nächste Session-Validierung dieses Nutzers (JWT-Callback in
 * `authOptions.ts`, spiegelt den `passwordChangedAt`-Mechanismus) evictet die
 * bestehende Session sofort — kein erneutes Login nötig, um es zu erzwingen.
 *
 * Kein Body. Idempotent: ein bereits gelöschter Nutzer bleibt gelöscht, kein
 * Fehler bei wiederholtem Aufruf.
 *
 * Body-Shape (Antwort): `{ ok: true, deletedAt: string }`
 */
import { NextResponse } from "next/server";

import { logAdminAction, CONTROL_PLANE_ACTOR } from "../../../../../../lib/adminActionLog";
import { prisma } from "../../../../../../lib/prisma";
import { isAuthorizedService } from "../../../../../../lib/serviceAuth";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthorizedService(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, deletedAt: true }
  });
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (existing.deletedAt) {
    return NextResponse.json({ ok: true, deletedAt: existing.deletedAt });
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: { deletedAt: new Date() }
  });

  await logAdminAction({
    actor: CONTROL_PLANE_ACTOR,
    action: "delete",
    targetType: "user",
    targetId: params.id
  });

  return NextResponse.json({ ok: true, deletedAt: updated.deletedAt });
}
