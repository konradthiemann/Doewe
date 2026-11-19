import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { checkBudgetAlerts } from "../lib/budgetAlerts";
import { sendPushToUser } from "../lib/push";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Who hears about a budget threshold: every member of the household who has
// budget alerts switched on, each in their own language — not only the person
// who booked. The push transport is replaced by a recorder.
vi.mock("../lib/push", () => ({ sendPushToUser: vi.fn() }));

const OWNER_ID = "test-user-budget-alerts-hh-owner";
const PARTNER_ID = "test-user-budget-alerts-hh-partner";
const MUTED_ID = "test-user-budget-alerts-hh-muted";
const SUSPENDED_ID = "test-user-budget-alerts-hh-suspended";
const DELETED_ID = "test-user-budget-alerts-hh-deleted";
const OUTSIDER_ID = "test-user-budget-alerts-hh-outsider";
const MEMBER_IDS = [OWNER_ID, PARTNER_ID, MUTED_ID, SUSPENDED_ID, DELETED_ID];
const ACCOUNT_ID = "acc_budget_alerts_hh";

/** 19 Nov 2032, 11:00 in Berlin. */
const NOW = new Date("2032-11-19T10:00:00.000Z");
const nov = (day: number) => new Date(Date.UTC(2032, 10, day, 11));

const push = vi.mocked(sendPushToUser);

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let foodId: string;

async function spend(amountCents: number): Promise<void> {
  await prisma.transaction.create({
    data: { accountId: ACCOUNT_ID, categoryId: foodId, amountCents, description: "BAH booking", occurredAt: nov(10) }
  });
}

const check = () => checkBudgetAlerts({ householdId, categoryId: foodId, occurredAt: nov(10) });

/** userId → body of each push sent, in call order. */
const sent = () => push.mock.calls.map(([userId, payload]) => [userId, payload.title, payload.body]);

async function clean() {
  await prisma.budgetAlertLog.deleteMany({ where: { householdId } });
  await prisma.budgetMonthSnapshot.deleteMany({ where: { householdId } });
  await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.user.updateMany({ where: { id: { in: [OWNER_ID, PARTNER_ID] } }, data: { notifyBudgetAlerts: true } });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const mkUser = (
    id: string,
    data: { locale?: string; notifyBudgetAlerts?: boolean; suspendedAt?: Date; deletedAt?: Date } = {}
  ) =>
    prisma.user.upsert({
      where: { email: `${id}@example.com` },
      update: { locale: "de", notifyBudgetAlerts: true, suspendedAt: null, deletedAt: null, ...data },
      create: { id, email: `${id}@example.com`, password: "hashed", ...data }
    });
  await mkUser(OWNER_ID, { locale: "de" });
  await mkUser(PARTNER_ID, { locale: "en" });
  await mkUser(MUTED_ID, { notifyBudgetAlerts: false });
  // Both keep budget alerts switched on: only the suspension or the deletion
  // keeps them from being notified.
  await mkUser(SUSPENDED_ID, { suspendedAt: new Date("2032-01-01T00:00:00.000Z") });
  await mkUser(DELETED_ID, { deletedAt: new Date("2032-02-01T00:00:00.000Z") });
  await mkUser(OUTSIDER_ID);

  householdId = await ensureTestHousehold(prisma, OWNER_ID);
  for (const userId of [PARTNER_ID, MUTED_ID, SUSPENDED_ID, DELETED_ID]) {
    await prisma.householdMember.upsert({
      where: { userId },
      update: { householdId, role: "MEMBER" },
      create: { userId, householdId, role: "MEMBER" }
    });
  }
  // Someone in another household must never hear about this one.
  await ensureTestHousehold(prisma, OUTSIDER_ID);

  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: OWNER_ID, householdId, deletedAt: null },
    create: { id: ACCOUNT_ID, name: ACCOUNT_ID, userId: OWNER_ID, householdId }
  });
  foodId = (
    await prisma.category.upsert({
      where: { householdId_name: { householdId, name: "BAH Food" } },
      update: { deletedAt: null },
      create: { name: "BAH Food", userId: OWNER_ID, householdId }
    })
  ).id;
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
  // A plan only — no per-month Budget row anywhere.
  await prisma.categoryBudgetPlan.create({ data: { householdId, categoryId: foodId, period: "MONTHLY", amountCents: 10_000 } });

  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

beforeEach(async () => {
  await clean();
  push.mockReset();
  push.mockResolvedValue(1);
});

afterAll(async () => {
  vi.useRealTimers();
  await clean();
  await prisma.categoryBudgetPlan.deleteMany({ where: { householdId } });
  await prisma.category.deleteMany({ where: { householdId } });
  await prisma.account.deleteMany({ where: { id: ACCOUNT_ID } });
  await prisma.householdMember.deleteMany({ where: { userId: { in: MEMBER_IDS } } });
  await cleanupTestHousehold(prisma, OWNER_ID);
  await cleanupTestHousehold(prisma, OUTSIDER_ID);
  await prisma.user.deleteMany({ where: { id: { in: [...MEMBER_IDS, OUTSIDER_ID] } } });
  await prisma.$disconnect();
});

describe("checkBudgetAlerts — recipients", () => {
  it("notifies every member with alerts switched on, each in their own language", async () => {
    await spend(-8_500);
    await check();

    expect(sent().sort()).toEqual([
      [OWNER_ID, "Budget-Warnung", "BAH Food: Budget zu 80 % ausgeschöpft."],
      [PARTNER_ID, "Budget alert", "BAH Food: budget 80% used."]
    ]);
    // Same notification tag and target for both.
    const payloads = push.mock.calls.map(([, payload]) => payload);
    expect(new Set(payloads.map((p) => p.tag)).size).toBe(1);
    expect(payloads.every((p) => p.url === "/dashboard")).toBe(true);
  });

  it("announces a threshold once for the household, then only the next one", async () => {
    await spend(-8_500);
    await check();
    await check();
    expect(push).toHaveBeenCalledTimes(2);

    await spend(-2_000);
    await check();
    expect(sent().slice(2).sort()).toEqual([
      [OWNER_ID, "Budget-Warnung", "BAH Food: Budget zu 100 % ausgeschöpft."],
      [PARTNER_ID, "Budget alert", "BAH Food: budget 100% used."]
    ]);
  });

  it("announces only the highest threshold when 80 and 100 are reached at once", async () => {
    await spend(-12_000);
    await check();
    expect(sent().map(([, , body]) => body).sort()).toEqual([
      "BAH Food: Budget zu 100 % ausgeschöpft.",
      "BAH Food: budget 100% used."
    ]);
    // 80 is marked as sent and never follows later.
    await check();
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("notifies neither a suspended nor a deleted member, although both have alerts switched on", async () => {
    const muted = await prisma.user.findMany({
      where: { id: { in: [SUSPENDED_ID, DELETED_ID] } },
      select: { notifyBudgetAlerts: true }
    });
    expect(muted.map((u) => u.notifyBudgetAlerts)).toEqual([true, true]);

    await spend(-12_000);
    await check();
    const notified = sent().map(([userId]) => userId);
    expect(notified).not.toContain(SUSPENDED_ID);
    expect(notified).not.toContain(DELETED_ID);
    expect(notified.sort()).toEqual([OWNER_ID, PARTNER_ID]);
  });

  it("still notifies the partner when the other one switched alerts off", async () => {
    await prisma.user.update({ where: { id: OWNER_ID }, data: { notifyBudgetAlerts: false } });
    await spend(-8_500);
    await check();
    expect(sent()).toEqual([[PARTNER_ID, "Budget alert", "BAH Food: budget 80% used."]]);
  });

  it("does not use up the threshold when nobody wants alerts", async () => {
    await prisma.user.updateMany({ where: { id: { in: [OWNER_ID, PARTNER_ID] } }, data: { notifyBudgetAlerts: false } });
    await spend(-8_500);
    await check();
    expect(push).not.toHaveBeenCalled();
    expect(await prisma.budgetAlertLog.count({ where: { householdId } })).toBe(0);

    // Switched on later, the threshold is still announced.
    await prisma.user.update({ where: { id: PARTNER_ID }, data: { notifyBudgetAlerts: true } });
    await check();
    expect(sent()).toEqual([[PARTNER_ID, "Budget alert", "BAH Food: budget 80% used."]]);
  });

  it("swallows a push error and still reaches the other member", async () => {
    push.mockImplementation(async (userId) => {
      if (userId === OWNER_ID) throw new Error("push service down");
      return 1;
    });
    await spend(-8_500);
    await expect(check()).resolves.toBeUndefined();
    expect(sent().map(([userId]) => userId).sort()).toEqual([OWNER_ID, PARTNER_ID]);
    // The threshold counts as announced.
    expect(await prisma.budgetAlertLog.count({ where: { householdId, threshold: 80 } })).toBe(1);
  });

  it("announces a threshold once when both partners book at the same moment", async () => {
    await spend(-8_500);
    await Promise.all([check(), check(), check()]);
    expect(push).toHaveBeenCalledTimes(2);
    expect(await prisma.budgetAlertLog.count({ where: { householdId } })).toBe(1);
  });
});
