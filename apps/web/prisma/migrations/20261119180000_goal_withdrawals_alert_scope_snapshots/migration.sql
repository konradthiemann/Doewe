-- 1. Saving goals: completing a goal now books a real withdrawal from the
--    savings pool. Goals completed before this keep their amount held back
--    ("reservedCents") so the available pool does not jump.
-- AlterTable
ALTER TABLE "Budget" ADD COLUMN     "reservedCents" INTEGER,
ADD COLUMN     "withdrawalTransactionId" TEXT;

UPDATE "Budget"
SET "reservedCents" = "spentCents"
WHERE "categoryId" IS NULL AND "completedAt" IS NOT NULL AND "spentCents" IS NOT NULL;

-- 2. Standing orders: first month that may be booked automatically.
--    Existing templates keep their behaviour (no lower bound).
-- AlterTable
ALTER TABLE "RecurringTransaction" ADD COLUMN     "bookFromPeriod" TEXT;

-- 3. Budget alerts: key the log by household and category instead of a
--    per-month Budget row, so budget plans can raise alerts too.
-- DropIndex
DROP INDEX "BudgetAlertLog_budgetId_year_month_threshold_key";

-- AlterTable
ALTER TABLE "BudgetAlertLog" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "householdId" TEXT,
ALTER COLUMN "budgetId" DROP NOT NULL;

UPDATE "BudgetAlertLog" AS l
SET "householdId" = a."householdId", "categoryId" = b."categoryId"
FROM "Budget" AS b
JOIN "Account" AS a ON a."id" = b."accountId"
WHERE b."id" = l."budgetId";

-- Two per-month rows of the same category on different accounts may each have
-- logged the same threshold; keep the oldest so the new unique index holds.
DELETE FROM "BudgetAlertLog" AS l
USING "BudgetAlertLog" AS o
WHERE l."householdId" = o."householdId"
  AND l."categoryId" = o."categoryId"
  AND l."year" = o."year"
  AND l."month" = o."month"
  AND l."threshold" = o."threshold"
  AND (l."sentAt", l."id") > (o."sentAt", o."id");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetAlertLog_householdId_categoryId_year_month_threshold_key" ON "BudgetAlertLog"("householdId", "categoryId", "year", "month", "threshold");

-- 4. Category budgets of completed months, frozen on first read.
-- CreateTable
CREATE TABLE "BudgetMonthSnapshot" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "budgets" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetMonthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BudgetMonthSnapshot_householdId_year_month_key" ON "BudgetMonthSnapshot"("householdId", "year", "month");

-- AddForeignKey
ALTER TABLE "BudgetMonthSnapshot" ADD CONSTRAINT "BudgetMonthSnapshot_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
