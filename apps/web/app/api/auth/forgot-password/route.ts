// POST /api/auth/forgot-password
// Starts the "forgot password" flow. Public (no auth).
// Body: { email: string, locale?: "de" | "en" }
// Always responds with a generic 200 — it never reveals whether an account
// exists (prevents email enumeration).
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "../../../../env";
import { sendPasswordResetEmail } from "../../../../lib/mailer";
import { createResetToken, RESET_TOKEN_TTL_MS } from "../../../../lib/passwordReset";
import { prisma } from "../../../../lib/prisma";
import { enforceRateLimit, getClientIp } from "../../../../lib/rateLimit";

const ForgotPasswordInput = z.object({
  email: z.string().email(),
  locale: z.enum(["de", "en"]).optional(),
});

/**
 * Trusted base URL for the reset link. We use the configured canonical URL and
 * NEVER the request's Host header in production (host-header injection would let
 * an attacker mint a reset link pointing at their own domain and steal the
 * token). Outside production we fall back to the request origin for convenience.
 * Returns null if no trusted base is available.
 */
function resolveBaseUrl(request: Request): string | null {
  const configured = env.NEXTAUTH_URL ?? env.NUXTAUTH_URL;
  if (configured) {
    const withProtocol = configured.startsWith("http") ? configured : `https://${configured}`;
    return withProtocol.replace(/\/+$/, ""); // strip trailing slash(es)
  }
  if (env.NODE_ENV !== "production") return new URL(request.url).origin;
  return null;
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = ForgotPasswordInput.safeParse(json);
  // Same generic answer for malformed input, unknown emails and success.
  if (!parsed.success) return NextResponse.json({ ok: true });

  const { email, locale } = parsed.data;

  // Throttle by IP and by email (a 429 reveals nothing about account existence).
  const ipLimited = enforceRateLimit(`forgot:ip:${getClientIp(request)}`, 5, 15 * 60 * 1000);
  if (ipLimited) return ipLimited;
  const emailLimited = enforceRateLimit(`forgot:email:${email.toLowerCase()}`, 5, 60 * 60 * 1000);
  if (emailLimited) return emailLimited;

  // Wrap everything so a DB/transient failure still yields the generic 200 —
  // otherwise a 500 (only reachable for known emails) would leak account existence.
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      // Invalidate any previous outstanding tokens, then issue a fresh one.
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      const { token, tokenHash } = createResetToken();
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });

      const base = resolveBaseUrl(request);
      if (base) {
        const resetUrl = new URL("/reset-password", base);
        resetUrl.searchParams.set("token", token);
        // Fire-and-forget: do NOT await the outbound send. Awaiting the HTTPS
        // round-trip would make responses for known emails measurably slower
        // than for unknown ones, defeating the anti-enumeration contract.
        // (Runs on Railway's long-lived Node server, so the promise resolves.)
        void sendPasswordResetEmail({ to: email, resetUrl: resetUrl.toString(), locale }).catch((err) => {
          // eslint-disable-next-line no-console -- server-side observability for a swallowed error
          console.error("[forgot-password] email send failed", err);
        });
      } else {
        // eslint-disable-next-line no-console -- server-side observability for a misconfiguration
        console.error("[forgot-password] no trusted base URL (set NEXTAUTH_URL); reset email skipped");
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console -- server-side observability for a swallowed error
    console.error("[forgot-password] unexpected error", err);
  }

  return NextResponse.json({ ok: true });
}
