// POST /api/auth/change-password
// Authenticated password change from Settings.
// Auth: requires a valid session (getSessionUser).
// Body: { currentPassword: string, newPassword: string (min 8) }
import { compare, hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../lib/auth";
import { MIN_PASSWORD_LENGTH } from "../../../../lib/passwordReset";
import { prisma } from "../../../../lib/prisma";
import { enforceRateLimit } from "../../../../lib/rateLimit";

const ChangePasswordInput = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(`change-pw:${user.id}`, 10, 15 * 60 * 1000);
  if (limited) return limited;

  const json = await request.json().catch(() => null);
  const parsed = ChangePasswordInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { currentPassword, newPassword } = parsed.data;

  const record = await prisma.user.findUnique({ where: { id: user.id } });
  if (!record) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Accounts created via an OAuth provider (e.g. Google) have no local password
  // to verify against — they must use the "forgot password" flow to set one.
  if (!record.password) {
    return NextResponse.json({ error: "NO_PASSWORD_SET" }, { status: 400 });
  }

  const currentOk = await compare(currentPassword, record.password);
  if (!currentOk) {
    return NextResponse.json({ error: "INVALID_CURRENT_PASSWORD" }, { status: 400 });
  }

  const unchanged = await compare(newPassword, record.password);
  if (unchanged) {
    return NextResponse.json({ error: "SAME_PASSWORD" }, { status: 400 });
  }

  const hashed = await hash(newPassword, 10);
  // passwordChangedAt evicts other JWT sessions issued before this change.
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, passwordChangedAt: new Date() },
  });
  // A password change invalidates any outstanding reset links.
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  return NextResponse.json({ ok: true });
}
