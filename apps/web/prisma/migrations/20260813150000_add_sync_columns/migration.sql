-- Phase 3b — Zwei-Wege-Sync: Sync-Metadaten auf allen syncbaren Models.
-- updatedAt (NOT NULL, DB-Default CURRENT_TIMESTAMP → backfillt Bestandszeilen,
-- App bumpt es via Prisma @updatedAt) + deletedAt (Tombstone, nullable).

-- Account
ALTER TABLE "Account" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Account" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Category
ALTER TABLE "Category" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Category" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Transaction
ALTER TABLE "Transaction" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Transaction" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- RecurringTransaction
ALTER TABLE "RecurringTransaction" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "RecurringTransaction" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Budget
ALTER TABLE "Budget" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Budget" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Konflikt-Journal
CREATE TABLE "ConflictLog" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "serverValue" JSONB NOT NULL,
    "clientValue" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConflictLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConflictLog_householdId_idx" ON "ConflictLog"("householdId");
