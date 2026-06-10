import { createSafeActionClient } from "next-safe-action";

import { getSessionUser } from "./auth";

/**
 * Base action client — adds type-safe Zod input validation to Server Actions.
 * Reference: https://next-safe-action.dev/docs/safe-action-client/initialization
 */
export const actionClient = createSafeActionClient();

/**
 * Authenticated action client — throws UNAUTHENTICATED if no session exists.
 * Use this for all mutations that require a logged-in user.
 */
export const authActionClient = actionClient.use(async ({ next }) => {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  return next({ ctx: { user } });
});
