/**
 * POST   /api/saving-plan/[id]/complete  — complete a saving goal.
 * DELETE /api/saving-plan/[id]/complete  — reopen a completed goal.
 *
 * Requires an authenticated session; only members of the goal's household may act
 * (403 otherwise). A saving goal is a `Budget` row with `categoryId = null`; a
 * category budget is not a goal here and yields 404, and so does a deleted goal
 * (`findUnique` sees soft-deleted rows, so `deletedAt` is checked explicitly).
 *
 * POST body:
 *   spentCents  number  — integer >= 0: what the goal cost in the end
 *   withdraw?   boolean — default true: take the money out of the savings pool
 *   expense?    { categoryId: string | null, accountId?: string } | null
 *                       — also book the purchase itself
 *
 * Completing takes the money out of the pool with a real booking, so the pool
 * always equals the sum of the savings bookings:
 *   - `withdraw` true: a withdrawal — a POSITIVE amount in the savings booking
 *     category, dated now, on the goal's account, "Sparziel: <title>" — of
 *     min(spentCents, pool available right now). Nothing is booked if that is 0.
 *     The booking is not linked to the goal through `savingGoalId` (it is not
 *     "spent on the goal"); its id is kept in `Budget.withdrawalTransactionId`.
 *   - `withdraw` false: the user already took the money out; nothing is booked.
 *   - `expense` given and spentCents > 0: the purchase — NEGATIVE spentCents,
 *     description = the goal's title, in the given category (null =
 *     uncategorised), linked to the goal, dated now, on `expense.accountId` or
 *     the goal's account, tax flag inherited from the category. Afterwards the
 *     budget alert of that category is checked, as for any new booking.
 * Goal update and bookings happen in one database transaction that holds the
 * household's pool lock. `reservedCents` is never set here.
 *
 * POST 200: the updated goal row plus `withdrawnCents` and `expenseTransactionId`
 *   (null if none)
 *   400 validation, or the expense category is a savings category
 *   404 goal, expense category or expense account not found in the household
 *   409 the goal is already completed
 *
 * DELETE (reopen): clears `completedAt`, `spentCents`, `withdrawalTransactionId`
 * and `reservedCents`. If a withdrawal was booked on completion it is
 * soft-deleted, so the money is back in the pool; for a goal completed before
 * withdrawals were booked, clearing `reservedCents` releases what it held back.
 * A purchase booked through `expense` stays: it is an ordinary booking the user
 * can delete in the list. 200: the updated goal row.
 */
import { isSavingsCategoryName } from "@doewe/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../../lib/auth";
import { checkBudgetAlerts } from "../../../../../lib/budgetAlerts";
import { prisma } from "../../../../../lib/prisma";
import { INT4_MAX } from "../../../transactions/schema";
import { findSavingsBookingCategoryId, getAvailableSavingsCents, lockSavingsPool } from "../../savings";

const CompleteInput = z.object({
  spentCents: z.number().int().min(0).max(INT4_MAX),
  withdraw: z.boolean().default(true),
  expense: z
    .object({
      categoryId: z.string().min(1).nullable(),
      accountId: z.string().min(1).optional()
    })
    .nullish()
});

/** Description of a goal's bookings when the goal has no title (rows from before titles were required). */
const FALLBACK_TITLE = "Sparziel";

async function loadOwnedGoal(id: string, householdId: string) {
  const goal = await prisma.budget.findUnique({
    where: { id },
    include: { account: { select: { householdId: true } } }
  });

  if (!goal || goal.categoryId !== null || goal.deletedAt !== null) {
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
  if (result.error) return result.error;
  const { goal } = result;

  // Invalid JSON → null → fails validation (400 instead of 500).
  const json: unknown = await request.json().catch(() => null);
  const parsed = CompleteInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { spentCents, withdraw, expense } = parsed.data;

  if (goal.completedAt !== null) {
    return NextResponse.json({ error: "Goal already completed" }, { status: 409 });
  }

  let expenseCategory: { id: string; isTaxRelevant: boolean } | null = null;
  let expenseAccountId = goal.accountId;
  if (expense) {
    if (expense.categoryId !== null) {
      const category = await prisma.category.findFirst({
        where: { id: expense.categoryId, householdId: user.householdId },
        select: { id: true, name: true, isTaxRelevant: true }
      });
      if (!category) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }
      // A booking in a savings category is a transfer to or from the pool,
      // never a purchase.
      if (isSavingsCategoryName(category.name)) {
        return NextResponse.json({ error: "Expense category must not be a savings category" }, { status: 400 });
      }
      expenseCategory = category;
    }
    if (expense.accountId !== undefined) {
      const account = await prisma.account.findFirst({
        where: { id: expense.accountId, householdId: user.householdId },
        select: { id: true }
      });
      if (!account) {
        return NextResponse.json({ error: "Account not found" }, { status: 404 });
      }
      expenseAccountId = account.id;
    }
  }

  const title = goal.title.trim();
  const now = new Date();

  const outcome = await prisma.$transaction(async (tx) => {
    await lockSavingsPool(tx, user.householdId);

    // Claim the goal first. The condition turns a second completion of the
    // same goal (double submit, the partner at the same moment) into a no-op
    // instead of a second withdrawal.
    const claimed = await tx.budget.updateMany({
      where: { id, categoryId: null, completedAt: null, deletedAt: null },
      data: { completedAt: now, spentCents }
    });
    if (claimed.count === 0) return null;

    let withdrawnCents = 0;
    let withdrawalTransactionId: string | null = null;
    if (withdraw && spentCents > 0) {
      const availableCents = await getAvailableSavingsCents(user.householdId, tx);
      const amountCents = Math.min(spentCents, availableCents);
      const savingsCategoryId = amountCents > 0 ? await findSavingsBookingCategoryId(user.householdId, tx) : null;
      if (amountCents > 0 && savingsCategoryId) {
        const withdrawal = await tx.transaction.create({
          data: {
            accountId: goal.accountId,
            categoryId: savingsCategoryId,
            createdByUserId: user.id,
            // Positive: the money returns from the pool to the account. No
            // savingGoalId — a withdrawal is not "spent on the goal".
            amountCents,
            description: title ? `Sparziel: ${title}` : FALLBACK_TITLE,
            occurredAt: now
          }
        });
        withdrawnCents = amountCents;
        withdrawalTransactionId = withdrawal.id;
      }
    }

    let expenseTransactionId: string | null = null;
    if (expense && spentCents > 0) {
      const purchase = await tx.transaction.create({
        data: {
          accountId: expenseAccountId,
          categoryId: expenseCategory?.id ?? null,
          savingGoalId: id,
          createdByUserId: user.id,
          amountCents: -spentCents,
          description: title || FALLBACK_TITLE,
          occurredAt: now,
          taxRelevant: expenseCategory?.isTaxRelevant ?? false
        }
      });
      expenseTransactionId = purchase.id;
    }

    const updated = await tx.budget.update({ where: { id }, data: { withdrawalTransactionId } });
    return { updated, withdrawnCents, expenseTransactionId };
  });

  if (!outcome) {
    return NextResponse.json({ error: "Goal already completed" }, { status: 409 });
  }

  // The purchase is a booking like any other: check its category's budget.
  // Errors are swallowed inside; completing never fails on a push problem.
  if (outcome.expenseTransactionId && expenseCategory) {
    await checkBudgetAlerts({ householdId: user.householdId, categoryId: expenseCategory.id, occurredAt: now });
  }

  return NextResponse.json({
    ...outcome.updated,
    withdrawnCents: outcome.withdrawnCents,
    expenseTransactionId: outcome.expenseTransactionId
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
  if (result.error) return result.error;

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    await lockSavingsPool(tx, user.householdId);

    // Read again under the lock: the id of the withdrawal may have been
    // written by a completion that committed after the check above.
    const current = await tx.budget.findUnique({ where: { id }, select: { withdrawalTransactionId: true } });
    if (current?.withdrawalTransactionId) {
      // Undo the withdrawal booked on completion: tombstone it (and drop any
      // receipt attached to it, as deleting a booking does), so the money is
      // back in the pool. If the user deleted it already, nothing happens.
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
