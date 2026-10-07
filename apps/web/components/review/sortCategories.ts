export type CategorySortKey = "name" | "distribution" | "spent" | "budget" | "status";
export type SortDirection = "asc" | "desc";

/** Direction applied on the first click of a column: A-Z for names, largest first otherwise. */
export const DEFAULT_SORT_DIRECTION: Record<CategorySortKey, SortDirection> = {
  name: "asc",
  distribution: "desc",
  spent: "desc",
  budget: "desc",
  status: "desc"
};

type Sortable = { name: string; spentCents: number; budgetCents: number | null };

/**
 * Returns a sorted copy (stable, input untouched). Categories without a budget
 * always come last for the budget/status keys, regardless of direction.
 */
export function sortCategories<T extends Sortable>(
  categories: readonly T[],
  key: CategorySortKey,
  direction: SortDirection,
  locale = "de"
): T[] {
  const sign = direction === "asc" ? 1 : -1;
  const collator = new Intl.Collator(locale, { sensitivity: "base" });

  const numeric = (c: T): number | null => {
    switch (key) {
      case "budget":
        return c.budgetCents;
      case "status":
        return c.budgetCents === null ? null : c.spentCents - c.budgetCents;
      default:
        return c.spentCents;
    }
  };

  return [...categories].sort((a, b) => {
    if (key === "name") return sign * collator.compare(a.name, b.name);
    const av = numeric(a);
    const bv = numeric(b);
    if (av === null || bv === null) return av === bv ? 0 : av === null ? 1 : -1;
    return sign * (av - bv);
  });
}
