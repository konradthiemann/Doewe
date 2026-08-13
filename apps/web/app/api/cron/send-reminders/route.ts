/**
 * POST /api/cron/send-reminders — Erfassungs-Reminder (Teil C, 5.3).
 *
 * Von einer Railway-Cron alle ~15 Min aufgerufen (Secret-Header, in der
 * Middleware ausgenommen). Selektiert aktivierte Reminder, deren lokale Zeit im
 * aktuellen 15-Min-Fenster am passenden Wochentag liegt, wendet Smart-Suppression
 * (heute schon erfasst?) an und sendet höchstens 1× pro Tag einen Push.
 */
import { isReminderDue, isReminderWeekday, parseTimeToMinutes } from "@doewe/shared";
import { NextResponse } from "next/server";

import { isAuthorizedCron } from "../../../../lib/cronAuth";
import { prisma } from "../../../../lib/prisma";
import { sendPushToUser } from "../../../../lib/push";
import { localTimeIn } from "../../../../lib/timezone";

export const dynamic = "force-dynamic";

const WINDOW_MINUTES = 15;

export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const settings = await prisma.reminderSetting.findMany({
    where: { enabled: true },
    include: { user: { select: { id: true, locale: true, accounts: { select: { id: true } } } } }
  });

  let sent = 0;

  for (const setting of settings) {
    const targetMinutes = parseTimeToMinutes(setting.time);
    if (targetMinutes === null) continue;

    const local = localTimeIn(now, setting.timezone);
    if (!isReminderWeekday(setting.weekdays, local.weekday)) continue;
    if (!isReminderDue({ targetMinutes, localMinutes: local.localMinutes, windowMinutes: WINDOW_MINUTES })) {
      continue;
    }

    // Dedupe: maximal eine Erinnerung pro lokalem Tag.
    if (setting.lastSentOn) {
      const lastKey = localTimeIn(setting.lastSentOn, setting.timezone).dayKey;
      if (lastKey === local.dayKey) continue;
    }

    // Smart-Suppression: heute in der User-TZ schon etwas erfasst? → nicht nerven.
    if (setting.smartSuppress) {
      const accountIds = setting.user.accounts.map((a) => a.id);
      if (accountIds.length > 0) {
        const bookedToday = await prisma.transaction.count({
          where: { accountId: { in: accountIds }, createdAt: { gte: local.dayStartUtc } }
        });
        if (bookedToday > 0) {
          // Als „erledigt für heute" markieren, damit spätere Fenster nicht doch senden.
          await prisma.reminderSetting.update({ where: { id: setting.id }, data: { lastSentOn: now } });
          continue;
        }
      }
    }

    const isDe = setting.user.locale !== "en";
    const delivered = await sendPushToUser(setting.user.id, {
      title: isDe ? "Erfassung nicht vergessen" : "Don't forget to log",
      body: isDe ? "Schon alles erfasst? Dauert nur 2 Minuten." : "Logged everything today? It only takes 2 minutes.",
      url: "/transactions",
      tag: "reminder"
    });

    await prisma.reminderSetting.update({ where: { id: setting.id }, data: { lastSentOn: now } });
    sent += delivered;
  }

  return NextResponse.json({ ok: true, sent });
}
