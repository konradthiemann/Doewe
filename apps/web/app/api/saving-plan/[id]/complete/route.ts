/**
 * POST   /api/saving-plan/[id]/complete  — mark a saving goal as completed.
 * DELETE /api/saving-plan/[id]/complete  — reopen a completed goal.
 *
 * Requires an authenticated session; only the owner of the goal's account may act.
 * Body (POST): { spentCents: number >= 0 } — the amount actually withdrawn from
 * savings on completion. It is stored as a snapshot and reserved out of the savings
 * pool that funds the remaining active goals (see ../compute.ts).
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";

const CompleteInput = z.object({
  spentCents: z.number().int().min(0)
});

async function loadOwnedGoal(id: string, householdId: string) {
  const goal = await prisma.budget.findUnique({
    where: { id },
    include: { account: { select: { householdId: true } } }
  });

  if (!goal) {
    return { error: NextResponse.json({ error: "Goal not found" }, { status: 404 }) } as const;
  }
  if (goal.account.householdId !== householdId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }
  return { goal } as const;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await loadOwnedGoal(id, user.householdId);
  if ("error" in result) return result.error;

  const json = await request.json();
  const parsed = CompleteInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.budget.update({
    where: { id },
    data: {
      completedAt: new Date(),
      spentCents: parsed.data.spentCents
    }
  });

  return NextResponse.json({
    id: updated.id,
    completedAt: updated.completedAt,
    spentCents: updated.spentCents
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
  const result = await loadOwnedGoal(id, user.householdId);
  if ("error" in result) return result.error;

  const updated = await prisma.budget.update({
    where: { id },
    data: {
      completedAt: null,
      spentCents: null
    }
  });

  return NextResponse.json({
    id: updated.id,
    completedAt: updated.completedAt,
    spentCents: updated.spentCents
  });
}
