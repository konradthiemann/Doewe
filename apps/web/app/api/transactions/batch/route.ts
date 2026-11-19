/**
 * POST /api/transactions/batch — Create grouped transactions from a receipt scan.
 *
 * Each group becomes one Transaction with its ReceiptLineItems attached. The
 * booked amount is the negated sum of the group's line totals: a positive group
 * total is an expense (negative amountCents), a negative one — a discount,
 * coupon or refund that ended up alone in its category — is booked as a positive
 * row, so the rows of one receipt always add up to minus the receipt total.
 * Groups that net to zero are skipped; if nothing is left to book: 400.
 * After the commit the budget alert is checked for each booked group.
 *
 * Body (JSON):
 *   receiptDate      string  — calendar day `yyyy-mm-dd`; stored as 12:00
 *                              Europe/Berlin of that day
 *   receiptMerchant? string  — stored on each transaction
 *   accountId        string  — must belong to the household
 *   taxRelevant?     boolean — absent: each transaction inherits `isTaxRelevant`
 *                              of its category
 *   groups           [{ categoryId, items: [{ name, quantity?, unitPriceCents,
 *                       totalCents, position }] }] — cents are integers
 *
 * 201 { transactions: [{ id, categoryId, amountCents, description, lineItemCount }] }
 * 400 validation (plain string naming the field) | 404 account / category
 *
 * Auth: Required. Household-scoped.
 */
import { parseDayKey, zonedTimeToUtc } from "@doewe/shared";
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../../lib/auth";
import { checkBudgetAlerts } from "../../../../lib/budgetAlerts";
import { prisma } from "../../../../lib/prisma";

import { BatchTransactionInput } from "./schema";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Invalid JSON → null → fails validation (400 instead of 500).
  const json: unknown = await req.json().catch(() => null);
  const parsed = BatchTransactionInput.safeParse(json);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
      .join("; ");
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const data = parsed.data;

  // The schema already validated the day; the guard only narrows the type.
  const receiptDay = parseDayKey(data.receiptDate);
  if (!receiptDay) {
    return NextResponse.json({ error: "receiptDate: Expected a calendar day (yyyy-mm-dd)" }, { status: 400 });
  }
  // An instant created for a calendar day is noon in Berlin (Grundregeln §1).
  const occurredAt = zonedTimeToUtc({ ...receiptDay, hour: 12 });

  const groups = data.groups
    .map((group) => ({
      ...group,
      totalCents: group.items.reduce((sum, item) => sum + item.totalCents, 0)
    }))
    .filter((group) => group.totalCents !== 0);
  if (groups.length === 0) {
    return NextResponse.json({ error: "groups: Nothing to book, every group nets to zero" }, { status: 400 });
  }

  // Verify account belongs to household
  const account = await prisma.account.findFirst({
    where: { id: data.accountId, householdId: user.householdId }
  });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Verify all categories belong to household
  const categoryIds = data.groups.map((g) => g.categoryId);
  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds }, householdId: user.householdId }
  });
  if (categories.length !== new Set(categoryIds).size) {
    return NextResponse.json({ error: "One or more categories not found" }, { status: 404 });
  }

  // Create all transactions + line items atomically
  const created = await prisma.$transaction(async (tx) => {
    const results: Array<{
      id: string;
      categoryId: string;
      amountCents: number;
      description: string;
      lineItemCount: number;
    }> = [];

    for (const group of groups) {
      const category = categories.find((c) => c.id === group.categoryId);
      const description = group.items.map((i) => i.name).join(", ");

      const transaction = await tx.transaction.create({
        data: {
          accountId: data.accountId,
          categoryId: group.categoryId,
          createdByUserId: user.id,
          // Signed, not -Math.abs(): a group that nets negative (discount or
          // refund) gives money back and must not be booked as an expense.
          amountCents: -group.totalCents,
          description,
          occurredAt,
          taxRelevant: data.taxRelevant ?? category?.isTaxRelevant ?? false,
          receiptMerchant: data.receiptMerchant ?? null,
          receiptLineItems: {
            createMany: {
              data: group.items.map((item) => ({
                name: item.name,
                quantity: item.quantity,
                unitPriceCents: item.unitPriceCents,
                totalCents: item.totalCents,
                position: item.position
              }))
            }
          }
        }
      });

      results.push({
        id: transaction.id,
        categoryId: group.categoryId,
        amountCents: transaction.amountCents,
        description: transaction.description,
        lineItemCount: group.items.length
      });
    }

    return results;
  });

  // Budget alert, as after a single booking: once per booked group, one after
  // the other (two groups may share a category). Awaited; errors are swallowed
  // inside, the receipt never fails on a push problem.
  for (const booked of created) {
    await checkBudgetAlerts({ householdId: user.householdId, categoryId: booked.categoryId, occurredAt });
  }

  return NextResponse.json({ transactions: created }, { status: 201 });
}
