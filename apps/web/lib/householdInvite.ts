import { createHash, randomBytes } from "crypto";

/**
 * Helpers for the household invite token flow (Teil D).
 *
 * Security model (mirrors lib/passwordReset.ts):
 * - The plaintext token is a 256-bit random value, shared ONLY via the invite
 *   link / QR code. It is never persisted.
 * - The database stores only the SHA-256 hash. A stolen DB dump therefore
 *   cannot be used to join a household.
 * - Invites are single-use (marked `acceptedAt`) and expire after
 *   {@link INVITE_TOKEN_TTL_MS}.
 */

/** How long an invite link stays valid: 7 days. */
export const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Generates a fresh invite token and its storable hash. */
export function createInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

/** Hashes a plaintext invite token for storage / lookup. */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
