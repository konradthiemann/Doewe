/**
 * POST /api/push/test — Test-Push an alle Geräte des Nutzers (Teil C, Settings).
 *
 * Authentifizierung: Pflicht (401 sonst). Antwortet mit der Anzahl zugestellter
 * Pushes. `sent: 0` bei fehlender VAPID-Konfiguration oder ohne Subscription.
 */
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { sendPushToUser } from "../../../../lib/push";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { locale: true } });
  const isDe = me?.locale !== "en";

  const sent = await sendPushToUser(user.id, {
    title: isDe ? "Test-Benachrichtigung" : "Test notification",
    body: isDe ? "Web Push funktioniert auf diesem Gerät." : "Web Push works on this device.",
    url: "/settings",
    tag: "test"
  });

  return NextResponse.json({ ok: true, sent });
}
