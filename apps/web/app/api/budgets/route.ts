import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

const BudgetInput = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(1970).max(9999),
  amountCents: z.number().int()
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.budget.findMany({
    where: { account: { userId: user.id } },
    orderBy: [{ year: "desc" }, { month: "desc" }]
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = BudgetInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const account = await prisma.account.findFirst({ where: { id: parsed.data.accountId, userId: user.id } });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (parsed.data.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: parsed.data.categoryId, userId: user.id } });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
  }

  const created = await prisma.budget.create({ data: parsed.data });
  return NextResponse.json(created, { status: 201 });
}
