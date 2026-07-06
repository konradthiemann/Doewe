import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Type-safe, validated environment variables.
 * Validated at server startup — missing required vars throw immediately.
 * Client-side vars must be prefixed with NEXT_PUBLIC_.
 *
 * Reference: https://env.t3.gg/docs/nextjs
 */
export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    /**
     * NEXTAUTH_SECRET is required. Railway may provide it as NUXTAUTH_SECRET
     * (typo), so we accept both — the fallback is handled in authOptions.ts.
     */
    NEXTAUTH_SECRET: z.string().min(1).optional(),
    NUXTAUTH_SECRET: z.string().min(1).optional(),
    AUTH_SECRET: z.string().min(1).optional(),
    /** Canonical app URL. Railway may provide it as NUXTAUTH_URL. */
    NEXTAUTH_URL: z.string().url().optional(),
    NUXTAUTH_URL: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    /** Test-only bypass — must never be set in production. */
    TEST_USER_ID_BYPASS: z.string().optional(),
    TEST_USER_EMAIL_BYPASS: z.string().email().optional(),
    /**
     * SMTP transport for outgoing mail (e.g. Gmail: smtp.gmail.com:465 with an
     * App Password). Takes precedence over Resend when SMTP_HOST/USER/PASS are set.
     * Note: Railway disables outbound SMTP on Free/Trial/Hobby plans (Pro+ only).
     */
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    /**
     * Resend API key for sending transactional email (password reset links).
     * Used when SMTP is not configured. When neither SMTP nor Resend is set, the
     * mailer logs the reset link to the server console — fine for local dev only.
     */
    RESEND_API_KEY: z.string().optional(),
    /** Sender address for outgoing mail, e.g. `Doewe <konrad.thiemann@gmail.com>`. */
    EMAIL_FROM: z.string().optional(),
    /**
     * Google OAuth credentials. When BOTH are set, the "Sign in with Google"
     * option is enabled; otherwise it is hidden and only email/password works.
     */
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
  },
  client: {
    /**
     * Mirrors whether Google OAuth is configured server-side, so the login page
     * can conditionally render the Google button. Set to "1" when enabled.
     */
    NEXT_PUBLIC_GOOGLE_ENABLED: z.string().optional(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NUXTAUTH_SECRET: process.env.NUXTAUTH_SECRET,
    AUTH_SECRET: process.env.AUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NUXTAUTH_URL: process.env.NUXTAUTH_URL,
    NODE_ENV: process.env.NODE_ENV,
    TEST_USER_ID_BYPASS: process.env.TEST_USER_ID_BYPASS,
    TEST_USER_EMAIL_BYPASS: process.env.TEST_USER_EMAIL_BYPASS,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    NEXT_PUBLIC_GOOGLE_ENABLED: process.env.NEXT_PUBLIC_GOOGLE_ENABLED,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
