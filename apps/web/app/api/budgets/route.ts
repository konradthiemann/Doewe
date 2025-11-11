import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../lib/prisma";

const BudgetInput = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(1970).max(9999),
  amountCents: z.number().int()
});

export async function GET() {
  const items = await prisma.budget.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }]
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = BudgetInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const created = await prisma.budget.create({ data: parsed.data });
  return NextResponse.json(created, { status: 201 });
}
