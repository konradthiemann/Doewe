/**
 * PATCH  /api/budget-plans/:id — Periode und/oder Betrag eines Plans ändern
 * DELETE /api/budget-plans/:id — Plan löschen (Soft-Delete, 204)
 *
 * Authentifizierung: Pflicht (401). Haushaltsbezogen: fremde, unbekannte oder
 * bereits gelöschte Pläne liefern 404.
 *
 * PATCH Body: { period?: "MONTHLY" | "YEARLY", amountCents?: 1..1_000_000_000 } (mind. ein Feld)
 *   200 Plan-DTO | 400 Validierung | 404
 */
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { toPlanDto, UpdateBudgetPlanSchema } from "../schema";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function PATCH(req: Request, { params }: RouteContext) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json: unknown = await req.json().catch(() => null);
  const parsed = UpdateBudgetPlanSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // findFirst hides soft-deleted plans via the extension.
  const existing = await prisma.categoryBudgetPlan.findFirst({
    where: { id: params.id, householdId: user.householdId },
    select: { id: true }
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const plan = await prisma.categoryBudgetPlan.update({ where: { id: existing.id }, data: parsed.data });
  return NextResponse.json(toPlanDto(plan));
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.categoryBudgetPlan.findFirst({
    where: { id: params.id, householdId: user.householdId },
    select: { id: true }
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.categoryBudgetPlan.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  return new NextResponse(null, { status: 204 });
}
