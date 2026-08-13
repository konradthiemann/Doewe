/**
 * POST   /api/push/subscription — Gerät für Web Push registrieren (Teil C)
 * DELETE /api/push/subscription — Registrierung dieses Geräts entfernen
 *
 * Authentifizierung: Pflicht (401 sonst).
 * Idempotent über den eindeutigen `endpoint`: erneutes Registrieren desselben
 * Geräts aktualisiert nur die Keys + lastSeenAt. Wechselt der Endpoint den
 * Nutzer (z. B. geteiltes Gerät), wird er dem aktuellen Nutzer zugeordnet.
 */
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

import { PushSubscriptionInput, PushUnsubscribeInput } from "./schema";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = PushSubscriptionInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { endpoint, keys, userAgent } = parsed.data;

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent, lastSeenAt: new Date() },
    create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent }
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = PushUnsubscribeInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Nur eigene Subscriptions löschbar (endpoint ist unique, userId schützt zusätzlich).
  await prisma.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, userId: user.id }
  });

  return NextResponse.json({ ok: true });
}
