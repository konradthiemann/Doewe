import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The web-push send is awaited by the booking routes (through the budget
// alert). A push service that never answers must not hold the response open:
// the send gives up after PUSH_SEND_TIMEOUT_MS, counts as a failure and keeps
// the subscription (only 404/410 remove it). Transport, env and database are
// replaced; no real network or database is touched.

const sendNotification = vi.fn();
vi.mock("web-push", () => ({
  default: { sendNotification: (...args: unknown[]) => sendNotification(...args), setVapidDetails: vi.fn() }
}));
vi.mock("../env", () => ({
  env: { VAPID_PRIVATE_KEY: "private", NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public", VAPID_SUBJECT: "mailto:test@example.com" }
}));

const findMany = vi.fn();
const remove = vi.fn();
vi.mock("../lib/prisma", () => ({
  prisma: { pushSubscription: { findMany: (...args: unknown[]) => findMany(...args), delete: (...args: unknown[]) => remove(...args) } }
}));

const SUBS = [
  { id: "sub-hanging", endpoint: "https://push.example/hanging", p256dh: "k1", auth: "a1" },
  { id: "sub-ok", endpoint: "https://push.example/ok", p256dh: "k2", auth: "a2" }
];
const payload = { title: "Budget-Warnung", body: "Test" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  sendNotification.mockReset();
  findMany.mockReset().mockResolvedValue(SUBS);
  remove.mockReset().mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("sendPushToUser — timeout", () => {
  it("gives up on a push service that never answers, counts it as failed and keeps its subscription", async () => {
    const { sendPushToUser, PUSH_SEND_TIMEOUT_MS } = await import("../lib/push");
    sendNotification.mockImplementation((sub: { endpoint: string }) =>
      sub.endpoint.endsWith("hanging") ? new Promise(() => undefined) : Promise.resolve({ statusCode: 201 })
    );

    let settled: number | undefined;
    const pending = sendPushToUser("user-1", payload).then((count) => (settled = count));

    await vi.advanceTimersByTimeAsync(PUSH_SEND_TIMEOUT_MS - 1);
    expect(settled).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toBe(1);
    expect(remove).not.toHaveBeenCalled();
    // web-push also gets the timeout, so the socket itself is closed.
    expect(sendNotification.mock.calls[0][2]).toEqual({ timeout: PUSH_SEND_TIMEOUT_MS });
  });

  it("is a few seconds, not longer", async () => {
    const { PUSH_SEND_TIMEOUT_MS } = await import("../lib/push");
    expect(PUSH_SEND_TIMEOUT_MS).toBeGreaterThan(0);
    expect(PUSH_SEND_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });

  it("still removes a subscription the push service reports as gone (410)", async () => {
    const { sendPushToUser } = await import("../lib/push");
    sendNotification.mockImplementation((sub: { endpoint: string }) =>
      sub.endpoint.endsWith("hanging")
        ? Promise.reject(Object.assign(new Error("Gone"), { statusCode: 410 }))
        : Promise.resolve({ statusCode: 201 })
    );

    expect(await sendPushToUser("user-1", payload)).toBe(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith({ where: { id: "sub-hanging" } });
  });
});
