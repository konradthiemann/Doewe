import type { PrismaClient } from "@prisma/client";

/**
 * Stellt den geteilten Demo-User samt 36 Monaten Beispieldaten sicher.
 * Idempotent und selbst-auffrischend.
 */
export function ensureDemoData(prisma: PrismaClient): Promise<{ refreshed: boolean }>;
