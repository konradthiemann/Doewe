/**
 * POST   /api/saving-plan/[id]/complete  — complete a saving goal.
 * DELETE /api/saving-plan/[id]/complete  — reopen a completed goal.
 *
 * Requires an authenticated session; only members of the goal's household may act
 * (403 otherwise). A saving goal is a `Budget` row with `categoryId = null`; a
 * category budget is not a goal here and yields 404, and so does a deleted goal.
 *
 * The app keeps no savings balance (docs/calculations/07-sparziele.md), so
 * completing books nothing. What the goal cost is what was recorded on it:
 * the linked bookings (from the monthly budget) plus the payments from savings.
 *
 * POST body (all optional, an empty body is fine):
 *   savingsPayment? { amountCents, day?, note? } | null
 *       — a last payment from savings, recorded in the same step (e.g. the rest
 *         of the holiday that was paid from the savings account)
 *
 * Effect, in one database transaction: `completedAt = now`, the optional
 * payment is added, and `spentCents` is fixed at linked bookings (outcome minus
 * refunds, not below 0, savings categories excluded) plus all payments from
 * savings. A second completion — double click, the partner at the same moment —
 * changes nothing and answers 409.
 *
 * POST 200: the updated goal row
 *   400 validation | 404 goal not found | 409 already completed
 *
 * DELETE (reopen): clears `completedAt` and `spentCents`; the payments stay on
 * the goal. Legacy: a goal completed while completion still booked a withdrawal
 * (`withdrawalTransactionId`) gets that booking deleted again, and a goal from
 * before that (`reservedCents`) has the field cleared. 200: the updated goal row.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { loadSavingsCategoryIds } from "../../../../../lib/savingsCategory";
import { linkedSpentCents, savingsPaidCents } from "../../compute";
import { loadOwnedGoal, paymentOccurredAt, SavingsPaymentInput } from "../../savings";

const CompleteInput = z.object({
  savingsPayment: SavingsPaymentInput.nullish()
});

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
  const { goal } = result;

  // No body or invalid JSON → no last payment; a body that is not an object fails validation.
  const text = await request.text().catch(() => "");
  let json: unknown = {};
  if (text.trim() !== "") {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  const parsed = CompleteInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { savingsPayment } = parsed.data;

  if (goal.completedAt !== null) {
    return NextResponse.json({ error: "Goal already completed" }, { status: 409 });
  }

  const savingsIds = await loadSavingsCategoryIds(user.householdId);
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    // Claim the goal first: the condition turns a second completion into a no-op.
    const claimed = await tx.budget.updateMany({
      where: { id, categoryId: null, completedAt: null, deletedAt: null },
      data: { completedAt: now }
    });
    if (claimed.count === 0) return null;

    if (savingsPayment) {
      await tx.savingGoalPayment.create({
        data: {
          goalId: id,
          amountCents: savingsPayment.amountCents,
          occurredAt: paymentOccurredAt(savingsPayment.day, now),
          note: savingsPayment.note || null,
          createdByUserId: user.id
        }
      });
    }

    // Every query inside the transaction uses `tx` (see lib/prisma.ts).
    const linked = await tx.transaction.findMany({
      where: { savingGoalId: id, deletedAt: null },
      select: { amountCents: true, categoryId: true }
    });
    const payments = await tx.savingGoalPayment.findMany({ where: { goalId: id }, select: { amountCents: true } });
    const spentCents = linkedSpentCents(linked, savingsIds) + savingsPaidCents(payments);

    return tx.budget.update({ where: { id }, data: { spentCents } });
  });

  if (!updated) {
    return NextResponse.json({ error: "Goal already completed" }, { status: 409 });
  }
  return NextResponse.json(updated);
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
  if (result.error) return result.error;

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.budget.findUnique({ where: { id }, select: { withdrawalTransactionId: true } });
    if (current?.withdrawalTransactionId) {
      // Legacy: undo the withdrawal booked on completion — tombstone it and drop
      // any receipt attached to it, as deleting a booking does. If the user
      // deleted it already, nothing happens.
      const undone = await tx.transaction.updateMany({
        where: {
          id: current.withdrawalTransactionId,
          account: { householdId: user.householdId },
          deletedAt: null
        },
        data: { deletedAt: now }
      });
      if (undone.count > 0) {
        await tx.attachment.deleteMany({ where: { transactionId: current.withdrawalTransactionId } });
      }
    }

    return tx.budget.update({
      where: { id },
      data: { completedAt: null, spentCents: null, withdrawalTransactionId: null, reservedCents: null }
    });
  });

  return NextResponse.json(updated);
}
