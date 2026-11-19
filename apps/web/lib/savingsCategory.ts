import { savingsCategoryIds } from "@doewe/shared";

import { prisma } from "./prisma";

/**
 * Ids of every savings category of the household (see
 * docs/calculations/00-grundregeln.md §2). All routes that classify
 * transactions resolve the savings categories through this one function, so
 * they cannot disagree about which rows are savings.
 */
export async function loadSavingsCategoryIds(householdId: string): Promise<Set<string>> {
  const categories = await prisma.category.findMany({
    where: { householdId },
    select: { id: true, name: true }
  });
  return savingsCategoryIds(categories);
}
