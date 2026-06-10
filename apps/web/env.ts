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
  },
  client: {},
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
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
