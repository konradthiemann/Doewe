-- Saving goals may now be "undated" (no target month/year) and may omit a
-- target amount. Category budgets continue to set these via app-level validation.
-- AlterTable
ALTER TABLE "Budget" ALTER COLUMN "month" DROP NOT NULL;
ALTER TABLE "Budget" ALTER COLUMN "year" DROP NOT NULL;
ALTER TABLE "Budget" ALTER COLUMN "amountCents" DROP NOT NULL;
