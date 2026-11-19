import { BUDGET_PERIODS, zonedDate } from "@doewe/shared";
import { z } from "zod";

const PeriodSchema = z.enum(BUDGET_PERIODS);
const AmountSchema = z.number().int().min(1).max(1_000_000_000);

export const CreateBudgetPlanSchema = z.object({
  categoryId: z.string().min(1),
  period: PeriodSchema,
  amountCents: AmountSchema
});

export const UpdateBudgetPlanSchema = z
  .object({
    period: PeriodSchema.optional(),
    amountCents: AmountSchema.optional()
  })
  .refine((data) => data.period !== undefined || data.amountCents !== undefined, {
    message: "No update fields provided"
  });

export const ListQuerySchema = z.object({
  // Lazy default: the current year in Europe/Berlin at the time of the request.
  // A plain value would be evaluated once at module load (stale after New Year
  // in a long-running process) and in the time zone of the process.
  year: z.coerce
    .number()
    .int()
    .min(2000)
    .max(2100)
    .default(() => zonedDate(new Date()).year)
});

type PlanRow = {
  id: string;
  categoryId: string;
  period: string;
  amountCents: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Public shape of a plan (no householdId/deletedAt). */
export function toPlanDto(row: PlanRow) {
  return {
    id: row.id,
    categoryId: row.categoryId,
    period: row.period,
    amountCents: row.amountCents,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
