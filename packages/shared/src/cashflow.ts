/**
 * The one definition of income, outcome and savings — no Prisma, no I/O.
 *
 * Every screen that totals transactions (dashboard, review, quarterly, yearly,
 * budgets, the filtered totals of the transaction list) must classify with
 * these helpers, otherwise the same month shows different amounts depending on
 * where the user looks.
 *
 * Rule, in this order:
 *   1. A row in a savings category is a transfer to or from the savings pool,
 *      whatever its sign: a deposit is stored negative (money leaves the
 *      account), a withdrawal positive. It is neither income nor outcome.
 *   2. Otherwise `amountCents >= 0` is income and `amountCents < 0` is outcome.
 *      The category's `isIncome` flag plays no part: a refund booked into an
 *      expense category is income, it does not reduce that category's spend.
 */

/** Category names (lower-cased, trimmed) that mark the savings pool. */
export const SAVINGS_CATEGORY_NAMES: readonly string[] = ["savings", "sparen"];

export function isSavingsCategoryName(name: string): boolean {
  return SAVINGS_CATEGORY_NAMES.includes(name.trim().toLowerCase());
}

/** Ids of all savings categories among `categories`. */
export function savingsCategoryIds(categories: Iterable<{ id: string; name: string }>): Set<string> {
  const ids = new Set<string>();
  for (const category of categories) {
    if (isSavingsCategoryName(category.name)) ids.add(category.id);
  }
  return ids;
}

export type FlowKind = "income" | "outcome" | "savings";

export type FlowRow = { amountCents: number; categoryId: string | null };

export function classifyFlow(row: FlowRow, savingsIds: ReadonlySet<string>): FlowKind {
  if (row.categoryId !== null && savingsIds.has(row.categoryId)) return "savings";
  return row.amountCents >= 0 ? "income" : "outcome";
}

export type FlowTotals = {
  /** Sum of income rows, >= 0. */
  incomeCents: number;
  /** Sum of outcome rows as a positive amount, >= 0. */
  outcomeCents: number;
  /** Net amount moved into savings: deposits minus withdrawals, may be negative. */
  savingsCents: number;
  /** income − outcome − savings; always equals the plain sum of `amountCents`. */
  netCents: number;
};

export function emptyFlowTotals(): FlowTotals {
  return { incomeCents: 0, outcomeCents: 0, savingsCents: 0, netCents: 0 };
}

/** Adds one row to `totals` in place and returns how it was classified. */
export function addFlow(totals: FlowTotals, row: FlowRow, savingsIds: ReadonlySet<string>): FlowKind {
  const kind = classifyFlow(row, savingsIds);
  if (kind === "savings") totals.savingsCents -= row.amountCents;
  else if (kind === "income") totals.incomeCents += row.amountCents;
  else totals.outcomeCents -= row.amountCents;
  totals.netCents += row.amountCents;
  return kind;
}

export function sumFlows(rows: Iterable<FlowRow>, savingsIds: ReadonlySet<string>): FlowTotals {
  const totals = emptyFlowTotals();
  for (const row of rows) addFlow(totals, row, savingsIds);
  return totals;
}
