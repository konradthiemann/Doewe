import { z } from "zod";

export const SuspendUserInput = z.object({
  suspended: z.boolean()
});
