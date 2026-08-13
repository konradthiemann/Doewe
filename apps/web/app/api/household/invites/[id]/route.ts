/**
 * DELETE /api/household/invites/[id] — Widerruft eine offene Einladung (nur
 * OWNER). Scope über `householdId`, damit man keine fremden Einladungen löschen
 * kann. Idempotent: eine bereits gelöschte/angenommene Einladung ergibt 404.
 */
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const invite = await prisma.householdInvite.findFirst({
    where: { id: params.id, householdId: user.householdId, acceptedAt: null },
    select: { id: true }
  });
  if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.householdInvite.delete({ where: { id: invite.id } });
  return NextResponse.json({ ok: true });
}
