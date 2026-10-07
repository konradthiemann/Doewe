export interface CategoryBarInput {
  spentCents: number;
  /** null = no budget set for this category (share mode). */
  budgetCents: number | null;
  totalOutcomeCents: number;
}

export interface CategoryBar {
  mode: "share" | "budget";
  /** Bar fill, clamped to 0..1. */
  fillRatio: number;
  /** Rounded percent; uncapped in budget mode (130 % when over). */
  percent: number;
  over: boolean;
  overByCents: number;
  remainingCents: number;
}

/**
 * Decides how a category bar is drawn: without budget it shows the share of
 * total outcome, with budget the budget utilisation (a zero budget counts as
 * fully used as soon as anything is spent).
 */
export function computeCategoryBar({ spentCents, budgetCents, totalOutcomeCents }: CategoryBarInput): CategoryBar {
  if (budgetCents === null) {
    const ratio = totalOutcomeCents > 0 ? spentCents / totalOutcomeCents : 0;
    return {
      mode: "share",
      fillRatio: clamp01(ratio),
      percent: Math.round(ratio * 100),
      over: false,
      overByCents: 0,
      remainingCents: 0
    };
  }
  if (budgetCents === 0) {
    const spent = spentCents > 0;
    return {
      mode: "budget",
      fillRatio: spent ? 1 : 0,
      percent: spent ? 100 : 0,
      over: spent,
      overByCents: spent ? spentCents : 0,
      remainingCents: 0
    };
  }
  const ratio = spentCents / budgetCents;
  return {
    mode: "budget",
    fillRatio: clamp01(ratio),
    percent: Math.round(ratio * 100),
    over: spentCents > budgetCents,
    overByCents: Math.max(0, spentCents - budgetCents),
    remainingCents: Math.max(0, budgetCents - spentCents)
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
