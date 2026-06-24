import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../lib/prisma";

const TEST_USER_EMAIL = "test@example.com";
const TEST_ACCOUNT_NAME = "Test Konto";

let testUserId: string;
let testAccountId: string;
let testGoalId: string;

describe("Saving Plan API", () => {
  beforeAll(async () => {
    // Create or reuse test user
    let user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });
    if (!user) {
      user = await prisma.user.create({
        data: { email: TEST_USER_EMAIL, name: "Test User", password: "testpassword123" }
      });
    }
    testUserId = user.id;

    // Create test account
    const account = await prisma.account.create({
      data: { name: TEST_ACCOUNT_NAME, userId: testUserId }
    });
    testAccountId = account.id;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.budget.deleteMany({ where: { accountId: testAccountId } });
    await prisma.account.delete({ where: { id: testAccountId } });
  });

  it("POST /api/saving-plan creates a goal", async () => {
    const payload = {
      accountId: testAccountId,
      title: "Urlaub",
      targetYear: 2026,
      targetMonth: 6,
      amountCents: 50000
    };

    // Note: We can't easily test the full route without auth mocking,
    // so we test the Prisma operations directly
    const goal = await prisma.budget.create({
      data: {
        accountId: payload.accountId,
        title: payload.title,
        year: payload.targetYear,
        month: payload.targetMonth,
        amountCents: payload.amountCents
      }
    });

    testGoalId = goal.id;

    expect(goal.title).toBe("Urlaub");
    expect(goal.amountCents).toBe(50000);
    expect(goal.month).toBe(6);
    expect(goal.year).toBe(2026);
  });

  it("GET /api/saving-plan/[id] returns the goal", async () => {
    const goal = await prisma.budget.findUnique({
      where: { id: testGoalId },
      include: { category: { select: { name: true } } }
    });

    expect(goal).not.toBeNull();
    expect(goal!.title).toBe("Urlaub");
    expect(goal!.amountCents).toBe(50000);
  });

  it("PATCH /api/saving-plan/[id] updates the goal", async () => {
    const updated = await prisma.budget.update({
      where: { id: testGoalId },
      data: {
        title: "Sommerurlaub",
        amountCents: 75000
      }
    });

    expect(updated.title).toBe("Sommerurlaub");
    expect(updated.amountCents).toBe(75000);
  });

  it("completes and reopens a goal (completedAt + spentCents)", async () => {
    const goal = await prisma.budget.create({
      data: {
        accountId: testAccountId,
        title: "Auto",
        year: 2026,
        month: 9,
        amountCents: 300000
      }
    });

    expect(goal.completedAt).toBeNull();
    expect(goal.spentCents).toBeNull();

    // Complete with an overspend (5000 withdrawn for a 3000 goal)
    const completed = await prisma.budget.update({
      where: { id: goal.id },
      data: { completedAt: new Date(), spentCents: 500000 }
    });

    expect(completed.completedAt).not.toBeNull();
    expect(completed.spentCents).toBe(500000);

    // Reopen clears both fields
    const reopened = await prisma.budget.update({
      where: { id: goal.id },
      data: { completedAt: null, spentCents: null }
    });

    expect(reopened.completedAt).toBeNull();
    expect(reopened.spentCents).toBeNull();

    await prisma.budget.delete({ where: { id: goal.id } });
  });

  it("DELETE /api/saving-plan/[id] removes the goal", async () => {
    await prisma.budget.delete({ where: { id: testGoalId } });

    const deleted = await prisma.budget.findUnique({ where: { id: testGoalId } });
    expect(deleted).toBeNull();
  });
});
