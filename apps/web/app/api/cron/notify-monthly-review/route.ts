/**
 * POST /api/cron/notify-monthly-review — „Dein Monats-Review ist bereit" (Teil C).
 *
 * Am 1. des Monats von einer Railway-Cron aufgerufen (Secret-Header, in der
 * Middleware ausgenommen). Sendet einen Push an alle Nutzer, die Monats-Review-
 * Benachrichtigungen aktiviert haben und mindestens ein Gerät registriert haben.
 */
import { NextResponse } from "next/server";

import { isAuthorizedCron } from "../../../../lib/cronAuth";
import { prisma } from "../../../../lib/prisma";
import { sendPushToUser } from "../../../../lib/push";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Nur Nutzer mit aktiviertem Opt-in UND mindestens einer Subscription.
  const users = await prisma.user.findMany({
    where: { notifyMonthlyReview: true, pushSubscriptions: { some: {} } },
    select: { id: true, locale: true }
  });

  let sent = 0;
  for (const user of users) {
    const isDe = user.locale !== "en";
    sent += await sendPushToUser(user.id, {
      title: isDe ? "Monats-Review bereit" : "Monthly review ready",
      body: isDe ? "Dein Rückblick auf den letzten Monat ist da." : "Your recap of last month is ready.",
      url: "/review",
      tag: "monthly-review"
    });
  }

  return NextResponse.json({ ok: true, sent, users: users.length });
}
