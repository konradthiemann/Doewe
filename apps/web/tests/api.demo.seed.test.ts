import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The public demo account has to work whenever someone presses "Demo
// ausprobieren". If it was suspended or soft-deleted (for example through the
// admin API), signing in still succeeds but every request is rejected — the
// seed endpoint therefore revives the account.

let prisma: import("@prisma/client").PrismaClient;

async function seed() {
  const { POST } = await import("../app/api/demo/seed/route");
  const res = await POST();
  expect(res.status).toBe(200);
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  await seed();
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/demo/seed", () => {
  it("revives a suspended and soft-deleted demo account", async () => {
    const { DEMO_ACCOUNT_ID, DEMO_EMAIL } = await import("../lib/demoConstants");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } });
    const membership = await prisma.householdMember.findUniqueOrThrow({ where: { userId: user.id } });
    const gone = new Date("2026-11-01T10:00:00.000Z");
    await prisma.user.update({ where: { id: user.id }, data: { suspendedAt: gone, deletedAt: gone } });
    await prisma.household.update({ where: { id: membership.householdId }, data: { deletedAt: gone } });
    await prisma.account.update({ where: { id: DEMO_ACCOUNT_ID }, data: { deletedAt: gone } });

    await seed();

    const revived = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect([revived.suspendedAt, revived.deletedAt]).toEqual([null, null]);
    const household = await prisma.household.findUniqueOrThrow({ where: { id: membership.householdId } });
    expect(household.deletedAt).toBeNull();
    const account = await prisma.account.findUniqueOrThrow({ where: { id: DEMO_ACCOUNT_ID } });
    expect(account.deletedAt).toBeNull();
  }, 120_000);
});
