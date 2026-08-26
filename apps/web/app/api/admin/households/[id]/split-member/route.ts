/**
 * POST /api/admin/households/:id/split-member — trennt ein Mitglied aus dem
 * Haushalt heraus in einen neuen, eigenen Haushalt, aufgerufen vom Symfony-
 * Control-Plane-Backend.
 *
 * Auth: `Authorization: Bearer <DOEWE_SERVICE_TOKEN>` (isAuthorizedService),
 * NICHT die Household-Session — analog zu `admin/stats/route.ts`, dieser
 * Endpoint übergreift bewusst Haushaltsgrenzen (Teil D) und hat keine
 * zusätzliche Ownership-Prüfung über den Token hinaus (gleiche Form wie
 * `lib/cronAuth.ts`-geschützte Endpoints).
 *
 * Produktentscheidung: historische Transaktionen/Konten/Kategorien bleiben im
 * ALTEN Haushalt, das ausscheidende Mitglied startet mit einem leeren neuen
 * Solo-Haushalt (OWNER) — identisch zu `provisionFreshHousehold()`, das schon
 * heute von `household/members/[userId]` DELETE genutzt wird. Diese Route
 * ruft dieselbe Funktion auf, statt die Logik zu duplizieren.
 *
 * Body: `{ userId: string }`
 *
 * Body-Shape (Antwort): `{ ok: true, newHouseholdId: string }`
 */
import { NextResponse } from "next/server";

import { logAdminAction, CONTROL_PLANE_ACTOR } from "../../../../../../lib/adminActionLog";
import { prisma } from "../../../../../../lib/prisma";
import { isAuthorizedService } from "../../../../../../lib/serviceAuth";
import { provisionFreshHousehold } from "../../../../../../lib/userProvisioning";

import { SplitMemberInput } from "./schema";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthorizedService(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = SplitMemberInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { userId } = parsed.data;

  const membership = await prisma.householdMember.findUnique({
    where: { userId },
    select: { householdId: true, user: { select: { name: true } } }
  });
  if (!membership || membership.householdId !== params.id) {
    return NextResponse.json({ error: "Member not found in household" }, { status: 404 });
  }

  const newHouseholdId = await provisionFreshHousehold({ userId, name: membership.user.name ?? null });

  await logAdminAction({
    actor: CONTROL_PLANE_ACTOR,
    action: "split",
    targetType: "household",
    targetId: params.id,
    metadata: { userId, newHouseholdId }
  });

  return NextResponse.json({ ok: true, newHouseholdId });
}
