import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { TransactionInput } from "../schema";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json();
  const parsed = TransactionInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const occurredAt = typeof data.occurredAt === "string" ? new Date(data.occurredAt) : data.occurredAt;

  const existing = await prisma.transaction.findFirst({ where: { id: params.id, account: { userId: user.id } } });
  if (!existing) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  const account = await prisma.account.findFirst({ where: { id: data.accountId, userId: user.id } });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (data.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: data.categoryId, userId: user.id } });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
  }

  try {
    const updated = await prisma.transaction.update({
      where: { id: params.id },
      data: {
        accountId: data.accountId,
        categoryId: data.categoryId ?? null,
        amountCents: data.amountCents,
        description: data.description,
        occurredAt
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
      }
      if (error.code === "P2003") {
        return NextResponse.json({ error: "Invalid account or category reference" }, { status: 400 });
      }
    }

    return NextResponse.json({ error: "Failed to update transaction" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.transaction.findFirst({ where: { id: params.id, account: { userId: user.id } } });
  if (!existing) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  try {
    await prisma.transaction.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    throw error;
  }
}
