import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../../lib/prisma";
import { createUserWithDefaults } from "../../../../lib/userProvisioning";

const RegisterInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional()
});

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

  const user = await createUserWithDefaults({
    email,
    name: name?.trim() || null,
    password: hashed
  });

  return NextResponse.json({ id: user.id, email: user.email, account: user.accounts[0] }, { status: 201 });
}
