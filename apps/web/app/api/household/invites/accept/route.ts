/**
 * POST /api/household/invites/accept — Der eingeloggte Nutzer nimmt eine
 * Einladung an und wechselt in den einladenden Haushalt.
 *
 * Sicherheit (spiegelt reset-password):
 * - Rate-Limit pro IP gegen Token-Erraten.
 * - Nachschlagen nur über den SHA-256-Hash; Klartext-Token wird nie gespeichert.
 * - Einladung muss offen (`acceptedAt: null`) und gültig (`expiresAt > now`) sein.
 *
 * v1-Beschränkung (kein Haushalts-Merge): nur ein „frischer" Account ohne
 * eigene Daten darf beitreten. Hat der Nutzer bereits Transaktionen, Budgets
 * oder wiederkehrende Buchungen, wird der Beitritt mit 409 abgelehnt.
 *
 * Beim Beitritt wird der bisherige (frische) Haushalt des Nutzers verwaist und
 * per Cascade gelöscht (Account + Kategorien hängen via onDelete: Cascade daran).
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../../lib/auth";
import { hashInviteToken } from "../../../../../lib/householdInvite";
import { prisma } from "../../../../../lib/prisma";
import { enforceRateLimit, getClientIp } from "../../../../../lib/rateLimit";

const AcceptInput = z.object({ token: z.string().min(1) });

export async function POST(req: Request) {
  const rateLimited = enforceRateLimit(`invite-accept:${getClientIp(req)}`, 10, 60_000);
  if (rateLimited) return rateLimited;

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => ({}));
  const parsed = AcceptInput.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const tokenHash = hashInviteToken(parsed.data.token);
  const invite = await prisma.householdInvite.findUnique({
    where: { tokenHash },
    select: { id: true, householdId: true, role: true, acceptedAt: true, expiresAt: true }
  });

  if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
    return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
  }

  // Bereits Mitglied dieses Haushalts — nichts zu tun (idempotent-freundlich).
  if (invite.householdId === user.householdId) {
    return NextResponse.json({ error: "Already a member of this household" }, { status: 409 });
  }

  // v1: nur frische Accounts dürfen beitreten (kein Merge zweier Datenbestände).
  const [txCount, budgetCount, recurringCount] = await Promise.all([
    prisma.transaction.count({ where: { account: { householdId: user.householdId } } }),
    prisma.budget.count({ where: { account: { householdId: user.householdId } } }),
    prisma.recurringTransaction.count({ where: { account: { householdId: user.householdId } } })
  ]);
  if (txCount > 0 || budgetCount > 0 || recurringCount > 0) {
    return NextResponse.json(
      { error: "HAS_OWN_DATA", message: "Nur ein leerer Account kann einem Haushalt beitreten." },
      { status: 409 }
    );
  }

  const oldHouseholdId = user.householdId;

  await prisma.$transaction([
    prisma.householdInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() }
    }),
    prisma.householdMember.update({
      where: { userId: user.id },
      data: { householdId: invite.householdId, role: invite.role }
    }),
    // Der bisherige (leere) Haushalt hat jetzt kein Mitglied mehr — löschen.
    // Account + Kategorien folgen per onDelete: Cascade.
    prisma.household.delete({ where: { id: oldHouseholdId } })
  ]);

  return NextResponse.json({ ok: true, householdId: invite.householdId });
}
