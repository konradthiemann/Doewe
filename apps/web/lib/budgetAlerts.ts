import {
  isRecurringDueInMonth,
  monthKey,
  reachedBudgetThresholds,
  sumFlows,
  zonedMonth,
  zonedMonthRange
} from "@doewe/shared";

import { prisma } from "./prisma";
import { sendPushToUser } from "./push";
import { loadBookedOccurrenceKeys, occurrenceKey } from "./recurringPeriods";
import { loadSavingsCategoryIds } from "./savingsCategory";

/**
 * Budget-Warnungen (Teil C): Nach einer Transaktions-Mutation prüfen, ob eine
 * Kategorie-Budget-Schwelle (80 % / 100 %) erreicht wurde, und — falls neu —
 * einen Push an den Kontoinhaber senden. Dedupe über den BudgetAlertLog
 * (Unique auf [budgetId, year, month, threshold]), damit dieselbe Schwelle im
 * selben Monat nur einmal meldet.
 *
 * "Ausgegeben" je Kategorie ist dieselbe Zahl wie in /api/analytics/summary
 * (docs/calculations/00-grundregeln.md): die gebuchten Ausgaben der Kategorie
 * im Monat der Buchung (Kalender Europe/Berlin, alle Konten des Haushalts,
 * eingeordnet mit classifyFlow — Erstattungen mindern nichts, Buchungen einer
 * Spar-Kategorie sind keine Ausgaben) PLUS die geplanten Daueraufträge der
 * Kategorie: im Monat fällig, nicht übersprungen und für den Monat noch nicht
 * gebucht (siehe lib/recurringPeriods.ts).
 *
 * Bekannte Einschränkung: Als Budget wird nur ein Monats-Budget (`Budget`-Zeile
 * mit Kategorie, Monat und Jahr auf dem Konto der Buchung) gelesen. Budget-Pläne
 * (`CategoryBudgetPlan`), die die Oberfläche anlegt, lösen keine Warnung aus —
 * der BudgetAlertLog hängt an `budgetId`.
 */

/** Geplante Daueraufträge einer Kategorie im Monat (siehe oben), Ausgaben in Cents. */
async function plannedRecurringExpenseCents(
  householdId: string,
  categoryId: string,
  month: number,
  year: number,
  savingsIds: ReadonlySet<string>
): Promise<number> {
  const recurring = await prisma.recurringTransaction.findMany({
    where: { account: { householdId }, categoryId },
    select: { id: true, amountCents: true, categoryId: true, intervalMonths: true, nextOccurrence: true }
  });

  const due = recurring.filter((rec) => {
    const anchor = zonedMonth(rec.nextOccurrence);
    return isRecurringDueInMonth({
      nextYear: anchor.year,
      nextMonth: anchor.month,
      intervalMonths: rec.intervalMonths,
      year,
      month
    });
  });

  if (due.length === 0) return 0;
  const dueIds = due.map((r) => r.id);

  const skips = await prisma.recurringTransactionSkip.findMany({
    where: { recurringId: { in: dueIds }, year, month },
    select: { recurringId: true }
  });
  const skipped = new Set(skips.map((s) => s.recurringId));

  // Bereits gebuchte Vorkommen stecken schon in den gebuchten Ausgaben (oder
  // wurden vom Nutzer gelöscht/verschoben) — hier nicht nochmal addieren.
  const bookedKeys = await loadBookedOccurrenceKeys(dueIds);
  const period = monthKey({ year, month });

  const planned = due.filter((r) => !skipped.has(r.id) && !bookedKeys.has(occurrenceKey(r.id, period)));
  return sumFlows(planned, savingsIds).outcomeCents;
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

    // Monat der Buchung im App-Kalender (Europe/Berlin), halboffen [start, end).
    const { month, year } = zonedMonth(params.occurredAt);
    const { start, end } = zonedMonthRange(year, month);

    const budget = await prisma.budget.findFirst({
      where: { accountId, categoryId, month, year },
      select: {
        id: true,
        amountCents: true,
        category: { select: { name: true } },
        account: { select: { householdId: true } }
      }
    });
    if (!budget?.amountCents || budget.amountCents <= 0) return;

    const householdId = budget.account.householdId;
    const savingsIds = await loadSavingsCategoryIds(householdId);

    const bookedRows = await prisma.transaction.findMany({
      where: { account: { householdId }, categoryId, occurredAt: { gte: start, lt: end } },
      select: { amountCents: true, categoryId: true }
    });
    const bookedExpenseCents = sumFlows(bookedRows, savingsIds).outcomeCents;
    const recurringCents = await plannedRecurringExpenseCents(householdId, categoryId, month, year, savingsIds);
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
