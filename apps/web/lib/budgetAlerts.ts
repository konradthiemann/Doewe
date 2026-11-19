import {
  isRecurringDueInMonth,
  monthKey,
  reachedBudgetThresholds,
  sumFlows,
  zonedMonth,
  zonedMonthRange
} from "@doewe/shared";

import { loadEffectiveCategoryBudgets } from "./categoryBudgets";
import { prisma } from "./prisma";
import { sendPushToUser } from "./push";
import { loadBookedOccurrenceKeys, occurrenceKey } from "./recurringPeriods";
import { loadSavingsCategoryIds } from "./savingsCategory";

/**
 * Budget-Warnungen (Teil C): Nach einer Buchung prüfen, ob die Kategorie eine
 * Budget-Schwelle (80 % / 100 %) erreicht hat, und — falls neu — einen Push an
 * alle Mitglieder des Haushalts senden, die `notifyBudgetAlerts` eingeschaltet
 * haben, jeweils in ihrer Sprache.
 *
 * Dedupe über den BudgetAlertLog, Unique auf
 * [householdId, categoryId, year, month, threshold]: Dieselbe Schwelle meldet
 * im selben Monat nur einmal, egal wer bucht und auf welchem Konto. Der
 * Schlüssel braucht keine `Budget`-Zeile, die Warnung gilt deshalb für
 * Budget-Pläne genauso wie für Monats-Budgets. Zeilen aus der Zeit davor
 * (mit `budgetId`) hat die Migration um Haushalt und Kategorie ergänzt; sie
 * zählen weiter mit, eine schon gemeldete Schwelle meldet nicht erneut.
 *
 * "Ausgegeben" je Kategorie ist dieselbe Zahl wie in /api/analytics/summary
 * (docs/calculations/00-grundregeln.md): die gebuchten Ausgaben der Kategorie
 * im Monat der Buchung (Kalender Europe/Berlin, alle Konten des Haushalts,
 * eingeordnet mit classifyFlow — Erstattungen mindern nichts, Buchungen einer
 * Spar-Kategorie sind keine Ausgaben) PLUS die geplanten Daueraufträge der
 * Kategorie: im Monat fällig, nicht übersprungen und für den Monat noch nicht
 * gebucht (siehe lib/recurringPeriods.ts).
 *
 * Das Budget ist dieselbe Zahl wie auf dem Dashboard (lib/categoryBudgets.ts):
 * der Budget-Plan der Kategorie, sonst die Monats-Budgets des Haushalts
 * zusammen; für einen abgeschlossenen Monat der eingefrorene Stand.
 *
 * Aufgerufen nach dem Anlegen und nach dem Bearbeiten einer Buchung, je
 * gebuchter Gruppe eines Belegs und für den Kauf beim Abschluss eines
 * Sparziels. Sync und automatisch gebuchte Daueraufträge rufen die Prüfung
 * nicht auf.
 */

/** Geplante Daueraufträge einer Kategorie im Monat (siehe oben), Ausgaben in Cents. */
async function plannedRecurringExpenseCents(
  householdId: string,
  categoryId: string,
  month: number,
  year: number,
  savingsIds: ReadonlySet<string>
): Promise<number> {
  const period = monthKey({ year, month });
  const recurring = await prisma.recurringTransaction.findMany({
    where: { account: { householdId }, categoryId },
    select: {
      id: true,
      amountCents: true,
      categoryId: true,
      intervalMonths: true,
      nextOccurrence: true,
      bookFromPeriod: true
    }
  });

  const due = recurring.filter((rec) => {
    // Ein Vorkommen vor `bookFromPeriod` wird nie automatisch gebucht — es ist
    // nicht geplant. ("JJJJ-MM" sortiert als Text wie der Kalender.)
    if (rec.bookFromPeriod !== null && period < rec.bookFromPeriod) return false;
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

  const planned = due.filter((r) => !skipped.has(r.id) && !bookedKeys.has(occurrenceKey(r.id, period)));
  return sumFlows(planned, savingsIds).outcomeCents;
}

/**
 * Prüft die Budget-Schwellen der Kategorie für den Berliner Monat von
 * `occurredAt` und versendet ggf. neue Warn-Pushes an den Haushalt. Eine
 * Warnung gilt nur dem laufenden Monat: Liegt `occurredAt` in einem anderen
 * Berliner Monat (eine korrigierte alte oder eine vordatierte Buchung),
 * passiert nichts — kein Push, kein Log-Eintrag und kein Laden der Budgets,
 * das einen vergangenen Monat nebenbei einfrieren würde. Fehler werden
 * geschluckt (Fire-and-forget aus dem Request-Pfad) — die Mutation selbst darf
 * nie an einem Push-Problem scheitern.
 */
export async function checkBudgetAlerts(params: {
  householdId: string;
  categoryId: string | null;
  occurredAt: Date;
}): Promise<void> {
  const { householdId, categoryId } = params;
  if (!categoryId) return;

  try {
    // Month of the booking in the app calendar (Europe/Berlin). Only the
    // running month is alerted; this check comes before any query.
    const { month, year } = zonedMonth(params.occurredAt);
    const running = zonedMonth(new Date());
    if (running.year !== year || running.month !== month) return;
    // Halboffen [start, end).
    const { start, end } = zonedMonthRange(year, month);

    // Empfänger: alle Mitglieder des Haushalts, die die Warnung nicht
    // abgeschaltet haben. Ohne Empfänger wird nichts als gemeldet vermerkt —
    // wer die Warnung später einschaltet, erfährt die Schwelle dann noch.
    const recipients = await prisma.householdMember.findMany({
      where: { householdId, user: { notifyBudgetAlerts: true, deletedAt: null, suspendedAt: null } },
      select: { userId: true, user: { select: { locale: true } } },
      orderBy: { joinedAt: "asc" }
    });
    if (recipients.length === 0) return;

    const category = await prisma.category.findFirst({
      where: { id: categoryId, householdId },
      select: { name: true }
    });
    if (!category) return;

    // The amount is the budget the dashboard shows for this month: the plan if
    // the category has one, otherwise the household's per-month rows added up.
    const effectiveBudgets = await loadEffectiveCategoryBudgets({ householdId, year, month });
    const budgetCents = (effectiveBudgets[categoryId] as number | undefined) ?? 0;
    if (budgetCents <= 0) return;

    const savingsIds = await loadSavingsCategoryIds(householdId);

    const bookedRows = await prisma.transaction.findMany({
      where: { account: { householdId }, categoryId, occurredAt: { gte: start, lt: end } },
      select: { amountCents: true, categoryId: true }
    });
    const bookedExpenseCents = sumFlows(bookedRows, savingsIds).outcomeCents;
    const recurringCents = await plannedRecurringExpenseCents(householdId, categoryId, month, year, savingsIds);
    const spentCents = bookedExpenseCents + recurringCents;

    const reached = reachedBudgetThresholds(spentCents, budgetCents);
    if (reached.length === 0) return;

    // Nur die HÖCHSTE erreichte Schwelle ist relevant (100 % schließt 80 % ein).
    const highest = Math.max(...reached);
    const key = { householdId, categoryId, year, month };

    // Idempotenz: den Versand der höchsten Schwelle atomar "reservieren". Der
    // Unique-Constraint macht den zweiten Trigger derselben Schwelle zum No-op
    // (`skipDuplicates` = ON CONFLICT DO NOTHING, auch bei parallelen Buchungen).
    const reserved = await prisma.budgetAlertLog.createMany({
      data: [{ ...key, threshold: highest }],
      skipDuplicates: true
    });
    // Höchste Schwelle wurde bereits gemeldet → nichts zu tun.
    if (reserved.count === 0) return;

    // Alle niedrigeren erreichten Schwellen als "gesendet" markieren, damit sie
    // später nie mehr einzeln nachfeuern (z. B. 80 % nach bereits gemeldeten 100 %).
    const lower = reached.filter((t) => t < highest);
    if (lower.length > 0) {
      await prisma.budgetAlertLog.createMany({
        data: lower.map((threshold) => ({ ...key, threshold })),
        skipDuplicates: true
      });
    }

    const tag = `budget-${categoryId}-${monthKey({ year, month })}`;
    await Promise.all(
      recipients.map((recipient) => {
        const isDe = recipient.user.locale !== "en";
        const title = isDe ? "Budget-Warnung" : "Budget alert";
        const body = isDe
          ? `${category.name}: Budget zu ${highest} % ausgeschöpft.`
          : `${category.name}: budget ${highest}% used.`;
        // Je Empfänger abfangen: ein Fehler beim einen darf den Push an den
        // anderen nicht verhindern.
        return sendPushToUser(recipient.userId, { title, body, url: "/dashboard", tag }).catch(() => 0);
      })
    );
  } catch {
    // Push-/DB-Fehler dürfen die auslösende Mutation nicht beeinflussen.
  }
}
