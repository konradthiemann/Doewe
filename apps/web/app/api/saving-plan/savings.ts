/**
 * Helpers shared by the saving-plan routes.
 *
 * The app keeps no savings balance (docs/calculations/07-sparziele.md), so
 * nothing here sums the savings bookings any more.
 */
import { isSavingsCategoryName, parseDayKey, zonedDate, zonedTimeToUtc } from "@doewe/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../lib/prisma";
import { INT4_MAX } from "../transactions/schema";

import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * The savings category a new savings booking (taking money back from the
 * savings) is written to: the oldest one, so the choice is stable when a
 * household has several.
 */
export async function findSavingsBookingCategoryId(householdId: string, db: Db = prisma): Promise<string | null> {
  const categories = await db.category.findMany({
    // Explicit deletedAt, so the result does not depend on which client runs the query.
    where: { householdId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  return categories.find((category) => isSavingsCategoryName(category.name))?.id ?? null;
}

/**
 * Loads a saving goal of the household: 404 for an unknown id, a category
 * budget (not a goal) or a deleted goal (`findUnique` sees tombstones, so
 * `deletedAt` is checked explicitly), 403 for a goal of another household.
 */
export async function loadOwnedGoal(id: string, householdId: string) {
  const goal = await prisma.budget.findUnique({
    where: { id },
    include: { account: { select: { householdId: true } } }
  });

  if (!goal || goal.categoryId !== null || goal.deletedAt !== null) {
    return { error: NextResponse.json({ error: "Goal not found" }, { status: 404 }) } as const;
  }
  if (goal.account.householdId !== householdId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }
  return { goal } as const;
}

/** Body of a payment from savings (POST …/payments, and the optional last payment on completion). */
export const SavingsPaymentInput = z.object({
  amountCents: z.number().int().min(1).max(INT4_MAX),
  /** Berlin calendar day `yyyy-mm-dd`; default today. */
  day: z
    .string()
    .refine((value) => parseDayKey(value) !== null, { message: "day must be a calendar day yyyy-mm-dd" })
    .optional(),
  note: z.string().trim().max(200).optional()
});
export type SavingsPaymentInputValue = z.infer<typeof SavingsPaymentInput>;

/** The instant stored for a payment: 12:00 Berlin of its day (calculation rules §1). */
export function paymentOccurredAt(day: string | undefined, now: Date): Date {
  const calendarDay = (day ? parseDayKey(day) : null) ?? zonedDate(now);
  return zonedTimeToUtc({ ...calendarDay, hour: 12 });
}
