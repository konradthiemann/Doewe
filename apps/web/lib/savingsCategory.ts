import { savingsCategoryIds } from "@doewe/shared";

import { prisma } from "./prisma";

import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Ids of every savings category of the household (see
 * docs/calculations/00-grundregeln.md §2). All routes that classify
 * transactions resolve the savings categories through this one function, so
 * they cannot disagree about which rows are savings.
 */
export async function loadSavingsCategoryIds(
  householdId: string,
  // Pass the transaction client when calling inside a transaction: a query on
  // the global client there needs a second pooled connection, which can
  // deadlock when every connection is held by a request waiting on a lock.
  db: PrismaClient | Prisma.TransactionClient = prisma
): Promise<Set<string>> {
  const categories = await db.category.findMany({
    // Explicit, so the result does not depend on which client runs the query.
    where: { householdId, deletedAt: null },
    select: { id: true, name: true }
  });
  return savingsCategoryIds(categories);
}
