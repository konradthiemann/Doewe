/**
 * Budget plan handling when a category is merged into / replaced by another one.
 * Runs inside the caller's transaction, BEFORE the source category is deleted
 * (the plan row would otherwise be cascade-deleted with it).
 */
import type { Prisma } from "@prisma/client";

export async function moveBudgetPlanToCategory(
  tx: Prisma.TransactionClient,
  sourceCategoryId: string,
  targetCategoryId: string
): Promise<void> {
  // findUnique is not filtered by the soft-delete extension: tombstones are visible here.
  const sourcePlan = await tx.categoryBudgetPlan.findUnique({ where: { categoryId: sourceCategoryId } });
  if (!sourcePlan) return;

  const targetPlan = await tx.categoryBudgetPlan.findUnique({ where: { categoryId: targetCategoryId } });
  if (targetPlan && targetPlan.deletedAt === null) {
    // Target keeps its own plan; the source plan is dropped for good.
    await tx.categoryBudgetPlan.delete({ where: { id: sourcePlan.id } });
    return;
  }
  // A tombstone of the target would occupy the unique categoryId column.
  if (targetPlan) await tx.categoryBudgetPlan.delete({ where: { id: targetPlan.id } });
  // An already soft-deleted source plan stays a tombstone (it simply follows the category).
  await tx.categoryBudgetPlan.update({ where: { id: sourcePlan.id }, data: { categoryId: targetCategoryId } });
}
