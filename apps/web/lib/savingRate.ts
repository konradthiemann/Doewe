/**
 * The monthly rate of the saving plan per month (docs/calculations/07-sparziele.md).
 *
 * The rate of the running Europe/Berlin month is computed from the goals as
 * they are (computeSavingPlanTotals). For the review of a month that is over,
 * goals and rates may have changed since, so each household's rate is written
 * down for the running month — whenever the plan is read, after every change
 * to a goal, and daily by the cron. A month that is over is never written
 * again: it keeps the rate of the last time it was recorded.
 */
import { zonedMonth, type MonthRef } from "@doewe/shared";

import { computeSavingPlanTotals } from "../app/api/saving-plan/compute";

import { DEMO_ACCOUNT_ID } from "./demoConstants";
import { prisma } from "./prisma";

import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** The plan's monthly rate right now: the rates of the open dated goals whose date is still ahead. */
export async function currentSavingRateCents(householdId: string, now: Date, db: Db = prisma): Promise<number> {
  const goals = await db.budget.findMany({
    where: { account: { householdId }, categoryId: null, deletedAt: null },
    select: { amountCents: true, monthlyRateCents: true, completedAt: true, month: true, year: true }
  });
  return computeSavingPlanTotals(goals, now).monthlyRateCents;
}

/** Writes `rateCents` as the rate of the running Berlin month (insert or overwrite). */
export async function recordSavingRate(
  householdId: string,
  rateCents: number,
  now: Date,
  db: Db = prisma
): Promise<void> {
  const { year, month } = zonedMonth(now);
  // One statement, safe when two requests record at the same moment.
  await db.$executeRaw`
    INSERT INTO "SavingRateMonthSnapshot" ("id", "householdId", "year", "month", "rateCents", "updatedAt")
    VALUES (${crypto.randomUUID()}, ${householdId}, ${year}, ${month}, ${rateCents}, NOW())
    ON CONFLICT ("householdId", "year", "month")
    DO UPDATE SET "rateCents" = EXCLUDED."rateCents", "updatedAt" = NOW()
    WHERE "SavingRateMonthSnapshot"."rateCents" IS DISTINCT FROM EXCLUDED."rateCents"`;
}

/** Computes the current rate and records it for the running month; returns it. */
export async function refreshSavingRate(householdId: string, now: Date = new Date()): Promise<number> {
  const rateCents = await currentSavingRateCents(householdId, now);
  await recordSavingRate(householdId, rateCents, now);
  return rateCents;
}

/**
 * The rate of a month: for the running month the current rate (recorded on the
 * way), for any other month what was recorded while it ran — null if nothing
 * was recorded (the app was not used and the cron did not run that month, or
 * the month lies before rates existed).
 */
export async function savingRateOfMonth(householdId: string, ref: MonthRef, now: Date): Promise<number | null> {
  const current = zonedMonth(now);
  if (current.year === ref.year && current.month === ref.month) {
    return refreshSavingRate(householdId, now);
  }
  const row = await prisma.savingRateMonthSnapshot.findUnique({
    where: { householdId_year_month: { householdId, year: ref.year, month: ref.month } },
    select: { rateCents: true }
  });
  return row?.rateCents ?? null;
}

/** Records the running month's rate for every household except the public demo (daily cron). */
export async function recordSavingRatesForAllHouseholds(now: Date): Promise<number> {
  const demo = await prisma.account.findUnique({ where: { id: DEMO_ACCOUNT_ID }, select: { householdId: true } });
  const households = await prisma.household.findMany({
    where: { deletedAt: null, ...(demo?.householdId ? { id: { not: demo.householdId } } : {}) },
    select: { id: true }
  });
  let recorded = 0;
  for (const household of households) {
    // One household failing (e.g. deleted in the meantime) must not stop the others.
    try {
      await refreshSavingRate(household.id, now);
      recorded += 1;
    } catch (error) {
      // eslint-disable-next-line no-console -- surfaces in Railway logs, run continues
      console.error("Failed to record the saving rate", { householdId: household.id }, error);
    }
  }
  return recorded;
}
