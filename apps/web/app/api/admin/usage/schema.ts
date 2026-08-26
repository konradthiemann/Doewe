import { z } from "zod";

export const UsageQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30)
});
