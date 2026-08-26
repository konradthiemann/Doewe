/**
 * POST /api/admin/users/:id/suspend — setzt oder löscht `suspendedAt` für
 * einen Nutzer, aufgerufen vom Symfony-Control-Plane-Backend.
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
 * Body: `{ suspended: boolean }`
 *
 * Body-Shape (Antwort): `{ ok: true, suspendedAt: string | null }`
 */
import { NextResponse } from "next/server";

import { logAdminAction, CONTROL_PLANE_ACTOR } from "../../../../../../lib/adminActionLog";
import { prisma } from "../../../../../../lib/prisma";
import { isAuthorizedService } from "../../../../../../lib/serviceAuth";

import { SuspendUserInput } from "./schema";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthorizedService(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = SuspendUserInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const suspended = parsed.data.suspended;
  const updated = await prisma.user.update({
    where: { id: params.id },
    data: { suspendedAt: suspended ? new Date() : null }
  });

  await logAdminAction({
    actor: CONTROL_PLANE_ACTOR,
    action: suspended ? "suspend" : "unsuspend",
    targetType: "user",
    targetId: params.id
  });

  return NextResponse.json({ ok: true, suspendedAt: updated.suspendedAt });
}
