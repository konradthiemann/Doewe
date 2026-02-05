import { ensureNonEmpty } from "@doewe/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

const UpdateSavingPlanInput = z.object({
  title: z
    .string()
    .transform((value) => ensureNonEmpty(value))
    .transform((value) => value.trim())
    .optional(),
  targetMonth: z.number().int().min(1).max(12).optional(),
  targetYear: z.number().int().min(1970).max(9999).optional(),
  amountCents: z.number().int().min(1).optional()
});

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
      account: { select: { userId: true } },
      category: { select: { name: true } }
    }
  });

  if (!goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  if (goal.account.userId !== user.id) {
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
    include: { account: { select: { userId: true } } }
  });

  if (!goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  if (goal.account.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await request.json();
  const parsed = UpdateSavingPlanInput.safeParse({
    ...json,
    targetMonth: json?.targetMonth ?? json?.month,
    targetYear: json?.targetYear ?? json?.year
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;

  const updated = await prisma.budget.update({
    where: { id },
    data: {
      ...(payload.title !== undefined && { title: payload.title }),
      ...(payload.targetMonth !== undefined && { month: payload.targetMonth }),
      ...(payload.targetYear !== undefined && { year: payload.targetYear }),
      ...(payload.amountCents !== undefined && { amountCents: payload.amountCents })
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
    include: { account: { select: { userId: true } } }
  });

  if (!goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  if (goal.account.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.budget.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
