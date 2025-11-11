import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../lib/prisma";

const CategoryInput = z.object({
  name: z.string().min(1, "Name is required"),
  isIncome: z.boolean().optional().default(false)
});

export async function GET() {
  const items = await prisma.category.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = CategoryInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const created = await prisma.category.create({ data: { name: parsed.data.name, isIncome: parsed.data.isIncome } });
  return NextResponse.json(created, { status: 201 });
}
