import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../lib/prisma";

const AllowedFrequencies = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
const RecurringInput = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  amountCents: z.number().int(),
  description: z.string().min(1),
  frequency: z.enum(AllowedFrequencies),
  nextOccurrence: z.union([z.string(), z.date()])
});

export async function GET() {
  const items = await prisma.recurringTransaction.findMany({
    orderBy: { nextOccurrence: "asc" }
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = RecurringInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const nextDate =
    typeof data.nextOccurrence === "string"
      ? new Date(data.nextOccurrence)
      : data.nextOccurrence;
  const created = await prisma.recurringTransaction.create({
    data: {
      accountId: data.accountId,
      categoryId: data.categoryId,
      amountCents: data.amountCents,
      description: data.description,
      frequency: data.frequency,
      nextOccurrence: nextDate
    }
  });
  return NextResponse.json(created, { status: 201 });
}
