/**
 * Pure recurring-transaction due-date logic — no Prisma, no I/O.
 *
 * A RecurringTransaction has an anchor month (`nextOccurrence`, split by the
 * caller into nextYear/nextMonth) and repeats every `intervalMonths` months
 * from there. This was previously duplicated between the analytics summary
 * endpoint and the budget-alert check; both now share this module.
 *
 * Everything here works on calendar values (year, month, day), never on
 * instants. The caller reads them in the app's time zone (`zonedMonth`,
 * `zonedDate` from ./calendar) and turns a calendar day back into an instant
 * with `zonedTimeToUtc({ ...day, hour: 12 })`.
 */
import { daysInMonth, monthKey, shiftMonth, zonedDate } from "./calendar";

export type RecurringAnchor = {
  nextYear: number;
  nextMonth: number; // 1-12
  intervalMonths: number;
};

export type MonthRef = { year: number; month: number };

/** Whether a recurring transaction with the given anchor is due in (year, month). */
export function isRecurringDueInMonth(params: RecurringAnchor & MonthRef): boolean {
  const { nextYear, nextMonth, year, month } = params;
  if (nextYear === year && nextMonth === month) return true;

  const interval = params.intervalMonths || 1;
  const monthsSinceNext = (year - nextYear) * 12 + (month - nextMonth);
  return monthsSinceNext >= 0 && monthsSinceNext % interval === 0;
}

/**
 * Every (year, month) at which a recurring transaction was or is due, from its
 * anchor month up to and including the reference month (`untilYear`/`untilMonth`).
 * Used both for the current month's due-check and for backfilling past,
 * never-booked occurrences in one pass.
 */
export function dueMonthsBetween(
  params: RecurringAnchor & { untilYear: number; untilMonth: number }
): MonthRef[] {
  const { nextYear, nextMonth, untilYear, untilMonth } = params;
  const interval = params.intervalMonths || 1;

  const totalMonthsSinceNext = (untilYear - nextYear) * 12 + (untilMonth - nextMonth);
  if (totalMonthsSinceNext < 0) return [];

  const result: MonthRef[] = [];
  for (let offset = 0; offset <= totalMonthsSinceNext; offset += interval) {
    const absoluteMonth = (nextMonth - 1) + offset;
    const year = nextYear + Math.floor(absoluteMonth / 12);
    const month = (absoluteMonth % 12) + 1;
    result.push({ year, month });
  }
  return result;
}

export type CalendarDate = { year: number; month: number; day: number }; // month 1-12

/**
 * Adds `months` calendar months to `date`. The day is `dayOfMonth` (1-31) if
 * given, else the date's own day, and is clamped to the length of the target
 * month (Jan 31 + 1 month -> Feb 28/29).
 */
export function addMonthsClamped(date: CalendarDate, months: number, dayOfMonth?: number): CalendarDate {
  if (!Number.isInteger(months) || months < 0) {
    throw new RangeError(`months must be an integer >= 0, got ${months}`);
  }
  if (dayOfMonth !== undefined && (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31)) {
    throw new RangeError(`dayOfMonth must be an integer in 1..31, got ${dayOfMonth}`);
  }
  const absoluteMonth = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(absoluteMonth / 12);
  const month = (absoluteMonth % 12) + 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, day: Math.min(dayOfMonth ?? date.day, daysInMonth) };
}

/**
 * The calendar day on which a recurring transaction with `dayOfMonth` falls in
 * the given month: the day is clamped to the length of the month (31 -> 30 in
 * November, 28/29 in February).
 */
export function occurrenceDate(ref: MonthRef, dayOfMonth: number): CalendarDate {
  return { year: ref.year, month: ref.month, day: Math.min(dayOfMonth, daysInMonth(ref.year, ref.month)) };
}

/**
 * Whether the calendar day `date` is `other` or an earlier day. An occurrence
 * is due when its day is on or before today — compare days, not instants: an
 * occurrence is dated at noon, so an instant comparison would delay the
 * booking until the afternoon of its day.
 */
export function isOnOrBeforeDate(date: CalendarDate, other: CalendarDate): boolean {
  if (date.year !== other.year) return date.year < other.year;
  if (date.month !== other.month) return date.month < other.month;
  return date.day <= other.day;
}

/**
 * First occurrence of a recurring transaction created `today` without an
 * explicit start date: this month only if its (clamped) day is still ahead,
 * i.e. strictly after today; otherwise next month. A day that is today counts
 * as passed: whoever entered today's payment by hand and then creates the
 * template must not get it booked a second time. The decision uses the
 * clamped day, so on 30 November both day 30 and day 31 start in December.
 */
export function firstOccurrenceFrom(today: CalendarDate, dayOfMonth: number): CalendarDate {
  const thisMonth = occurrenceDate(today, dayOfMonth);
  if (thisMonth.day > today.day) return thisMonth;
  return occurrenceDate(shiftMonth(today, 1), dayOfMonth);
}

/**
 * First occurrence of a series created with an explicit start date `start`
 * that books on `dayOfMonth`: the booking day in the start month if it is the
 * start day or later, otherwise the booking day of the following month. A
 * start of 20 November with day 5 therefore begins on 5 December — never
 * before the date the user entered as the first booking. Days are clamped to
 * the length of their month.
 */
export function firstOccurrenceOnOrAfter(start: CalendarDate, dayOfMonth: number): CalendarDate {
  const inStartMonth = occurrenceDate(start, dayOfMonth);
  if (inStartMonth.day >= start.day) return inStartMonth;
  return occurrenceDate(shiftMonth(start, 1), dayOfMonth);
}

/** A start date may lie at most this many years before or after today. */
export const RECURRING_START_MAX_YEARS = 10;

/**
 * Whether `date` is at most `years` calendar years before or after `today`
 * (the same day `years` years away still counts). Guards a start date against
 * typos such as 2016 instead of 2026.
 */
export function isWithinYearsOf(
  date: CalendarDate,
  today: CalendarDate,
  years: number = RECURRING_START_MAX_YEARS
): boolean {
  const earliest = { ...today, year: today.year - years };
  const latest = { ...today, year: today.year + years };
  return isOnOrBeforeDate(earliest, date) && isOnOrBeforeDate(date, latest);
}

/**
 * `RecurringTransaction.bookFromPeriod` for a schedule whose first occurrence
 * lies in the month `first`, decided in the month `current`: a series that
 * starts before the current month is booked from the current month on — the
 * months in between are not back-booked — unless the user asked for the
 * backfill. `null` means no lower bound.
 */
export function bookFromPeriodFor(first: MonthRef, current: MonthRef, backfill: boolean): string | null {
  if (backfill) return null;
  return monthKey(first) < monthKey(current) ? monthKey(current) : null;
}

/** Whether the occurrence of month `ref` lies before `bookFromPeriod` and must not be booked automatically. */
export function isBeforeBookFromPeriod(ref: MonthRef, bookFromPeriod: string | null): boolean {
  return bookFromPeriod !== null && monthKey(ref) < bookFromPeriod;
}

/** Calendar days from `from` to `to` (negative if `to` is the earlier day). */
export function calendarDaysBetween(from: CalendarDate, to: CalendarDate): number {
  const dayNumber = (d: CalendarDate) => Date.UTC(d.year, d.month - 1, d.day) / 86_400_000;
  return Math.round(dayNumber(to) - dayNumber(from));
}

/** A hand-entered booking this many calendar days before or after the due day can be suggested for the occurrence. */
export const ADOPTION_WINDOW_DAYS = 7;

export type AdoptionTemplate = {
  accountId: string;
  categoryId: string | null;
  amountCents: number;
  description: string;
};

export type AdoptionRow = {
  id: string;
  accountId: string;
  categoryId: string | null;
  amountCents: number;
  description: string;
  occurredAt: Date;
  createdAt: Date;
  /** Only rows without a link and without a tombstone qualify; absent = unlinked / not deleted. */
  recurringTransactionId?: string | null;
  deletedAt?: Date | null;
};

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Why a booking cannot stand for an occurrence; see `adoptionMismatch`. */
export type AdoptionMismatch = "deleted" | "linked" | "account" | "amount" | "category" | "description" | "date";

/**
 * The first rule of `isAdoptionCandidate` the booking breaks, or null if it
 * can stand for the occurrence. Lets a caller say why a booking was refused.
 */
export function adoptionMismatch(
  row: AdoptionRow,
  template: AdoptionTemplate,
  dueDay: CalendarDate
): AdoptionMismatch | null {
  if (row.deletedAt != null) return "deleted";
  if (row.recurringTransactionId != null) return "linked";
  if (row.accountId !== template.accountId) return "account";
  if (row.amountCents !== template.amountCents) return "amount";
  if (template.categoryId !== null) {
    if (row.categoryId !== template.categoryId) return "category";
  } else {
    if (row.categoryId !== null) return "category";
    if (!sameText(row.description, template.description)) return "description";
  }
  if (Math.abs(calendarDaysBetween(dueDay, zonedDate(row.occurredAt))) > ADOPTION_WINDOW_DAYS) return "date";
  return null;
}

/**
 * Whether a hand-entered booking can stand for the occurrence of `template`
 * that is due on `dueDay`: same account, not deleted, not linked to any
 * recurring transaction, exactly the same amount, the same category — or, for
 * a template without category, no category and the same description (ignoring
 * case and surrounding whitespace) — and dated, as a calendar day in the app's
 * time zone, at most ADOPTION_WINDOW_DAYS before or after the due day.
 *
 * Such a booking is only ever suggested; it is linked to the occurrence when
 * the user confirms (docs/calculations/03-wiederkehrende-transaktionen.md).
 */
export function isAdoptionCandidate(row: AdoptionRow, template: AdoptionTemplate, dueDay: CalendarDate): boolean {
  return adoptionMismatch(row, template, dueDay) === null;
}

/**
 * The hand-entered booking to suggest for the occurrence due on `dueDay`, or
 * null: of all candidates (`isAdoptionCandidate`) the one closest to the due
 * day; among equally close ones the oldest — earliest date, then entered
 * first. `exclude` holds ids that are already suggested for another occurrence.
 */
export function pickAdoptionCandidate<Row extends AdoptionRow>(
  rows: readonly Row[],
  template: AdoptionTemplate,
  dueDay: CalendarDate,
  exclude: ReadonlySet<string> = new Set()
): Row | null {
  const distance = (row: Row) => Math.abs(calendarDaysBetween(dueDay, zonedDate(row.occurredAt)));
  const candidates = rows.filter((row) => !exclude.has(row.id) && isAdoptionCandidate(row, template, dueDay));
  candidates.sort(
    (a, b) =>
      distance(a) - distance(b) ||
      a.occurredAt.getTime() - b.occurredAt.getTime() ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  return candidates[0] ?? null;
}
