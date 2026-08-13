import { reachedBudgetThresholds } from "@doewe/shared";

import { prisma } from "./prisma";
import { sendPushToUser } from "./push";

/**
 * Budget-Warnungen (Teil C): Nach einer Transaktions-Mutation prüfen, ob eine
 * Kategorie-Budget-Schwelle (80 % / 100 %) erreicht wurde, und — falls neu —
 * einen Push an den Kontoinhaber senden. Dedupe über den BudgetAlertLog
 * (Unique auf [budgetId, year, month, threshold]), damit dieselbe Schwelle im
 * selben Monat nur einmal meldet.
 *
 * Der Ausgaben-Betrag pro Kategorie spiegelt die Logik aus
 * /api/analytics/summary: gebuchte Ausgaben (negative Beträge, Betragsbetrag)
 * PLUS aktive Daueraufträge dieser Kategorie im Monat.
 */

/** Monat (1-12) + Jahr eines Datums. */
function monthYearOf(date: Date) {
  return { month: date.getMonth() + 1, year: date.getFullYear() };
}

/** Aktive (nicht geskippte) Daueraufträge einer Kategorie im Monat, Ausgaben in Cents. */
async function recurringExpenseCents(
  accountId: string,
  categoryId: string,
  month: number,
  year: number
): Promise<number> {
  const recurring = await prisma.recurringTransaction.findMany({
    where: { accountId, categoryId },
    select: { id: true, amountCents: true, intervalMonths: true, nextOccurrence: true }
  });

  const active = recurring.filter((rec) => {
    const nextDate = new Date(rec.nextOccurrence);
    const nextYear = nextDate.getFullYear();
    const nextMonth = nextDate.getMonth() + 1;
    if (nextYear === year && nextMonth === month) return true;
    const interval = rec.intervalMonths || 1;
    const monthsSinceNext = (year - nextYear) * 12 + (month - nextMonth);
    return monthsSinceNext >= 0 && monthsSinceNext % interval === 0;
  });

  if (active.length === 0) return 0;

  const skips = await prisma.recurringTransactionSkip.findMany({
    where: { recurringId: { in: active.map((r) => r.id) }, year, month },
    select: { recurringId: true }
  });
  const skipped = new Set(skips.map((s) => s.recurringId));

  return active
    .filter((r) => !skipped.has(r.id))
    .reduce((sum, r) => (r.amountCents < 0 ? sum + -r.amountCents : sum), 0);
}

/**
 * Prüft die Budget-Schwellen der Kategorie für den Monat der Transaktion und
 * versendet ggf. neue Warn-Pushes. Fehler werden geschluckt (Fire-and-forget aus
 * dem Request-Pfad) — die Mutation selbst darf nie an einem Push-Problem scheitern.
 */
export async function checkBudgetAlerts(params: {
  accountId: string;
  userId: string;
  categoryId: string | null;
  occurredAt: Date;
}): Promise<void> {
  const { accountId, userId, categoryId } = params;
  if (!categoryId) return;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notifyBudgetAlerts: true, locale: true }
    });
    if (!user?.notifyBudgetAlerts) return;

    const { month, year } = monthYearOf(params.occurredAt);

    const budget = await prisma.budget.findFirst({
      where: { accountId, categoryId, month, year },
      select: { id: true, amountCents: true, category: { select: { name: true } } }
    });
    if (!budget?.amountCents || budget.amountCents <= 0) return;

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    const spentAgg = await prisma.transaction.aggregate({
      where: { accountId, categoryId, amountCents: { lt: 0 }, occurredAt: { gte: start, lt: end } },
      _sum: { amountCents: true }
    });
    const bookedExpenseCents = -(spentAgg._sum.amountCents ?? 0);
    const recurringCents = await recurringExpenseCents(accountId, categoryId, month, year);
    const spentCents = bookedExpenseCents + recurringCents;

    const reached = reachedBudgetThresholds(spentCents, budget.amountCents);
    if (reached.length === 0) return;

    // Nur die HÖCHSTE erreichte Schwelle ist relevant (100 % schließt 80 % ein).
    const highest = Math.max(...reached);

    // Idempotenz: den Versand der höchsten Schwelle atomar "reservieren".
    // Der Unique-Constraint [budgetId, year, month, threshold] macht den zweiten
    // Trigger derselben Schwelle zum No-op.
    try {
      await prisma.budgetAlertLog.create({
        data: { budgetId: budget.id, year, month, threshold: highest }
      });
    } catch {
      // Höchste Schwelle wurde bereits gemeldet → nichts zu tun.
      return;
    }

    // Alle niedrigeren erreichten Schwellen als "gesendet" markieren, damit sie
    // später nie mehr einzeln nachfeuern (z. B. 80 % nach bereits gemeldeten 100 %).
    for (const lower of reached.filter((t) => t < highest)) {
      await prisma.budgetAlertLog
        .create({ data: { budgetId: budget.id, year, month, threshold: lower } })
        .catch(() => undefined);
    }

    const categoryName = budget.category?.name ?? "";
    const isDe = user.locale !== "en";
    const title = isDe ? "Budget-Warnung" : "Budget alert";
    const body = isDe
      ? `${categoryName}: Budget zu ${highest} % ausgeschöpft.`
      : `${categoryName}: budget ${highest}% used.`;
    await sendPushToUser(userId, { title, body, url: "/dashboard", tag: `budget-${budget.id}` });
  } catch {
    // Push-/DB-Fehler dürfen die auslösende Mutation nicht beeinflussen.
  }
}
