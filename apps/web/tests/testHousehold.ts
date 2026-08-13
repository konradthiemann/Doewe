import type { PrismaClient } from "@prisma/client";

/**
 * Test-Fixture (Teil D): stellt für einen Test-User einen Haushalt + eine
 * OWNER-Mitgliedschaft sicher, damit `getSessionUser()` (das die Mitgliedschaft
 * pro Request auflöst) den User nicht als 401 behandelt. Gibt die householdId
 * zurück, die Accounts/Kategorien scopen.
 */
export async function ensureTestHousehold(
  prisma: PrismaClient,
  userId: string,
  name = "Test Household"
): Promise<string> {
  const householdId = `hh_${userId}`;
  await prisma.household.upsert({
    where: { id: householdId },
    update: {},
    create: { id: householdId, name }
  });
  await prisma.householdMember.upsert({
    where: { userId },
    update: { householdId, role: "OWNER" },
    create: { userId, householdId, role: "OWNER" }
  });
  return householdId;
}

/** Räumt Haushalt + Mitgliedschaft eines Test-Users wieder ab. */
export async function cleanupTestHousehold(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.householdMember.deleteMany({ where: { userId } });
  await prisma.household.deleteMany({ where: { id: `hh_${userId}` } });
}
