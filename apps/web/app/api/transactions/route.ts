import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

import { TransactionInput } from "./schema";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.transaction.findMany({
    where: { account: { userId: user.id } },
    orderBy: { occurredAt: "desc" }
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = TransactionInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const occurredAt =
    typeof data.occurredAt === "string" ? new Date(data.occurredAt) : data.occurredAt;

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
    const created = await prisma.transaction.create({
      data: {
        accountId: data.accountId,
        categoryId: data.categoryId ?? null,
        amountCents: data.amountCents,
        description: data.description,
        occurredAt
      }
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json({ error: "Invalid account or category reference" }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 });
  }
}
