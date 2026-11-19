/**
 * Effective category budgets of one month (integer cents, keyed by categoryId).
 *
 * Plans (CategoryBudgetPlan) take precedence; a legacy per-month Budget row of
 * the same month/year is only a fallback for categories without a plan. Legacy
 * rows are read for all accounts of the household (like the spend they are
 * compared with); if several accounts hold a row for the same category and
 * month, the household's budget is their sum.
 * YEARLY plans are distributed by the smoothed availability of the year
 * (income spread evenly, recurring expenses/savings per month), which is only loaded when a YEARLY
 * plan exists. Plans of soft-deleted categories are ignored.
 *
 * Completed months are frozen. Plans have no history and a YEARLY share follows
 * the standing orders of its year, so a month that is over would otherwise show
 * a different budget whenever a plan or a standing order is edited. For a month
 * before the current Europe/Berlin month the loaders return its
 * `BudgetMonthSnapshot`; a missing one is computed as described above, stored
 * and returned — also when it is empty ("no budgets" is a frozen state too).
 * Reading the current month makes sure the previous month has its snapshot, so a
 * month freezes as soon as it is over and anyone opens the app. The current and
 * future months are computed on every read. A snapshot holds only categories
 * that had a budget; a category deleted since is left out when it is read.
 *
 * `loadEffectiveCategoryBudgetsForYear` is the same resolution for all 12 months of a
 * year (index 0 = January, `null` = no budget in that month): a MONTHLY plan gives 12 equal
 * values, a YEARLY plan its distribution; a legacy Budget row only fills the months it exists
 * for, and only for categories without a plan. Saving goals (categoryId null) are ignored.
 * Months before the current month come from their snapshots (missing ones are created), so
 * the 12 values of a YEARLY plan need not add up to the yearly amount once it was edited.
 *
 * `freezePastMonths` freezes every past month of a household that has no snapshot yet, from
 * the month of its earliest booking on. The routes that change what budgets are computed from
 * (budget plans, per-month budgets, standing orders, merging a category) call it before they
 * write, so months from before snapshots existed — or the month that just ended, when nobody
 * opened the app since — keep the budgets they had. `mergeFrozenBudgets` carries a merged
 * category's frozen budgets over to the category that takes its bookings.
 */
import {
  BUDGET_PERIODS,
  planMonthlyCents,
  resolveEffectiveBudgets,
  shiftMonth,
  smoothedAvailablePerMonth,
  zonedMonth,
  type BudgetPeriod,
  type MonthRef
} from "@doewe/shared";

import { prisma } from "./prisma";
import { loadRecurringYearMatrix } from "./recurringYear";

import type { Prisma } from "@prisma/client";

type MonthBudgets = Record<string, number>;
type YearBudgets = Record<string, (number | null)[]>;

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

function toBudgetPeriod(value: string): BudgetPeriod {
  const match = BUDGET_PERIODS.find((p) => p === value);
  if (!match) throw new Error(`Unknown budget period: ${value}`);
  return match;
}

type CategoryPlan = { categoryId: string; period: BudgetPeriod; amountCents: number };

// Soft-deleted plans are hidden by the extension; the relation filter hides plans of deleted categories.
async function loadCategoryPlans(householdId: string): Promise<CategoryPlan[]> {
  const planRows = await prisma.categoryBudgetPlan.findMany({
    where: { householdId, category: { deletedAt: null } },
    select: { categoryId: true, period: true, amountCents: true }
  });
  return planRows.map((p) => ({
    categoryId: p.categoryId,
    period: toBudgetPeriod(p.period),
    amountCents: p.amountCents
  }));
}

/** Smoothed monthly availability of the year; only loaded when a YEARLY plan needs it. */
async function loadAvailablePerMonth(householdId: string, year: number, plans: CategoryPlan[]): Promise<number[]> {
  if (!plans.some((p) => p.period === "YEARLY")) return Array.from({ length: 12 }, () => 0);
  return smoothedAvailablePerMonth(await loadRecurringYearMatrix(householdId, year));
}

function isBefore(a: MonthRef, b: MonthRef): boolean {
  return a.year < b.year || (a.year === b.year && a.month < b.month);
}

/** The budgets of one month from today's plans, per-month rows and standing orders. */
async function computeMonthBudgets(householdId: string, year: number, month: number): Promise<MonthBudgets> {
  const [plans, budgetRows] = await Promise.all([
    loadCategoryPlans(householdId),
    prisma.budget.findMany({
      where: { account: { householdId }, categoryId: { not: null }, month, year },
      select: { categoryId: true, amountCents: true }
    })
  ]);

  const overrides: Record<string, number> = {};
  for (const b of budgetRows) {
    if (b.categoryId) overrides[b.categoryId] = (overrides[b.categoryId] ?? 0) + (b.amountCents ?? 0);
  }

  const availablePerMonth = await loadAvailablePerMonth(householdId, year, plans);
  return resolveEffectiveBudgets({ plans, overrides, month, availablePerMonth });
}

/** The budgets of all 12 months of a year from today's plans, per-month rows and standing orders. */
async function computeYearBudgets(householdId: string, year: number): Promise<YearBudgets> {
  const [plans, budgetRows] = await Promise.all([
    loadCategoryPlans(householdId),
    prisma.budget.findMany({
      // Explicit deletedAt filters (like the plan loader) keep tombstoned rows and categories out.
      where: {
        account: { householdId },
        categoryId: { not: null },
        year,
        deletedAt: null,
        category: { deletedAt: null }
      },
      select: { categoryId: true, month: true, amountCents: true }
    })
  ]);

  const availablePerMonth = await loadAvailablePerMonth(householdId, year, plans);

  const result: YearBudgets = {};
  for (const plan of plans) result[plan.categoryId] = planMonthlyCents(plan, availablePerMonth);

  const planned = new Set(plans.map((p) => p.categoryId));
  for (const b of budgetRows) {
    if (!b.categoryId || !b.month || planned.has(b.categoryId)) continue;
    const months = (result[b.categoryId] ??= Array.from({ length: 12 }, () => null));
    months[b.month - 1] = (months[b.month - 1] ?? 0) + (b.amountCents ?? 0);
  }
  return result;
}

/** Reads the `budgets` JSON of a snapshot; anything that is not "categoryId: whole cents" is dropped. */
function parseSnapshotBudgets(value: unknown): MonthBudgets {
  const result: MonthBudgets = {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [categoryId, cents] of Object.entries(value)) {
    if (typeof cents === "number" && Number.isInteger(cents)) result[categoryId] = cents;
  }
  return result;
}

/** Those of `categoryIds` that still exist in the household (soft-deleted ones are hidden by the extension). */
async function existingCategoryIds(householdId: string, categoryIds: string[]): Promise<Set<string>> {
  if (categoryIds.length === 0) return new Set();
  const rows = await prisma.category.findMany({
    where: { householdId, id: { in: categoryIds } },
    select: { id: true }
  });
  return new Set(rows.map((row) => row.id));
}

/**
 * The stored budgets of a completed month; the snapshot is created on first
 * use. `skipDuplicates` (ON CONFLICT DO NOTHING) makes two readers that freeze
 * the same month at the same moment safe: the loser inserts nothing and reads
 * the winner's row.
 */
async function freezeMonth(householdId: string, ref: MonthRef): Promise<MonthBudgets> {
  const where = { householdId_year_month: { householdId, year: ref.year, month: ref.month } };
  const existing = await prisma.budgetMonthSnapshot.findUnique({ where, select: { budgets: true } });
  if (existing) return parseSnapshotBudgets(existing.budgets);

  const budgets = await computeMonthBudgets(householdId, ref.year, ref.month);
  const created = await prisma.budgetMonthSnapshot.createMany({
    data: [{ householdId, year: ref.year, month: ref.month, budgets }],
    skipDuplicates: true
  });
  if (created.count > 0) return budgets;

  const winner = await prisma.budgetMonthSnapshot.findUnique({ where, select: { budgets: true } });
  return parseSnapshotBudgets(winner?.budgets);
}

export async function loadEffectiveCategoryBudgets(input: {
  householdId: string;
  year: number;
  month: number;
}): Promise<Record<string, number>> {
  const { householdId, year, month } = input;
  const current = zonedMonth(new Date());

  if (isBefore({ year, month }, current)) {
    const frozen = await freezeMonth(householdId, { year, month });
    const existing = await existingCategoryIds(householdId, Object.keys(frozen));
    return Object.fromEntries(Object.entries(frozen).filter(([categoryId]) => existing.has(categoryId)));
  }

  // The month that just ended freezes with the first read of the current one.
  if (year === current.year && month === current.month) {
    await freezeMonth(householdId, shiftMonth(current, -1));
  }
  return computeMonthBudgets(householdId, year, month);
}

async function loadYearSnapshots(householdId: string, year: number): Promise<Map<number, MonthBudgets>> {
  const rows = await prisma.budgetMonthSnapshot.findMany({
    where: { householdId, year },
    select: { month: true, budgets: true }
  });
  return new Map(rows.map((row) => [row.month, parseSnapshotBudgets(row.budgets)]));
}

export async function loadEffectiveCategoryBudgetsForYear(input: {
  householdId: string;
  year: number;
}): Promise<Record<string, (number | null)[]>> {
  const { householdId, year } = input;
  const current = zonedMonth(new Date());

  const frozenMonths = MONTHS.filter((month) => isBefore({ year, month }, current));
  if (frozenMonths.length === 0) return computeYearBudgets(householdId, year);

  let snapshots = await loadYearSnapshots(householdId, year);
  const missing = frozenMonths.filter((month) => !snapshots.has(month));

  // Today's figures are needed for the months that are not frozen and to
  // freeze the months that have no snapshot yet.
  const live: YearBudgets =
    missing.length > 0 || frozenMonths.length < MONTHS.length ? await computeYearBudgets(householdId, year) : {};

  if (missing.length > 0) {
    await prisma.budgetMonthSnapshot.createMany({
      data: missing.map((month) => {
        const budgets: MonthBudgets = {};
        for (const [categoryId, months] of Object.entries(live)) {
          const cents = months[month - 1];
          if (cents != null) budgets[categoryId] = cents;
        }
        return { householdId, year, month, budgets };
      }),
      // A month another reader froze in the meantime keeps that reader's row.
      skipDuplicates: true
    });
    snapshots = await loadYearSnapshots(householdId, year);
  }

  const frozen = new Set(frozenMonths);
  const result: YearBudgets = {};
  for (const [categoryId, months] of Object.entries(live)) {
    const open = months.map((cents, index) => (frozen.has(index + 1) ? null : cents));
    if (open.some((cents) => cents !== null)) result[categoryId] = open;
  }

  const frozenCategoryIds = new Set<string>();
  for (const month of frozenMonths) {
    for (const categoryId of Object.keys(snapshots.get(month) ?? {})) frozenCategoryIds.add(categoryId);
  }
  const existing = await existingCategoryIds(householdId, [...frozenCategoryIds]);

  for (const month of frozenMonths) {
    for (const [categoryId, cents] of Object.entries(snapshots.get(month) ?? {})) {
      if (!existing.has(categoryId)) continue;
      const months = (result[categoryId] ??= Array.from({ length: 12 }, () => null));
      months[month - 1] = cents;
    }
  }
  return result;
}

/** Month as one integer (year * 12 + month - 1), so ranges of months are plain integer ranges. */
function monthIndex(ref: MonthRef): number {
  return ref.year * 12 + (ref.month - 1);
}

/** The snapshot of the `budgets` a year's live figures give for one month. */
function monthOfYear(live: YearBudgets, month: number): MonthBudgets {
  const budgets: MonthBudgets = {};
  for (const [categoryId, months] of Object.entries(live)) {
    const cents = months[month - 1];
    if (cents != null) budgets[categoryId] = cents;
  }
  return budgets;
}

/**
 * Freezes every completed month of the household that has no snapshot yet:
 * from the Europe/Berlin month of its earliest (not deleted) booking through
 * the month before the current one, computed from the plans, per-month budgets
 * and standing orders as they are now. Months that already have a snapshot
 * keep it.
 *
 * Called before a write that changes what budgets are computed from, so the
 * months that are over keep the budgets they had before the write.
 *
 * - Cheap when there is nothing to do: one query returns the earliest booking
 *   and the frozen months.
 * - Bounded: the missing months are computed one year at a time (one plan and
 *   standing-order load per year), not one month at a time.
 * - Safe under concurrent calls: the snapshots are inserted with
 *   `skipDuplicates` (ON CONFLICT DO NOTHING), so a month frozen by someone
 *   else in the meantime keeps that row and nothing fails.
 */
export async function freezePastMonths(householdId: string): Promise<void> {
  const last = monthIndex(shiftMonth(zonedMonth(new Date()), -1));

  // Explicit deletedAt: the soft-delete extension does not reach raw queries.
  const [row] = await prisma.$queryRaw<{ first: Date | null; frozen: number[] }[]>`
    SELECT
      (SELECT MIN(t."occurredAt")
         FROM "Transaction" t
         JOIN "Account" a ON a."id" = t."accountId"
        WHERE a."householdId" = ${householdId} AND t."deletedAt" IS NULL) AS "first",
      ARRAY(SELECT s."year" * 12 + (s."month" - 1)
              FROM "BudgetMonthSnapshot" s
             WHERE s."householdId" = ${householdId}) AS "frozen"`;
  if (!row?.first) return;

  const first = monthIndex(zonedMonth(row.first));
  if (first > last) return;

  const frozen = new Set(row.frozen.map(Number));
  const missingByYear = new Map<number, number[]>();
  for (let index = first; index <= last; index += 1) {
    if (frozen.has(index)) continue;
    const year = Math.floor(index / 12);
    const months = missingByYear.get(year) ?? [];
    months.push((index % 12) + 1);
    missingByYear.set(year, months);
  }

  for (const [year, months] of missingByYear) {
    const live = await computeYearBudgets(householdId, year);
    await prisma.budgetMonthSnapshot.createMany({
      data: months.map((month) => ({ householdId, year, month, budgets: monthOfYear(live, month) })),
      skipDuplicates: true
    });
  }
}

/**
 * Carries the frozen budgets of a category that is merged into (or replaced
 * by) another one over to that category: in every snapshot of the household,
 * the source's amount is added to the target's (or becomes the target's if it
 * had none) and the source key is removed. The merge moves the source's
 * bookings of those months to the target, so the target's frozen budget must
 * cover them. Runs inside the merge transaction, before the source is deleted.
 */
export async function mergeFrozenBudgets(
  tx: Prisma.TransactionClient,
  householdId: string,
  sourceCategoryId: string,
  targetCategoryId: string
): Promise<void> {
  const snapshots = await tx.budgetMonthSnapshot.findMany({
    where: { householdId },
    select: { id: true, budgets: true }
  });
  for (const snapshot of snapshots) {
    const budgets = parseSnapshotBudgets(snapshot.budgets);
    const sourceCents = budgets[sourceCategoryId] as number | undefined;
    if (sourceCents === undefined) continue;
    budgets[targetCategoryId] = ((budgets[targetCategoryId] as number | undefined) ?? 0) + sourceCents;
    delete budgets[sourceCategoryId];
    await tx.budgetMonthSnapshot.update({ where: { id: snapshot.id }, data: { budgets } });
  }
}
