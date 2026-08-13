/**
 * POST /api/saving-plan/withdraw — move money from the savings pool back into
 * everyday spending.
 *
 * Requires an authenticated session. Creates a POSITIVE transaction in the
 * user's savings category (the inverse of a savings deposit): the money returns
 * to the current account and the savings pool shrinks accordingly. The analytics
 * routes treat positive savings transactions as a net-savings reduction (not
 * income), so the withdrawn amount raises the month's available budget.
 *
 * Body (JSON):
 *   accountId?   string — defaults to the user's first account
 *   amountCents  number — integer > 0, capped at the available savings pool
 *   description? string — shown in the transaction list
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { findSavingsCategoryId, getAvailableSavingsCents } from "../savings";

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

  const savingsCatId = await findSavingsCategoryId(user.householdId);
  if (!savingsCatId) {
    return NextResponse.json({ error: "No savings category" }, { status: 409 });
  }

  const availableCents = await getAvailableSavingsCents(account.id, user.householdId);
  if (availableCents <= 0) {
    return NextResponse.json({ error: "Nothing available to withdraw", availableCents }, { status: 409 });
  }
  if (payload.amountCents > availableCents) {
    return NextResponse.json(
      { error: "Amount exceeds available savings", availableCents },
      { status: 409 }
    );
  }

  const created = await prisma.transaction.create({
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

  return NextResponse.json(
    { id: created.id, amountCents: created.amountCents, availableCents: availableCents - payload.amountCents },
    { status: 201 }
  );
}
