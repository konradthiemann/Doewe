/**
 * POST /api/transactions/batch — Create grouped transactions from a receipt scan.
 *
 * Each group becomes one Transaction (negative amountCents = expense) with
 * ReceiptLineItems attached. The receipt merchant is stored on each transaction.
 *
 * Auth: Required. Household-scoped.
 */
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

import { BatchTransactionInput } from "./schema";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = BatchTransactionInput.safeParse(json);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const data = parsed.data;

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

  const occurredAt = new Date(data.receiptDate);

  // Create all transactions + line items atomically
  const created = await prisma.$transaction(async (tx) => {
    const results: Array<{
      id: string;
      categoryId: string;
      amountCents: number;
      description: string;
      lineItemCount: number;
    }> = [];

    for (const group of data.groups) {
      const totalCents = group.items.reduce((sum, item) => sum + item.totalCents, 0);
      const category = categories.find((c) => c.id === group.categoryId);
      const description = group.items.map((i) => i.name).join(", ");

      const transaction = await tx.transaction.create({
        data: {
          accountId: data.accountId,
          categoryId: group.categoryId,
          createdByUserId: user.id,
          amountCents: -Math.abs(totalCents),
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

  return NextResponse.json({ transactions: created }, { status: 201 });
}
