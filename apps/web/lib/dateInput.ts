/**
 * Helfer für die Umwandlung zwischen einem nativen `<input type="date">`
 * (liefert/erwartet `yyyy-mm-dd` in lokaler Zeit) und dem ISO-Timestamp, den
 * die Transaktions-API speichert.
 */

/** Formatiert ein Date als lokales `yyyy-mm-dd` für ein <input type="date">. */
export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Wandelt das `yyyy-mm-dd` aus dem Datumsfeld in einen ISO-Timestamp für die API.
 *
 * Bleibt der gewählte Tag identisch mit `preserveIfSameDay` (im Create der
 * aktuelle Zeitpunkt, im Edit das Original-`occurredAt`), wird dieser exakte
 * Timestamp beibehalten — so behält eine unveränderte Buchung ihre Uhrzeit und
 * eine neue Buchung von heute den echten Zeitpunkt. Nur bei einem anderen Tag
 * wird lokaler Mittag verwendet, damit der Kalendertag in keiner Zeitzone auf
 * einen Nachbartag kippt (relevant an Monatsgrenzen).
 */
export function dateInputToISO(dateStr: string, preserveIfSameDay: Date): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (
    preserveIfSameDay.getFullYear() === year &&
    preserveIfSameDay.getMonth() === month - 1 &&
    preserveIfSameDay.getDate() === day
  ) {
    return preserveIfSameDay.toISOString();
  }
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}
