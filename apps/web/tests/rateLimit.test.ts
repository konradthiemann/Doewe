import { describe, expect, it, vi } from "vitest";

import { rateLimit } from "../lib/rateLimit";

describe("rateLimit", () => {
  it("allows up to the limit, then blocks", () => {
    const key = "unit-test-block";
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    }
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", () => {
    expect(rateLimit("unit-test-a", 1, 60_000).ok).toBe(true);
    expect(rateLimit("unit-test-a", 1, 60_000).ok).toBe(false);
    // A different key has its own fresh budget.
    expect(rateLimit("unit-test-b", 1, 60_000).ok).toBe(true);
  });

  it("resets once the window has elapsed", () => {
    vi.useFakeTimers();
    try {
      const key = "unit-test-window";
      expect(rateLimit(key, 1, 1000).ok).toBe(true);
      expect(rateLimit(key, 1, 1000).ok).toBe(false); // still within the window
      vi.advanceTimersByTime(1001); // window elapses
      expect(rateLimit(key, 1, 1000).ok).toBe(true); // fresh budget
    } finally {
      vi.useRealTimers();
    }
  });
});
