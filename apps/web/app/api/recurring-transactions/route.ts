/**
 * GET  /api/recurring-transactions  — Alle Daueraufträge des Nutzers (nach nextOccurrence sortiert)
 * POST /api/recurring-transactions  — Neuen Dauerauftrag anlegen
 *
 * Daueraufträge sind Vorlagen für regelmäßige Transaktionen (z.B. Miete jeden 1. des Monats).
 * Sie werden NICHT automatisch als echte Transaktionen angelegt — stattdessen werden sie
 * im Analytics-Dashboard als "geplante" Beträge eingerechnet.
 *
 * `nextOccurrence` wird automatisch aus `dayOfMonth` berechnet (aktueller Monat, falls
 * der Tag noch nicht vergangen ist, sonst nächster Monat). Alternativ kann ein `startDate`
 * (yyyy-mm-dd) übergeben werden — dann ist dieses Datum die erste Buchung (nextOccurrence),
 * z.B. für ein Abo, dessen erste Zahlung erst in einigen Monaten fällig wird.
 *
 * POST Body: { accountId, categoryId?, amountCents, description, intervalMonths? (1-24), dayOfMonth? (1-31), startDate? (yyyy-mm-dd) }
 */
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

const RecurringInput = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  amountCents: z.number().int(),
  description: z.string().min(1),
  intervalMonths: z.number().int().min(1).max(24).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isRealCalendarDate, "Ungültiges Datum")
    .optional()
});

/**
 * Berechnet das nächste Fälligkeitsdatum für einen Dauerauftrag.
 *
 * Logik: Ist `dayOfMonth` noch nicht vergangen → aktueller Monat.
 * Sonst → nächster Monat. Datum wird auf den letzten Tag des Monats geclampt
 * (z.B. dayOfMonth=31 im Februar → 28/29).
 */
function nextOccurrenceDate(dayOfMonth: number, now = new Date()) {
  const today = now.getDate();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  // If dayOfMonth hasn't passed this month, use current month, otherwise next month
  if (dayOfMonth > today) {
    // Clamp to last day of current month if dayOfMonth exceeds days in month
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const clampedDay = Math.min(dayOfMonth, daysInMonth);
    return new Date(currentYear, currentMonth, clampedDay, 0, 0, 0, 0);
  }
  
  // Use next month
  const nextMonth = currentMonth + 1;
  const nextYear = nextMonth > 11 ? currentYear + 1 : currentYear;
  const normalizedMonth = nextMonth % 12;
  const daysInNextMonth = new Date(nextYear, normalizedMonth + 1, 0).getDate();
  const clampedDay = Math.min(dayOfMonth, daysInNextMonth);
  return new Date(nextYear, normalizedMonth, clampedDay, 0, 0, 0, 0);
}

/** Prüft, ob ein `yyyy-mm-dd`-String ein gültiges Kalenderdatum ist. */
function isRealCalendarDate(startDate: string): boolean {
  const [year, month, day] = startDate.split("-").map(Number);
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day >= 1 && day <= daysInMonth;
}

/**
 * Wandelt einen `yyyy-mm-dd`-String in ein lokales Date (Mitternacht) um.
 * Der Tag wird defensiv auf den letzten Tag des Monats geclampt.
 */
function startDateToDate(startDate: string): Date {
  const [year, month, day] = startDate.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const clampedDay = Math.min(day, daysInMonth);
  return new Date(year, month - 1, clampedDay, 0, 0, 0, 0);
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.recurringTransaction.findMany({
    where: { account: { householdId: user.householdId } },
    orderBy: { nextOccurrence: "asc" }
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = RecurringInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const account = await prisma.account.findFirst({ where: { id: data.accountId, householdId: user.householdId } });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (data.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: data.categoryId, householdId: user.householdId } });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
  }
  // Startdatum (falls angegeben) legt die erste Buchung direkt fest; ansonsten wird
  // nextOccurrence wie bisher aus dayOfMonth berechnet.
  const day = data.dayOfMonth ?? (data.startDate ? Number(data.startDate.slice(8, 10)) : 1);
  const nextDate = data.startDate ? startDateToDate(data.startDate) : nextOccurrenceDate(day);
  
  const createData = {
    accountId: data.accountId,
    categoryId: data.categoryId,
    amountCents: data.amountCents,
    description: data.description,
    frequency: "MONTHLY",
    intervalMonths: data.intervalMonths ?? 1,
    dayOfMonth: day,
    nextOccurrence: nextDate
  } as Prisma.RecurringTransactionUncheckedCreateInput;

  const created = await prisma.recurringTransaction.create({
    data: createData
  });
  return NextResponse.json(created, { status: 201 });
}
