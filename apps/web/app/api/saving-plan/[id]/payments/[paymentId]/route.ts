/**
 * DELETE /api/saving-plan/[id]/payments/[paymentId] — remove a payment from savings.
 *
 * Requires an authenticated session; 403 for a goal of another household, 404
 * for an unknown goal or a payment that does not belong to it. Only an active
 * goal can change (409 once completed — reopen it first). The payment is
 * deleted for good; it was never a booking, so no figure but the goal's changes.
 *
 * 200: { success: true }
 */
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../../../../lib/auth";
import { prisma } from "../../../../../../lib/prisma";
import { loadOwnedGoal } from "../../../savings";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, paymentId } = await params;
  const result = await loadOwnedGoal(id, user.householdId);
  if (result.error) return result.error;
  if (result.goal.completedAt !== null) {
    return NextResponse.json({ error: "Goal is completed" }, { status: 409 });
  }

  const deleted = await prisma.savingGoalPayment.deleteMany({ where: { id: paymentId, goalId: id } });
  if (deleted.count === 0) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
