/**
 * GET  /api/household/invites — Offene (nicht angenommene, nicht abgelaufene)
 *                               Einladungen des Haushalts. Ohne Token.
 * POST /api/household/invites — Neue Einladung erstellen (nur OWNER). Gibt den
 *                               Klartext-Token EINMALIG zurück, damit die UI
 *                               einen Einladungs-Link / QR bauen kann.
 *
 * Teil D. Token-Sicherheit spiegelt den Passwort-Reset-Flow: nur der SHA-256-
 * Hash wird gespeichert, Einladungen laufen ab und sind einmalig verwendbar.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "../../../../env";
import { getSessionUser } from "../../../../lib/auth";
import { createInviteToken, INVITE_TOKEN_TTL_MS } from "../../../../lib/householdInvite";
import { prisma } from "../../../../lib/prisma";

const CreateInviteInput = z.object({
  email: z.string().email().optional(),
  role: z.enum(["MEMBER", "OWNER"]).optional()
});

function resolveBaseUrl(request: Request): string | null {
  const configured = env.NEXTAUTH_URL ?? env.NUXTAUTH_URL;
  if (configured) {
    const withProtocol = configured.startsWith("http") ? configured : `https://${configured}`;
    return withProtocol.replace(/\/+$/, "");
  }
  if (env.NODE_ENV !== "production") return new URL(request.url).origin;
  return null;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invites = await prisma.householdInvite.findMany({
    where: { householdId: user.householdId, acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, role: true, expiresAt: true, createdAt: true }
  });
  return NextResponse.json(invites);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json().catch(() => ({}));
  const parsed = CreateInviteInput.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { token, tokenHash } = createInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_MS);

  const invite = await prisma.householdInvite.create({
    data: {
      householdId: user.householdId,
      email: parsed.data.email ?? null,
      role: parsed.data.role ?? "MEMBER",
      tokenHash,
      expiresAt
    },
    select: { id: true, email: true, role: true, expiresAt: true, createdAt: true }
  });

  // Der Klartext-Token wird NUR hier ausgegeben (wie der Reset-Link).
  const base = resolveBaseUrl(req);
  const url = base ? `${base}/haushalt/beitreten?token=${token}` : null;

  return NextResponse.json({ ...invite, token, url }, { status: 201 });
}
