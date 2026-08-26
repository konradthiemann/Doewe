import { prisma } from "./prisma";

import type { Prisma } from "@prisma/client";

/**
 * Identifies the calling service on `AdminActionLog` rows. Bearer-Token-Auth
 * (isAuthorizedService) has no per-caller identity today — every write from
 * the Symfony control-plane is attributed to this constant.
 */
export const CONTROL_PLANE_ACTOR = "control-plane";

/**
 * Records one row on `AdminActionLog` for a moderation action taken by the
 * control-plane (suspend/unsuspend, delete, household split). This is a
 * dedicated, append-only audit log — NOT `MutationLog`, which is a narrow
 * idempotency table for mobile-sync dedup (keyed by mutationId+userId).
 */
export async function logAdminAction(input: {
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.adminActionLog.create({
    data: {
      actor: input.actor,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ?? undefined
    }
  });
}
