import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Integrationstests für GET /api/admin/households und POST .../split-member
// (Bearer-Token-Auth, kein Session-Bypass nötig)

const SERVICE_TOKEN = "test-service-token-admin-households";
process.env.DOEWE_SERVICE_TOKEN = SERVICE_TOKEN;

const OWNER_USER_ID = "test-user-admin-hh-owner";
const MEMBER_USER_ID = "test-user-admin-hh-member";
const OUTSIDE_USER_ID = "test-user-admin-hh-outside";
const DELETE_OWNER_USER_ID = "test-user-admin-hh-del-owner";
const DELETE_MEMBER_USER_ID = "test-user-admin-hh-del-member";

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let outsideHouseholdId: string;
let deleteHouseholdId: string;
let testAccountId: string;
let newSplitHouseholdId: string | undefined;

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
    where: { email: "admin-hh-owner@example.com" },
    update: {},
    create: { id: OWNER_USER_ID, email: "admin-hh-owner@example.com", password: "hashed" }
  });
  const member = await prisma.user.upsert({
    where: { email: "admin-hh-member@example.com" },
    update: {},
    create: { id: MEMBER_USER_ID, email: "admin-hh-member@example.com", password: "hashed" }
  });
  await prisma.user.upsert({
    where: { email: "admin-hh-outside@example.com" },
    update: {},
    create: { id: OUTSIDE_USER_ID, email: "admin-hh-outside@example.com", password: "hashed" }
  });

  householdId = await ensureTestHousehold(prisma, owner.id, "Admin Households Test Household");
  await prisma.householdMember.upsert({
    where: { userId: member.id },
    update: { householdId, role: "MEMBER" },
    create: { userId: member.id, householdId, role: "MEMBER" }
  });
  outsideHouseholdId = await ensureTestHousehold(prisma, OUTSIDE_USER_ID, "Admin Households Outside Household");

  const deleteOwner = await prisma.user.upsert({
    where: { email: "admin-hh-del-owner@example.com" },
    update: { deletedAt: null },
    create: { id: DELETE_OWNER_USER_ID, email: "admin-hh-del-owner@example.com", password: "hashed" }
  });
  const deleteMember = await prisma.user.upsert({
    where: { email: "admin-hh-del-member@example.com" },
    update: { deletedAt: null },
    create: { id: DELETE_MEMBER_USER_ID, email: "admin-hh-del-member@example.com", password: "hashed" }
  });
  deleteHouseholdId = await ensureTestHousehold(prisma, deleteOwner.id, "Admin Households Delete Household");
  await prisma.householdMember.upsert({
    where: { userId: deleteMember.id },
    update: { householdId: deleteHouseholdId, role: "MEMBER" },
    create: { userId: deleteMember.id, householdId: deleteHouseholdId, role: "MEMBER" }
  });
  await prisma.household.update({ where: { id: deleteHouseholdId }, data: { deletedAt: null } });

  await prisma.receiptLineItem.deleteMany({ where: { transaction: { account: { householdId } } } });
  await prisma.transaction.deleteMany({ where: { account: { householdId } } });
  await prisma.account.deleteMany({ where: { householdId } });

  const account = await prisma.account.create({
    data: { id: "acc_admin_hh_test", name: "Admin Households Test Account", userId: owner.id, householdId }
  });
  testAccountId = account.id;

  const tx1 = await prisma.transaction.create({
    data: { accountId: testAccountId, amountCents: -1000, description: "Zählt", occurredAt: new Date("2026-01-15") }
  });
  await prisma.transaction.create({
    data: {
      accountId: testAccountId,
      amountCents: -500,
      description: "Soft-gelöscht, zählt nicht",
      occurredAt: new Date("2026-01-16"),
      deletedAt: new Date()
    }
  });
  // Two line items on ONE transaction — a single receipt scan, must count once.
  await prisma.receiptLineItem.create({
    data: { transactionId: tx1.id, name: "Position 1", quantity: 1, unitPriceCents: 500, totalCents: 500, position: 0 }
  });
  await prisma.receiptLineItem.create({
    data: { transactionId: tx1.id, name: "Position 2", quantity: 1, unitPriceCents: 500, totalCents: 500, position: 1 }
  });
});

afterAll(async () => {
  if (prisma) {
    await prisma.adminActionLog.deleteMany({ where: { targetType: "household", targetId: householdId } });
    await prisma.receiptLineItem.deleteMany({ where: { transaction: { accountId: testAccountId } } });
    await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
    await prisma.account.deleteMany({ where: { id: testAccountId } });
    if (newSplitHouseholdId) {
      await prisma.account.deleteMany({ where: { householdId: newSplitHouseholdId } });
      await prisma.category.deleteMany({ where: { householdId: newSplitHouseholdId } });
      await prisma.householdMember.deleteMany({ where: { householdId: newSplitHouseholdId } });
      await prisma.household.deleteMany({ where: { id: newSplitHouseholdId } });
    }
    await prisma.adminActionLog.deleteMany({ where: { targetType: "household", targetId: deleteHouseholdId } });
    await cleanupTestHousehold(prisma, OWNER_USER_ID);
    await cleanupTestHousehold(prisma, MEMBER_USER_ID);
    await cleanupTestHousehold(prisma, OUTSIDE_USER_ID);
    await prisma.householdMember.deleteMany({ where: { userId: { in: [DELETE_OWNER_USER_ID, DELETE_MEMBER_USER_ID] } } });
    await prisma.household.deleteMany({ where: { id: deleteHouseholdId } });
    await prisma.user.deleteMany({
      where: { id: { in: [OWNER_USER_ID, MEMBER_USER_ID, OUTSIDE_USER_ID, DELETE_OWNER_USER_ID, DELETE_MEMBER_USER_ID] } }
    });
    await prisma.$disconnect();
  }
});

describe("GET /api/admin/households", () => {
  it("rejects requests without a valid service token", async () => {
    const { GET } = await import("../app/api/admin/households/route");

    const noAuth = await GET(new Request("http://localhost/api/admin/households"));
    expect(noAuth.status).toBe(401);

    const wrongAuth = await GET(
      new Request("http://localhost/api/admin/households", { headers: { Authorization: "Bearer wrong-token" } })
    );
    expect(wrongAuth.status).toBe(401);
  });

  it("returns per-household counts, excluding soft-deleted transactions", async () => {
    const { GET } = await import("../app/api/admin/households/route");

    const res = await GET(authedRequest("http://localhost/api/admin/households"));
    expect(res.status).toBe(200);

    const body: {
      households: Array<{
        id: string;
        memberCount: number;
        accountsCount: number;
        transactionsCount: number;
        receiptScanCount: number;
      }>;
    } = await res.json();

    const household = body.households.find((h) => h.id === householdId);
    expect(household).toBeDefined();
    expect(household!.memberCount).toBe(2);
    expect(household!.accountsCount).toBe(1);
    expect(household!.transactionsCount).toBe(1); // the soft-deleted one must not count
    expect(household!.receiptScanCount).toBe(1); // two line items, one transaction

    const outside = body.households.find((h) => h.id === outsideHouseholdId);
    expect(outside).toBeDefined();
    expect(outside!.memberCount).toBe(1);
  });
});

describe("POST /api/admin/households/:id/split-member", () => {
  it("rejects requests without a valid service token", async () => {
    const { POST } = await import("../app/api/admin/households/[id]/split-member/route");
    const res = await POST(
      new Request(`http://localhost/api/admin/households/${householdId}/split-member`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: MEMBER_USER_ID })
      }),
      { params: { id: householdId } }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when the user is not a member of the given household", async () => {
    const { POST } = await import("../app/api/admin/households/[id]/split-member/route");
    const res = await POST(jsonPost(`http://localhost/api/admin/households/${householdId}/split-member`, { userId: OUTSIDE_USER_ID }), {
      params: { id: householdId }
    });
    expect(res.status).toBe(404);
  });

  it("rejects a malformed body", async () => {
    const { POST } = await import("../app/api/admin/households/[id]/split-member/route");
    const res = await POST(jsonPost(`http://localhost/api/admin/households/${householdId}/split-member`, {}), {
      params: { id: householdId }
    });
    expect(res.status).toBe(400);
  });

  it("splits the member into a fresh household, leaving old data untouched", async () => {
    const { POST } = await import("../app/api/admin/households/[id]/split-member/route");

    const res = await POST(jsonPost(`http://localhost/api/admin/households/${householdId}/split-member`, { userId: MEMBER_USER_ID }), {
      params: { id: householdId }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.newHouseholdId).toBeTypeOf("string");
    expect(body.newHouseholdId).not.toBe(householdId);
    newSplitHouseholdId = body.newHouseholdId;

    const membership = await prisma.householdMember.findUnique({ where: { userId: MEMBER_USER_ID } });
    expect(membership?.householdId).toBe(newSplitHouseholdId);
    expect(membership?.role).toBe("OWNER");

    // The OLD household's account/transaction stay put — not moved by the split.
    const account = await prisma.account.findUnique({ where: { id: testAccountId } });
    expect(account?.householdId).toBe(householdId);
    // The raw PrismaClient used in tests has no soft-delete extension (that
    // lives only on the app's singleton in lib/prisma.ts) — filter explicitly.
    const txCount = await prisma.transaction.count({ where: { accountId: testAccountId, deletedAt: null } });
    expect(txCount).toBe(1);

    // The departing member gets a fresh default account in the new household.
    const newAccounts = await prisma.account.findMany({ where: { householdId: newSplitHouseholdId } });
    expect(newAccounts.length).toBeGreaterThanOrEqual(1);

    const logs = await prisma.adminActionLog.findMany({ where: { targetType: "household", targetId: householdId, action: "split" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].metadata).toMatchObject({ userId: MEMBER_USER_ID, newHouseholdId: newSplitHouseholdId });
  });
});

describe("POST /api/admin/households/:id/delete", () => {
  it("rejects requests without a valid service token", async () => {
    const { POST } = await import("../app/api/admin/households/[id]/delete/route");
    const res = await POST(new Request(`http://localhost/api/admin/households/${deleteHouseholdId}/delete`, { method: "POST" }), {
      params: { id: deleteHouseholdId }
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown household", async () => {
    const { POST } = await import("../app/api/admin/households/[id]/delete/route");
    const res = await POST(authedRequest("http://localhost/api/admin/households/does-not-exist/delete", { method: "POST" }), {
      params: { id: "does-not-exist" }
    });
    expect(res.status).toBe(404);
  });

  it("soft-deletes the household and cascades deletedAt to every current member", async () => {
    const { POST } = await import("../app/api/admin/households/[id]/delete/route");

    const res = await POST(authedRequest(`http://localhost/api/admin/households/${deleteHouseholdId}/delete`, { method: "POST" }), {
      params: { id: deleteHouseholdId }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.memberCount).toBe(2);

    const household = await prisma.household.findUnique({ where: { id: deleteHouseholdId } });
    expect(household?.deletedAt).not.toBeNull();

    const owner = await prisma.user.findUnique({ where: { id: DELETE_OWNER_USER_ID } });
    const member = await prisma.user.findUnique({ where: { id: DELETE_MEMBER_USER_ID } });
    expect(owner?.deletedAt).not.toBeNull();
    expect(member?.deletedAt).not.toBeNull();

    const logs = await prisma.adminActionLog.findMany({ where: { targetType: "household", targetId: deleteHouseholdId, action: "delete" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].metadata).toMatchObject({ memberIds: expect.arrayContaining([DELETE_OWNER_USER_ID, DELETE_MEMBER_USER_ID]) });
  });

  it("is idempotent — a second call does not error or duplicate the log", async () => {
    const { POST } = await import("../app/api/admin/households/[id]/delete/route");

    const res = await POST(authedRequest(`http://localhost/api/admin/households/${deleteHouseholdId}/delete`, { method: "POST" }), {
      params: { id: deleteHouseholdId }
    });
    expect(res.status).toBe(200);

    const logs = await prisma.adminActionLog.findMany({ where: { targetType: "household", targetId: deleteHouseholdId, action: "delete" } });
    expect(logs).toHaveLength(1);
  });

  it("excludes the deleted household from GET /api/admin/households", async () => {
    const { GET } = await import("../app/api/admin/households/route");
    const res = await GET(authedRequest("http://localhost/api/admin/households"));
    const body: { households: Array<{ id: string }> } = await res.json();
    expect(body.households.find((h) => h.id === deleteHouseholdId)).toBeUndefined();
  });
});
