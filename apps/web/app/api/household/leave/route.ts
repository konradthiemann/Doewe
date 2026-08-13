/**
 * POST /api/household/leave — Der eingeloggte Nutzer verlässt den geteilten
 * Haushalt und erhält wieder einen eigenen, frischen Haushalt (OWNER) mit
 * Standard-Konto und -Kategorien.
 *
 * Teil D. Nur MEMBER können gehen: ein OWNER würde die gemeinsamen Daten
 * zurücklassen (Eigentümerwechsel / Haushalt-Löschung ist nicht Teil von v1).
 * Ohne Mitgliedschaft würde getSessionUser() den Nutzer aussperren — deshalb
 * wird atomar sofort ein neuer Haushalt bereitgestellt.
 */
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { provisionFreshHousehold } from "../../../../lib/userProvisioning";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.role === "OWNER") {
    return NextResponse.json({ error: "Owner cannot leave own household" }, { status: 403 });
  }

  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
  const householdId = await provisionFreshHousehold({ userId: user.id, name: me?.name ?? null });

  return NextResponse.json({ ok: true, householdId });
}
