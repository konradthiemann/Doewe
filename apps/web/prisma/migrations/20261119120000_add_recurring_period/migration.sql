-- The month ("YYYY-MM", Europe/Berlin) an auto-booked recurring occurrence was
-- booked for. Identifies the occurrence independently of occurredAt, so moving
-- or deleting the booking no longer makes the month look unbooked.

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "recurringPeriod" TEXT;

-- Backfill: existing auto-booked rows (tombstones included) were booked for the
-- Berlin calendar month of their occurredAt. occurredAt is stored as UTC.
UPDATE "Transaction"
SET "recurringPeriod" = to_char(("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Berlin', 'YYYY-MM')
WHERE "recurringTransactionId" IS NOT NULL;

-- DropIndex
DROP INDEX "Transaction_recurringTransactionId_idx";

-- CreateIndex
CREATE INDEX "Transaction_recurringTransactionId_recurringPeriod_idx" ON "Transaction"("recurringTransactionId", "recurringPeriod");
