import { NextResponse } from "next/server";

/**
 * Tiny in-memory fixed-window rate limiter.
 *
 * Adequate for this single-instance Railway deployment: it protects the public
 * auth endpoints from email-bombing and bcrypt/CPU abuse. It resets on restart
 * and is per-process (not shared across instances) — swap for a Redis/Upstash
 * backend if the app is ever scaled horizontally.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function pruneExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Pure limiter: records a hit for `key` and reports whether it is allowed. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size > MAX_BUCKETS) pruneExpired(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  bucket.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/** Best-effort client IP from proxy headers (Railway sets x-forwarded-for). */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Enforces a rate limit, returning a 429 response when exceeded, else null.
 * No-ops in the test environment so integration tests are not throttled
 * (the pure {@link rateLimit} is unit-tested directly instead).
 */
export function enforceRateLimit(key: string, limit: number, windowMs: number): NextResponse | null {
  if (process.env.NODE_ENV === "test") return null;

  const result = rateLimit(key, limit, windowMs);
  if (result.ok) return null;

  return NextResponse.json(
    { error: "RATE_LIMITED" },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } }
  );
}
