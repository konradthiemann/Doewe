/**
 * Pure category x month matrix of a year's actual bookings - no Prisma, no I/O.
 *
 * Amounts are integer cents. Expense and savings rows are positive magnitudes
 * (a refund / withdrawal reduces them), income rows are positive as stored.
 * Budgets (per month, `null` = no budget) only apply to expense rows: a month is
 * "over" when the spend is strictly above a positive budget; `overYear` compares
 * the spend of the budgeted months with the sum of their budgets.
 */

export type CategoryYearKind = "income" | "expense" | "savings";

export type CategoryYearCategory = { id: string; name: string; kind: CategoryYearKind };

/** One booking: signed cents as stored, `month` 1-12, `categoryId` null = uncategorized. */
export type CategoryYearTx = { categoryId: string | null; amountCents: number; month: number };

export type CategoryYearRow = {
  id: string;
  name: string;
  kind: CategoryYearKind;
  /** 12 entries (Jan-Dec). */
  monthlyCents: number[];
  totalCents: number;
  /** 12 entries, `null` = no budget in that month; `null` as a whole = no budget at all. */
  budgetMonthlyCents: (number | null)[] | null;
  /** Sum of the budgeted months; `null` without any budget. */
  budgetTotalCents: number | null;
  /** Months (1-12) whose spend is strictly above a positive budget. */
  overMonths: number[];
  overYear: boolean;
};

export type CategoryYearGroup = {
  rows: CategoryYearRow[];
  monthlyTotalsCents: number[];
  totalCents: number;
};

export type CategoryYearMatrix = {
  year: number;
  income: CategoryYearGroup;
  expenses: CategoryYearGroup;
  savings: CategoryYearGroup;
  /** income - expenses - savings, per month and for the year. */
  balanceMonthlyCents: number[];
  balanceTotalCents: number;
};

const MONTHS = 12;
const UNCATEGORIZED_ID = "uncategorized";

const zeros = (): number[] => Array.from({ length: MONTHS }, () => 0);
const sum = (values: ReadonlyArray<number>): number => values.reduce((a, b) => a + b, 0);

type Draft = { id: string; name: string; kind: CategoryYearKind; monthlyCents: number[] };

function toRow(draft: Draft, budget: ReadonlyArray<number | null> | undefined): CategoryYearRow {
  const base = { ...draft, totalCents: sum(draft.monthlyCents) };
  const hasBudget = draft.kind === "expense" && budget !== undefined && budget.some((b) => b !== null);
  if (!hasBudget || !budget) {
    return { ...base, budgetMonthlyCents: null, budgetTotalCents: null, overMonths: [], overYear: false };
  }
  const overMonths: number[] = [];
  let budgetedSpend = 0;
  let positiveBudget = 0;
  budget.forEach((limit, index) => {
    if (limit === null || limit <= 0) return;
    const spent = draft.monthlyCents[index] ?? 0;
    budgetedSpend += spent;
    positiveBudget += limit;
    if (spent > limit) overMonths.push(index + 1);
  });
  return {
    ...base,
    budgetMonthlyCents: [...budget],
    budgetTotalCents: sum(budget.map((b) => b ?? 0)),
    overMonths,
    overYear: budgetedSpend > positiveBudget
  };
}

function toGroup(rows: CategoryYearRow[]): CategoryYearGroup {
  const sorted = [...rows].sort((a, b) => {
    if ((a.id === UNCATEGORIZED_ID) !== (b.id === UNCATEGORIZED_ID)) return a.id === UNCATEGORIZED_ID ? 1 : -1;
    return b.totalCents - a.totalCents || a.name.localeCompare(b.name);
  });
  const monthlyTotalsCents = zeros().map((_, i) => sum(sorted.map((r) => r.monthlyCents[i] ?? 0)));
  return { rows: sorted, monthlyTotalsCents, totalCents: sum(monthlyTotalsCents) };
}

export function buildCategoryYearMatrix(input: {
  year: number;
  categories: ReadonlyArray<CategoryYearCategory>;
  transactions: ReadonlyArray<CategoryYearTx>;
  budgetsByCategory: Readonly<Record<string, ReadonlyArray<number | null>>>;
}): CategoryYearMatrix {
  const { year, categories, transactions, budgetsByCategory } = input;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const drafts = new Map<string, Draft>();

  const draftFor = (id: string, name: string, kind: CategoryYearKind): Draft => {
    const key = `${kind}:${id}`;
    let draft = drafts.get(key);
    if (!draft) {
      draft = { id, name, kind, monthlyCents: zeros() };
      drafts.set(key, draft);
    }
    return draft;
  };

  for (const tx of transactions) {
    if (tx.month < 1 || tx.month > MONTHS || tx.amountCents === 0) continue;
    const category = tx.categoryId ? byId.get(tx.categoryId) : undefined;
    const draft = category
      ? draftFor(category.id, category.name, category.kind)
      : draftFor(UNCATEGORIZED_ID, "", tx.amountCents < 0 ? "expense" : "income");
    const signed = draft.kind === "income" ? tx.amountCents : -tx.amountCents;
    draft.monthlyCents[tx.month - 1] = (draft.monthlyCents[tx.month - 1] ?? 0) + signed;
  }

  // Budget-only categories get a zero row.
  for (const category of categories) {
    if (category.kind === "expense" && budgetsByCategory[category.id]) {
      draftFor(category.id, category.name, category.kind);
    }
  }

  const rows = [...drafts.values()].map((d) => toRow(d, budgetsByCategory[d.id]));
  const income = toGroup(rows.filter((r) => r.kind === "income"));
  const expenses = toGroup(rows.filter((r) => r.kind === "expense"));
  const savings = toGroup(rows.filter((r) => r.kind === "savings"));
  const balanceMonthlyCents = zeros().map(
    (_, i) => income.monthlyTotalsCents[i]! - expenses.monthlyTotalsCents[i]! - savings.monthlyTotalsCents[i]!
  );
  return { year, income, expenses, savings, balanceMonthlyCents, balanceTotalCents: sum(balanceMonthlyCents) };
}
