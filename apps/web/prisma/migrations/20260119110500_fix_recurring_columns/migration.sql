-- Ensure RecurringTransaction has intervalMonths
ALTER TABLE "RecurringTransaction"
ADD COLUMN IF NOT EXISTS "intervalMonths" INTEGER NOT NULL DEFAULT 1;

-- Ensure RecurringTransactionSkip table exists with expected columns
CREATE TABLE IF NOT EXISTS "RecurringTransactionSkip" (
  "id" TEXT NOT NULL,
  "recurringId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecurringTransactionSkip_pkey" PRIMARY KEY ("id")
);

-- Ensure required columns exist (for manually created tables)
ALTER TABLE "RecurringTransactionSkip"
ADD COLUMN IF NOT EXISTS "recurringId" TEXT;
ALTER TABLE "RecurringTransactionSkip"
ADD COLUMN IF NOT EXISTS "year" INTEGER;
ALTER TABLE "RecurringTransactionSkip"
ADD COLUMN IF NOT EXISTS "month" INTEGER;
ALTER TABLE "RecurringTransactionSkip"
ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "RecurringTransactionSkip" WHERE "recurringId" IS NULL OR "year" IS NULL OR "month" IS NULL
  ) THEN
    ALTER TABLE "RecurringTransactionSkip" ALTER COLUMN "recurringId" SET NOT NULL;
    ALTER TABLE "RecurringTransactionSkip" ALTER COLUMN "year" SET NOT NULL;
    ALTER TABLE "RecurringTransactionSkip" ALTER COLUMN "month" SET NOT NULL;
  END IF;
END $$;

-- Add FK and indexes if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RecurringTransactionSkip_recurringId_fkey'
  ) THEN
    ALTER TABLE "RecurringTransactionSkip"
    ADD CONSTRAINT "RecurringTransactionSkip_recurringId_fkey"
    FOREIGN KEY ("recurringId") REFERENCES "RecurringTransaction"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'RecurringTransactionSkip_recurringId_idx'
  ) THEN
    CREATE INDEX "RecurringTransactionSkip_recurringId_idx" ON "RecurringTransactionSkip"("recurringId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'RecurringTransactionSkip_recurringId_year_month_key'
  ) THEN
    CREATE UNIQUE INDEX "RecurringTransactionSkip_recurringId_year_month_key" ON "RecurringTransactionSkip"("recurringId", "year", "month");
  END IF;
END $$;
