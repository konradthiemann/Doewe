// GET  /api/auth/reset-password?token=... → { valid: boolean }   (link precheck)
// POST /api/auth/reset-password                                    (perform reset)
// Public (no auth). POST body: { token: string, newPassword: string (min 8) }.
// Tokens are single-use and expire; only the SHA-256 hash is stored.
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { hashResetToken, MIN_PASSWORD_LENGTH } from "../../../../lib/passwordReset";
import { prisma } from "../../../../lib/prisma";
import { enforceRateLimit, getClientIp } from "../../../../lib/rateLimit";

export async function GET(request: Request) {
  const limited = enforceRateLimit(`reset-check:ip:${getClientIp(request)}`, 30, 15 * 60 * 1000);
  if (limited) return limited;

  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ valid: false });

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
  });
  const valid = !!record && !record.usedAt && record.expiresAt > new Date();
  return NextResponse.json({ valid });
}

const ResetPasswordInput = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH),
});

export async function POST(request: Request) {
  const limited = enforceRateLimit(`reset:ip:${getClientIp(request)}`, 10, 15 * 60 * 1000);
  if (limited) return limited;

  const json = await request.json().catch(() => null);
  const parsed = ResetPasswordInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { token, newPassword } = parsed.data;
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
  });

  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    return NextResponse.json({ error: "INVALID_OR_EXPIRED_TOKEN" }, { status: 400 });
  }

  const hashed = await hash(newPassword, 10);
  await prisma.$transaction([
    // passwordChangedAt evicts JWT sessions issued before this reset.
    prisma.user.update({ where: { id: record.userId }, data: { password: hashed, passwordChangedAt: new Date() } }),
    // Single-use: consume this token and drop the user's other tokens.
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: record.userId, id: { not: record.id } } }),
  ]);

  return NextResponse.json({ ok: true });
}
