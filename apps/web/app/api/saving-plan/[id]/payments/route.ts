/**
 * POST /api/saving-plan/[id]/payments — record a payment from savings on a goal.
 *
 * A payment from savings is money spent on the goal straight out of the
 * savings — outside the accounts the app keeps. It is not a booking: no
 * balance, no monthly figure, no budget changes; only what the goal shows as
 * spent (docs/calculations/07-sparziele.md).
 *
 * Requires an authenticated session; 403 for a goal of another household, 404
 * for an unknown or deleted goal or a category budget. Only an active goal
 * takes payments (409 once completed — reopen it first).
 *
 * Body: { amountCents: integer 1..int4, day?: "yyyy-mm-dd" (Berlin day, default
 *   today), note?: string up to 200 characters }
 * The payment is dated 12:00 Berlin of its day.
 *
 * 201: { id, goalId, amountCents, occurredAt, note } | 400 validation
 */
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { loadOwnedGoal, paymentOccurredAt, SavingsPaymentInput } from "../../savings";

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
  if (result.error) return result.error;
  if (result.goal.completedAt !== null) {
    return NextResponse.json({ error: "Goal is completed" }, { status: 409 });
  }

  const json: unknown = await request.json().catch(() => null);
  const parsed = SavingsPaymentInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const created = await prisma.savingGoalPayment.create({
    data: {
      goalId: id,
      amountCents: parsed.data.amountCents,
      occurredAt: paymentOccurredAt(parsed.data.day, new Date()),
      note: parsed.data.note || null,
      createdByUserId: user.id
    },
    select: { id: true, goalId: true, amountCents: true, occurredAt: true, note: true }
  });

  return NextResponse.json(created, { status: 201 });
}
