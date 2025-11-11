import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../lib/prisma";

const AccountInput = z.object({
  name: z.string().min(1, "Name is required")
});

export async function GET() {
  const items = await prisma.account.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = AccountInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const created = await prisma.account.create({ data: { name: parsed.data.name } });
  return NextResponse.json(created, { status: 201 });
}
