import type { ReviewCategory } from "../components/review/CategoryBreakdown";

/** Category budget as delivered by the dashboard summary (amounts in euros). */
export type DashboardCategoryBudget = {
  categoryId: string;
  name: string;
  budget: number;
  spent: number;
  diff: number;
};

const toCents = (euros: number): number => Math.round(euros * 100);

/**
 * Maps dashboard category budgets to static (non-expandable) breakdown rows.
 * Keeps the input order; deliberately omits `transactions`.
 */
export function toBreakdownRows(budgets: DashboardCategoryBudget[]): ReviewCategory[] {
  return budgets.map((b) => ({
    id: b.categoryId,
    name: b.name,
    spentCents: toCents(b.spent),
    budgetCents: toCents(b.budget),
    transactionCount: 0
  }));
}
