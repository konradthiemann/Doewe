import { createHash, randomBytes } from "crypto";

/**
 * Helpers for the "forgot password" token flow.
 *
 * Security model:
 * - The plaintext token is a 256-bit random value, sent ONLY in the emailed
 *   reset link. It is never persisted.
 * - The database stores only the SHA-256 hash of the token. A stolen DB dump
 *   therefore cannot be used to reset passwords.
 * - Tokens are single-use (marked `usedAt`) and expire after {@link RESET_TOKEN_TTL_MS}.
 */

/** How long a reset link stays valid: 1 hour. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Minimum password length — kept in sync with the registration endpoint. */
export const MIN_PASSWORD_LENGTH = 8;

/** Generates a fresh reset token and its storable hash. */
export function createResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token) };
}

/** Hashes a plaintext reset token for storage / lookup. */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
