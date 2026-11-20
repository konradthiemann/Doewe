/**
 * POST /api/saving-plan/withdraw — take money back from the savings into this
 * month's budget.
 *
 * Requires an authenticated session. Creates a POSITIVE transaction in a
 * savings category of the household (the inverse of a savings deposit): the
 * money returns to the current account. The analytics routes treat positive
 * savings transactions as a reduction of the month's savings (not income), so
 * the amount raises the month's available budget.
 *
 * The app keeps no savings balance (docs/calculations/07-sparziele.md), so
 * there is no cap: the household knows what is on its savings account. With
 * several savings categories the booking goes to the oldest one. `occurredAt`
 * is the instant of the request.
 *
 * Body (JSON):
 *   accountId?   string — defaults to the household's oldest account
 *   amountCents  number — integer 1..int4
 *   description? string — shown in the transaction list
 *
 * 201: { id, amountCents } | 400 validation | 404 account | 409 no savings category
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { INT4_MAX } from "../../transactions/schema";
import { findSavingsBookingCategoryId } from "../savings";

const WithdrawInput = z.object({
  accountId: z.string().min(1).optional(),
  amountCents: z.number().int().positive().max(INT4_MAX),
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

  const created = await prisma.transaction.create({
    data: {
      accountId: account.id,
      categoryId: savingsCatId,
      createdByUserId: user.id,
      // Positive: money returns from the savings to the current account.
      amountCents: payload.amountCents,
      description: payload.description ?? "Savings withdrawal",
      occurredAt: new Date()
    }
  });

  return NextResponse.json({ id: created.id, amountCents: created.amountCents }, { status: 201 });
}
