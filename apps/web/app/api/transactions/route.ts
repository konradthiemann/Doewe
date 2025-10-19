import { ensureNonEmpty } from "@doewe/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../lib/prisma";

const TransactionInput = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  amountCents: z.number().int(),
  description: z.string().transform((s) => ensureNonEmpty(s)),
  occurredAt: z.union([z.string(), z.date()])
});

export async function GET() {
  const items = await prisma.transaction.findMany({
    orderBy: { occurredAt: "desc" }
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = TransactionInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const occurredAt =
    typeof data.occurredAt === "string" ? new Date(data.occurredAt) : data.occurredAt;

  const created = await prisma.transaction.create({
    data: {
      accountId: data.accountId,
      categoryId: data.categoryId,
      amountCents: data.amountCents,
      description: data.description,
      occurredAt
    }
  });

  return NextResponse.json(created, { status: 201 });
}
