import { z } from "zod";

export const MakeRecurringInput = z.object({
  intervalMonths: z.number().int().min(1).max(24),
  dayOfMonth: z.number().int().min(1).max(31).optional()
});

export type MakeRecurringInputType = z.infer<typeof MakeRecurringInput>;
