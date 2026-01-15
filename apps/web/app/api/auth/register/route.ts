import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../../lib/prisma";

const RegisterInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional()
});

const DEFAULT_ACCOUNT_NAME = "Main Account";
const DEFAULT_CATEGORIES = {
  income: ["Salary", "Bonus", "Other income"],
  outcome: ["Groceries", "Rent", "Utilities", "Transport", "Entertainment", "Health", "Misc"]
};

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = RegisterInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "User already exists" }, { status: 409 });
  }

  const hashed = await hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      name: name?.trim() || null,
      password: hashed,
      accounts: {
        create: { name: DEFAULT_ACCOUNT_NAME }
      }
    },
    include: {
      accounts: { select: { id: true, name: true } }
    }
  });

  await prisma.category.createMany({
    data: [
      ...DEFAULT_CATEGORIES.income.map((c) => ({ name: c, isIncome: true, userId: user.id })),
      ...DEFAULT_CATEGORIES.outcome.map((c) => ({ name: c, isIncome: false, userId: user.id })),
      { name: "Savings", isIncome: false, userId: user.id }
    ],
    skipDuplicates: true
  });

  return NextResponse.json({ id: user.id, email: user.email, account: user.accounts[0] }, { status: 201 });
}
