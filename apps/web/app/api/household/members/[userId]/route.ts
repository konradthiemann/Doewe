/**
 * DELETE /api/household/members/[userId] — Der OWNER entfernt ein Mitglied aus
 * dem Haushalt. Das entfernte Mitglied erhält sofort einen eigenen, frischen
 * Haushalt (OWNER) mit Standard-Konto/-Kategorien, damit es nicht ausgesperrt
 * wird. Der OWNER kann sich nicht selbst entfernen.
 *
 * Teil D. Nur OWNER darf die Mitgliedschaft verwalten.
 */
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { provisionFreshHousehold } from "../../../../../lib/userProvisioning";

export async function DELETE(_req: Request, { params }: { params: { userId: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (params.userId === user.id) {
    return NextResponse.json({ error: "Owner cannot remove themselves" }, { status: 400 });
  }

  const membership = await prisma.householdMember.findUnique({
    where: { userId: params.userId },
    select: { householdId: true, user: { select: { name: true } } }
  });
  if (!membership || membership.householdId !== user.householdId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  await provisionFreshHousehold({ userId: params.userId, name: membership.user.name ?? null });

  return NextResponse.json({ ok: true });
}
