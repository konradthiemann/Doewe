import { z } from "zod";

export const SplitMemberInput = z.object({
  userId: z.string().min(1)
});
