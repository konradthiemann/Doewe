import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Integrationstests für GET/POST /api/admin/users/* (Bearer-Token-Auth, kein Session-Bypass nötig)

const SERVICE_TOKEN = "test-service-token-admin-users";
process.env.DOEWE_SERVICE_TOKEN = SERVICE_TOKEN;

const OWNER_USER_ID = "test-user-admin-users-owner";
const SUSPEND_USER_ID = "test-user-admin-users-suspend";
const DELETE_USER_ID = "test-user-admin-users-delete";
const EVICT_USER_ID = "test-user-admin-users-evict";

let prisma: import("@prisma/client").PrismaClient;
let ownerHouseholdId: string;

function authedRequest(url: string, init?: RequestInit) {
  return new Request(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${SERVICE_TOKEN}` }
  });
}

function jsonPost(url: string, body: unknown) {
  return authedRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const owner = await prisma.user.upsert({
    where: { email: "admin-users-owner@example.com" },
    update: { suspendedAt: null, deletedAt: null },
    create: { id: OWNER_USER_ID, email: "admin-users-owner@example.com", password: "hashed" }
  });
  await prisma.user.upsert({
    where: { email: "admin-users-suspend@example.com" },
    update: { suspendedAt: null, deletedAt: null },
    create: { id: SUSPEND_USER_ID, email: "admin-users-suspend@example.com", password: "hashed" }
  });
  await prisma.user.upsert({
    where: { email: "admin-users-delete@example.com" },
    update: { suspendedAt: null, deletedAt: null },
    create: { id: DELETE_USER_ID, email: "admin-users-delete@example.com", password: "hashed" }
  });
  await prisma.user.upsert({
    where: { email: "admin-users-evict@example.com" },
    update: { suspendedAt: null, deletedAt: null },
    create: { id: EVICT_USER_ID, email: "admin-users-evict@example.com", password: "hashed" }
  });

  ownerHouseholdId = await ensureTestHousehold(prisma, owner.id, "Admin Users Test Household");
  await ensureTestHousehold(prisma, SUSPEND_USER_ID, "Admin Users Suspend Household");
  await ensureTestHousehold(prisma, DELETE_USER_ID, "Admin Users Delete Household");
  await ensureTestHousehold(prisma, EVICT_USER_ID, "Admin Users Evict Household");

  await prisma.loginEvent.deleteMany({ where: { userId: owner.id } });
  await prisma.loginEvent.create({ data: { userId: owner.id, householdId: ownerHouseholdId } });

  await prisma.adminActionLog.deleteMany({
    where: { targetType: "user", targetId: { in: [SUSPEND_USER_ID, DELETE_USER_ID] } }
  });
});

afterAll(async () => {
  if (prisma) {
    await prisma.adminActionLog.deleteMany({
      where: { targetType: "user", targetId: { in: [SUSPEND_USER_ID, DELETE_USER_ID] } }
    });
    await prisma.loginEvent.deleteMany({
      where: { userId: { in: [OWNER_USER_ID, SUSPEND_USER_ID, DELETE_USER_ID, EVICT_USER_ID] } }
    });
    await cleanupTestHousehold(prisma, OWNER_USER_ID);
    await cleanupTestHousehold(prisma, SUSPEND_USER_ID);
    await cleanupTestHousehold(prisma, DELETE_USER_ID);
    await cleanupTestHousehold(prisma, EVICT_USER_ID);
    await prisma.user.deleteMany({
      where: { id: { in: [OWNER_USER_ID, SUSPEND_USER_ID, DELETE_USER_ID, EVICT_USER_ID] } }
    });
    await prisma.$disconnect();
  }
});

describe("GET /api/admin/users", () => {
  it("rejects requests without a valid service token", async () => {
    const { GET } = await import("../app/api/admin/users/route");

    const noAuth = await GET(new Request("http://localhost/api/admin/users"));
    expect(noAuth.status).toBe(401);

    const wrongAuth = await GET(
      new Request("http://localhost/api/admin/users", { headers: { Authorization: "Bearer wrong-token" } })
    );
    expect(wrongAuth.status).toBe(401);
  });

  it("returns a paginated list including householdId and lastLoginAt", async () => {
    const { GET } = await import("../app/api/admin/users/route");

    const res = await GET(authedRequest("http://localhost/api/admin/users?page=1&pageSize=200"));
    expect(res.status).toBe(200);

    const body: {
      page: number;
      pageSize: number;
      total: number;
      users: Array<{
        id: string;
        email: string;
        householdId: string | null;
        suspendedAt: string | null;
        deletedAt: string | null;
        lastLoginAt: string | null;
      }>;
    } = await res.json();

    expect(body.page).toBe(1);
    expect(body.total).toBeGreaterThanOrEqual(4);

    const owner = body.users.find((u) => u.id === OWNER_USER_ID);
    expect(owner).toBeDefined();
    expect(owner!.householdId).toBe(ownerHouseholdId);
    expect(owner!.suspendedAt).toBeNull();
    expect(owner!.deletedAt).toBeNull();
    expect(owner!.lastLoginAt).not.toBeNull();

    const neverLoggedIn = body.users.find((u) => u.id === SUSPEND_USER_ID);
    expect(neverLoggedIn?.lastLoginAt).toBeNull();
  });

  it("rejects an invalid pageSize", async () => {
    const { GET } = await import("../app/api/admin/users/route");
    const res = await GET(authedRequest("http://localhost/api/admin/users?pageSize=9999"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/users/:id/suspend", () => {
  it("rejects requests without a valid service token", async () => {
    const { POST } = await import("../app/api/admin/users/[id]/suspend/route");
    const res = await POST(
      new Request(`http://localhost/api/admin/users/${SUSPEND_USER_ID}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended: true })
      }),
      { params: { id: SUSPEND_USER_ID } }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown user", async () => {
    const { POST } = await import("../app/api/admin/users/[id]/suspend/route");
    const res = await POST(jsonPost("http://localhost/api/admin/users/does-not-exist/suspend", { suspended: true }), {
      params: { id: "does-not-exist" }
    });
    expect(res.status).toBe(404);
  });

  it("rejects a malformed body", async () => {
    const { POST } = await import("../app/api/admin/users/[id]/suspend/route");
    const res = await POST(
      jsonPost(`http://localhost/api/admin/users/${SUSPEND_USER_ID}/suspend`, { suspended: "yes" }),
      { params: { id: SUSPEND_USER_ID } }
    );
    expect(res.status).toBe(400);
  });

  it("suspends and unsuspends a user, logging both actions", async () => {
    const { POST } = await import("../app/api/admin/users/[id]/suspend/route");

    const suspendRes = await POST(
      jsonPost(`http://localhost/api/admin/users/${SUSPEND_USER_ID}/suspend`, { suspended: true }),
      { params: { id: SUSPEND_USER_ID } }
    );
    expect(suspendRes.status).toBe(200);
    const suspendBody = await suspendRes.json();
    expect(suspendBody.suspendedAt).not.toBeNull();

    const suspended = await prisma.user.findUnique({ where: { id: SUSPEND_USER_ID } });
    expect(suspended?.suspendedAt).not.toBeNull();

    const unsuspendRes = await POST(
      jsonPost(`http://localhost/api/admin/users/${SUSPEND_USER_ID}/suspend`, { suspended: false }),
      { params: { id: SUSPEND_USER_ID } }
    );
    expect(unsuspendRes.status).toBe(200);
    const unsuspendBody = await unsuspendRes.json();
    expect(unsuspendBody.suspendedAt).toBeNull();

    const unsuspended = await prisma.user.findUnique({ where: { id: SUSPEND_USER_ID } });
    expect(unsuspended?.suspendedAt).toBeNull();

    const logs = await prisma.adminActionLog.findMany({
      where: { targetType: "user", targetId: SUSPEND_USER_ID },
      orderBy: { createdAt: "asc" }
    });
    expect(logs.map((l) => l.action)).toEqual(["suspend", "unsuspend"]);
    expect(logs.every((l) => l.actor === "control-plane")).toBe(true);
  });
});

describe("POST /api/admin/users/:id/delete", () => {
  it("rejects requests without a valid service token", async () => {
    const { POST } = await import("../app/api/admin/users/[id]/delete/route");
    const res = await POST(new Request(`http://localhost/api/admin/users/${DELETE_USER_ID}/delete`, { method: "POST" }), {
      params: { id: DELETE_USER_ID }
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown user", async () => {
    const { POST } = await import("../app/api/admin/users/[id]/delete/route");
    const res = await POST(authedRequest("http://localhost/api/admin/users/does-not-exist/delete", { method: "POST" }), {
      params: { id: "does-not-exist" }
    });
    expect(res.status).toBe(404);
  });

  it("soft-deletes a user (never a hard delete) and is idempotent", async () => {
    const { POST } = await import("../app/api/admin/users/[id]/delete/route");

    const res = await POST(
      authedRequest(`http://localhost/api/admin/users/${DELETE_USER_ID}/delete`, { method: "POST" }),
      { params: { id: DELETE_USER_ID } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deletedAt).not.toBeNull();

    const deleted = await prisma.user.findUnique({ where: { id: DELETE_USER_ID } });
    expect(deleted).not.toBeNull(); // row still exists — soft delete only
    expect(deleted?.deletedAt).not.toBeNull();

    // Second call is idempotent: no error, no duplicate log entry.
    const secondRes = await POST(
      authedRequest(`http://localhost/api/admin/users/${DELETE_USER_ID}/delete`, { method: "POST" }),
      { params: { id: DELETE_USER_ID } }
    );
    expect(secondRes.status).toBe(200);

    const logs = await prisma.adminActionLog.findMany({
      where: { targetType: "user", targetId: DELETE_USER_ID, action: "delete" }
    });
    expect(logs).toHaveLength(1);
  });
});

describe("suspend/delete evict existing sessions immediately", () => {
  // The `jwt` callback in authOptions.ts is what NextAuth actually re-invokes
  // on every request when using the JWT session strategy — mirroring exactly
  // how the existing `passwordChangedAt` eviction is exercised. We call it
  // directly here rather than only asserting the DB field, since the real
  // behavior that matters is that a token issued BEFORE suspension is
  // rejected on its NEXT validation, without requiring a fresh login.
  async function callJwt(token: Record<string, unknown>) {
    // Dynamic import (not a top-level static import): authOptions.ts pulls in
    // env.ts, which validates DATABASE_URL eagerly at import time. Prisma
    // only loads apps/web/.env as a side effect of constructing PrismaClient
    // (done in beforeAll above) — a static top-level import here would run
    // before that and fail validation.
    const { authOptions } = await import("../lib/authOptions");
    const jwtCallback = authOptions.callbacks?.jwt;
    if (!jwtCallback) throw new Error("authOptions.callbacks.jwt is not configured");
    return jwtCallback({ token } as Parameters<NonNullable<typeof jwtCallback>>[0]);
  }

  it("rejects an already-issued token once the user is suspended", async () => {
    // Simulate a token issued before suspension (pwdStamp 0 = never changed).
    const issuedToken = { userId: EVICT_USER_ID, pwdStamp: 0 };

    const beforeSuspend = await callJwt({ ...issuedToken });
    expect((beforeSuspend as { userId?: string }).userId).toBe(EVICT_USER_ID);

    await prisma.user.update({ where: { id: EVICT_USER_ID }, data: { suspendedAt: new Date() } });

    const afterSuspend = await callJwt({ ...issuedToken });
    expect((afterSuspend as { userId?: string }).userId).toBeUndefined();

    await prisma.user.update({ where: { id: EVICT_USER_ID }, data: { suspendedAt: null } });
  });

  it("rejects an already-issued token once the user is soft-deleted", async () => {
    const issuedToken = { userId: EVICT_USER_ID, pwdStamp: 0 };

    const beforeDelete = await callJwt({ ...issuedToken });
    expect((beforeDelete as { userId?: string }).userId).toBe(EVICT_USER_ID);

    await prisma.user.update({ where: { id: EVICT_USER_ID }, data: { deletedAt: new Date() } });

    const afterDelete = await callJwt({ ...issuedToken });
    expect((afterDelete as { userId?: string }).userId).toBeUndefined();
  });
});
