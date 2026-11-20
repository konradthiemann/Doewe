-- The monthly rate of the saving plan per month, so the review can compare
-- what was saved in a past month with the rate that applied then.

-- CreateTable
CREATE TABLE "SavingRateMonthSnapshot" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "rateCents" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavingRateMonthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SavingRateMonthSnapshot_householdId_year_month_key" ON "SavingRateMonthSnapshot"("householdId", "year", "month");

-- AddForeignKey
ALTER TABLE "SavingRateMonthSnapshot" ADD CONSTRAINT "SavingRateMonthSnapshot_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
