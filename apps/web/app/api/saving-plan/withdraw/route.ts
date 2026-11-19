/**
 * POST /api/saving-plan/withdraw — move money from the savings pool back into
 * everyday spending.
 *
 * Requires an authenticated session. Creates a POSITIVE transaction in a
 * savings category of the household (the inverse of a savings deposit): the
 * money returns to the current account and the savings pool shrinks accordingly.
 * The analytics routes treat positive savings transactions as a net-savings
 * reduction (not income), so the withdrawn amount raises the month's available
 * budget.
 *
 * The cap is the household's pool: all savings categories, all accounts. A goal
 * completed since withdrawals are booked has already taken its money out as a
 * booking; only goals completed before that still hold an amount back
 * (`Budget.reservedCents`), which is subtracted here as well. With several
 * savings categories the booking goes to the oldest one. `occurredAt` is the
 * instant of the request. Cap check and booking run in one transaction that
 * holds the household's pool lock, so two withdrawals at the same moment cannot
 * both use the same money.
 *
 * Body (JSON):
 *   accountId?   string — defaults to the household's oldest account
 *   amountCents  number — integer > 0, capped at the available savings pool
 *   description? string — shown in the transaction list
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../lib/auth";
import { LOCKED_TRANSACTION_OPTIONS, prisma } from "../../../../lib/prisma";
import { findSavingsBookingCategoryId, getAvailableSavingsCents, lockSavingsPool } from "../savings";

const WithdrawInput = z.object({
  accountId: z.string().min(1).optional(),
  amountCents: z.number().int().positive(),
  description: z.string().trim().min(1).max(200).optional()
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = WithdrawInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const payload = parsed.data;

  const account = payload.accountId
    ? await prisma.account.findFirst({ where: { id: payload.accountId, householdId: user.householdId } })
    : await prisma.account.findFirst({ where: { householdId: user.householdId }, orderBy: { createdAt: "asc" } });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const savingsCatId = await findSavingsBookingCategoryId(user.householdId);
  if (!savingsCatId) {
    return NextResponse.json({ error: "No savings category" }, { status: 409 });
  }

  const result = await prisma.$transaction(async (tx) => {
    await lockSavingsPool(tx, user.householdId);
    const availableCents = await getAvailableSavingsCents(user.householdId, tx);
    if (availableCents <= 0 || payload.amountCents > availableCents) {
      return { availableCents, created: null };
    }
    const created = await tx.transaction.create({
      data: {
        accountId: account.id,
        categoryId: savingsCatId,
        createdByUserId: user.id,
        // Positive: money returns from the savings pool to the current account.
        amountCents: payload.amountCents,
        description: payload.description ?? "Savings withdrawal",
        occurredAt: new Date()
      }
    });
    return { availableCents, created };
  }, LOCKED_TRANSACTION_OPTIONS);

  const { availableCents, created } = result;
  if (!created) {
    return NextResponse.json(
      availableCents <= 0
        ? { error: "Nothing available to withdraw", availableCents }
        : { error: "Amount exceeds available savings", availableCents },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { id: created.id, amountCents: created.amountCents, availableCents: availableCents - payload.amountCents },
    { status: 201 }
  );
}
