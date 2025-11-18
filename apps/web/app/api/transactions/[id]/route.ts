import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "../../../../lib/prisma";
import { TransactionInput } from "../schema";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const json = await request.json();
  const parsed = TransactionInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const occurredAt = typeof data.occurredAt === "string" ? new Date(data.occurredAt) : data.occurredAt;

  try {
    const updated = await prisma.transaction.update({
      where: { id: params.id },
      data: {
        accountId: data.accountId,
        categoryId: data.categoryId,
        amountCents: data.amountCents,
        description: data.description,
        occurredAt
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
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
