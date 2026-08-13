/**
 * GET   /api/household — Der Haushalt des Nutzers samt Mitgliederliste.
 * PATCH /api/household — Haushalt umbenennen (nur OWNER).
 *
 * Teil D — Haushalts-Sharing. Der Haushalt ist die Mandanten-Grenze; alle
 * Domänen-Daten hängen an ihm. Auth-Guard via getSessionUser(); die Rolle
 * (OWNER/MEMBER) steckt bereits in der aufgelösten Session.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

const RenameInput = z.object({
  name: z.string().trim().min(1).max(80)
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const household = await prisma.household.findUnique({
    where: { id: user.householdId },
    select: {
      id: true,
      name: true,
      members: {
        orderBy: { joinedAt: "asc" },
        select: {
          role: true,
          joinedAt: true,
          user: { select: { id: true, name: true, email: true } }
        }
      }
    }
  });
  if (!household) return NextResponse.json({ error: "Household not found" }, { status: 404 });

  return NextResponse.json({
    id: household.id,
    name: household.name,
    role: user.role,
    members: household.members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      joinedAt: m.joinedAt,
      isMe: m.user.id === user.id
    }))
  });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = RenameInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.household.update({
    where: { id: user.householdId },
    data: { name: parsed.data.name },
    select: { id: true, name: true }
  });
  return NextResponse.json(updated);
}
