/**
 * Zeitzonen-Glue für die Reminder-Cron (Teil C). Rechnet einen UTC-Instant in
 * die lokale Wall-Clock einer IANA-Zeitzone um — die reine Fenster-/Wochentags-
 * Arithmetik liegt getestet in @doewe/shared.
 */

/** Minuten östlich von UTC für `date` in `timeZone` (grob, ohne DST-Edge-Cases). */
function offsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) if (p.type !== "literal") parts[p.type] = p.value;
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - date.getTime()) / 60000;
}

export type LocalTime = {
  /** Minuten seit lokaler Mitternacht (0..1439). */
  localMinutes: number;
  /** Wochentag: 0 = Sonntag … 6 = Samstag. */
  weekday: number;
  /** Tages-Schlüssel "YYYY-MM-DD" in der lokalen Zeitzone (für Dedupe). */
  dayKey: string;
  /** UTC-Instant, der der lokalen Mitternacht dieses Tages entspricht. */
  dayStartUtc: Date;
};

/** Lokale Zeit-Bestandteile von `date` in `timeZone`. */
export function localTimeIn(date: Date, timeZone: string): LocalTime {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) if (p.type !== "literal") parts[p.type] = p.value;
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const minute = Number(parts.minute);

  const offset = offsetMinutes(date, timeZone);
  const dayStartUtc = new Date(Date.UTC(year, month - 1, day) - offset * 60000);

  return {
    localMinutes: hour * 60 + minute,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
    dayStartUtc
  };
}
