/**
 * GET    /api/saving-plan/[id] — ein Sparziel lesen
 * PATCH  /api/saving-plan/[id] — Titel, Termin und/oder Betrag ändern
 * DELETE /api/saving-plan/[id] — Sparziel löschen (Soft-Delete)
 *
 * Authentifizierung: Pflicht (401). Fremder Haushalt: 403.
 * Ein Sparziel ist eine `Budget`-Zeile mit `categoryId = null`; ein
 * Kategorie-Budget ist hier kein Ziel und liefert 404. Ein gelöschtes Ziel
 * (`deletedAt` gesetzt) ebenfalls: `findUnique` sieht gelöschte Zeilen, deshalb
 * wird `deletedAt` hier ausdrücklich geprüft.
 *
 * PATCH Body: { title?, targetMonth?, targetYear?, amountCents?, monthlyRateCents? }
 *   — Monat und Jahr nur gemeinsam; `null` entfernt Termin, Betrag bzw. Rate.
 *   Eine Monatsrate gibt es nur mit Termin: Wird der Termin entfernt, wird auch
 *   die Rate geleert; für ein Ziel ohne Termin wird keine gespeichert.
 *
 * DELETE (Soft-Delete) lässt alle Buchungen stehen, auch die mit dem Ziel
 * verknüpften. Die Zahlungen aus dem Ersparten bleiben am gelöschten Ziel und
 * zählen nirgends mehr.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { INT4_MAX } from "../../transactions/schema";

const UpdateSavingPlanInput = z
  .object({
    // trim().min(1) statt eines werfenden Transforms: ein Titel nur aus
    // Leerraum ist ein 400, kein 500.
    title: z.string().trim().min(1).optional(),
    // `undefined` = leave unchanged; `null` = clear (un-schedule / remove amount).
    targetMonth: z.number().int().min(1).max(12).nullish(),
    targetYear: z.number().int().min(1970).max(9999).nullish(),
    amountCents: z.number().int().min(1).max(INT4_MAX).nullish(),
    // 0 is a valid rate: "the money is there already".
    monthlyRateCents: z.number().int().min(0).max(INT4_MAX).nullish()
  })
  .refine(
    (data) => {
      // month and year must be updated together and share their null-ness,
      // so a goal is never left half-scheduled.
      const monthProvided = data.targetMonth !== undefined;
      const yearProvided = data.targetYear !== undefined;
      if (monthProvided !== yearProvided) return false;
      if (!monthProvided) return true;
      return (data.targetMonth == null) === (data.targetYear == null);
    },
    {
      message: "targetMonth and targetYear must be updated together (both a value or both null)",
      path: ["targetMonth"]
    }
  );

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const goal = await prisma.budget.findUnique({
    where: { id },
    include: {
      account: { select: { householdId: true } },
      category: { select: { name: true } }
    }
  });

  if (!goal || goal.categoryId !== null || goal.deletedAt !== null) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  if (goal.account.householdId !== user.householdId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    id: goal.id,
    accountId: goal.accountId,
    categoryId: goal.categoryId,
    categoryName: goal.category?.name ?? null,
    title: goal.title,
    month: goal.month,
    year: goal.year,
    amountCents: goal.amountCents,
    monthlyRateCents: goal.monthlyRateCents,
    createdAt: goal.createdAt
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const goal = await prisma.budget.findUnique({
    where: { id },
    include: { account: { select: { householdId: true } } }
  });

  if (!goal || goal.categoryId !== null || goal.deletedAt !== null) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  if (goal.account.householdId !== user.householdId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  // Accept legacy `month`/`year` aliases, but preserve an explicit `null`
  // (used to un-schedule a goal) — `??` would swallow it, so only fall back
  // to the alias when the primary key is genuinely absent.
  const parsed = UpdateSavingPlanInput.safeParse({
    ...json,
    targetMonth: json?.targetMonth !== undefined ? json.targetMonth : json?.month,
    targetYear: json?.targetYear !== undefined ? json.targetYear : json?.year
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;

  // The goal as it will be: a rate only survives on a dated goal.
  const nextMonth = payload.targetMonth !== undefined ? payload.targetMonth : goal.month;
  const nextYear = payload.targetYear !== undefined ? payload.targetYear : goal.year;
  const dated = nextMonth != null && nextYear != null;
  const monthlyRateCents = !dated ? null : payload.monthlyRateCents;

  const updated = await prisma.budget.update({
    where: { id },
    data: {
      ...(payload.title !== undefined && { title: payload.title }),
      ...(payload.targetMonth !== undefined && { month: payload.targetMonth }),
      ...(payload.targetYear !== undefined && { year: payload.targetYear }),
      ...(payload.amountCents !== undefined && { amountCents: payload.amountCents }),
      ...(monthlyRateCents !== undefined && { monthlyRateCents })
    },
    include: { category: { select: { name: true } } }
  });

  return NextResponse.json({
    id: updated.id,
    accountId: updated.accountId,
    categoryId: updated.categoryId,
    categoryName: updated.category?.name ?? null,
    title: updated.title,
    month: updated.month,
    year: updated.year,
    amountCents: updated.amountCents,
    monthlyRateCents: updated.monthlyRateCents,
    createdAt: updated.createdAt
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const goal = await prisma.budget.findUnique({
    where: { id },
    include: { account: { select: { householdId: true } } }
  });

  if (!goal || goal.categoryId !== null || goal.deletedAt !== null) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  if (goal.account.householdId !== user.householdId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Soft-Delete (Phase 3b): Tombstone statt Hard-Delete für die Sync-Propagation.
  await prisma.budget.update({ where: { id }, data: { deletedAt: new Date() } });

  return NextResponse.json({ success: true });
}
