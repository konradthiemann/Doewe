/**
 * GET /api/notifications/settings — Benachrichtigungs-Einstellungen des Nutzers
 * PUT /api/notifications/settings — Einstellungen (teil-)aktualisieren
 *
 * Authentifizierung: Pflicht (401 sonst). Liefert die beiden Push-Opt-outs
 * (Budget-Warnungen, Monats-Review) plus die Erfassungs-Reminder-Konfiguration.
 * Der Reminder-Datensatz wird per Upsert lazily angelegt.
 */
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

import { NotificationSettingsInput } from "./schema";

const REMINDER_DEFAULTS = {
  enabled: false,
  time: "20:00",
  weekdays: 127,
  timezone: "Europe/Berlin",
  smartSuppress: true
};

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [me, reminder] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { notifyBudgetAlerts: true, notifyMonthlyReview: true }
    }),
    prisma.reminderSetting.findUnique({ where: { userId: user.id } })
  ]);

  return NextResponse.json({
    notifyBudgetAlerts: me?.notifyBudgetAlerts ?? true,
    notifyMonthlyReview: me?.notifyMonthlyReview ?? true,
    reminder: reminder
      ? {
          enabled: reminder.enabled,
          time: reminder.time,
          weekdays: reminder.weekdays,
          timezone: reminder.timezone,
          smartSuppress: reminder.smartSuppress
        }
      : REMINDER_DEFAULTS
  });
}

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = NotificationSettingsInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { notifyBudgetAlerts, notifyMonthlyReview, reminder } = parsed.data;

  if (notifyBudgetAlerts !== undefined || notifyMonthlyReview !== undefined) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(notifyBudgetAlerts !== undefined ? { notifyBudgetAlerts } : {}),
        ...(notifyMonthlyReview !== undefined ? { notifyMonthlyReview } : {})
      }
    });
  }

  if (reminder) {
    await prisma.reminderSetting.upsert({
      where: { userId: user.id },
      update: reminder,
      create: { userId: user.id, ...REMINDER_DEFAULTS, ...reminder }
    });
  }

  return NextResponse.json({ ok: true });
}
