/**
 * Push-Entscheidungslogik (Teil C — Web Push): pure functions, damit die
 * Budget-Schwellen und die Reminder-Fenster-Logik ohne DB/Netz testbar sind.
 *
 * - Budget-Warnungen: welche Prozent-Schwellen hat eine Kategorie erreicht?
 *   Dedupe (jede Schwelle nur einmal/Monat) macht der BudgetAlertLog im Server;
 *   diese Funktionen sagen nur, WAS aktuell erreicht ist.
 * - Reminder: Fällt eine Erinnerung ins aktuelle Cron-Fenster? Die Umrechnung in
 *   die User-Zeitzone passiert im Server (Intl.DateTimeFormat); hier bleibt die
 *   reine Arithmetik auf lokalen Wall-Clock-Minuten.
 */

/** Die serverweit genutzten Budget-Warnschwellen in Prozent. */
export const BUDGET_ALERT_THRESHOLDS = [80, 100] as const;

/**
 * Prozentualer Budget-Verbrauch (0..∞) auf Basis ganzzahliger Cents.
 * `budgetCents <= 0` ergibt 0 (kein sinnvolles Budget → keine Warnung).
 */
export function budgetPercent(spentCents: number, budgetCents: number): number {
  if (budgetCents <= 0) return 0;
  return (spentCents / budgetCents) * 100;
}

/**
 * Die Schwellen (aufsteigend), die der Verbrauch erreicht ODER überschritten hat.
 * Beispiel: spent 90 %, thresholds [80,100] → [80].
 */
export function reachedBudgetThresholds(
  spentCents: number,
  budgetCents: number,
  thresholds: readonly number[] = BUDGET_ALERT_THRESHOLDS
): number[] {
  const percent = budgetPercent(spentCents, budgetCents);
  return [...thresholds].sort((a, b) => a - b).filter((threshold) => percent >= threshold);
}

/** True, wenn im 7-Bit-Bitmask (Bit 0 = Sonntag … Bit 6 = Samstag) gesetzt. */
export function isReminderWeekday(weekdays: number, weekday: number): boolean {
  if (weekday < 0 || weekday > 6) return false;
  return (weekdays & (1 << weekday)) !== 0;
}

/** "HH:MM" → Minuten seit Mitternacht, oder null bei ungültigem Format. */
export function parseTimeToMinutes(time: string): number | null {
  const match = /^([0-1]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Reminder ist fällig, wenn die lokale Wall-Clock-Minute im Fenster
 * [targetMinutes, targetMinutes + windowMinutes) liegt. Das Fenster ist links
 * inklusiv/rechts exklusiv, damit sich benachbarte Cron-Läufe nicht doppeln.
 */
export function isReminderDue(params: {
  targetMinutes: number;
  localMinutes: number;
  windowMinutes: number;
}): boolean {
  const { targetMinutes, localMinutes, windowMinutes } = params;
  return localMinutes >= targetMinutes && localMinutes < targetMinutes + windowMinutes;
}
