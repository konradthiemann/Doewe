import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

const CategoryInput = z.object({
  name: z.string().min(1, "Name is required"),
  isIncome: z.boolean().optional().default(false)
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.category.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = CategoryInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const created = await prisma.category.create({
    data: { name: parsed.data.name, isIncome: parsed.data.isIncome, userId: user.id }
  });
  return NextResponse.json(created, { status: 201 });
}
