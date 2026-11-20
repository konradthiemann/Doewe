-- Saving goals no longer read a savings pool. A goal gets a planned monthly
-- rate, and payments made straight from the savings (outside the app's
-- accounts) are recorded on the goal instead of as bookings.

-- AlterTable
ALTER TABLE "Budget" ADD COLUMN     "monthlyRateCents" INTEGER;

-- CreateTable
CREATE TABLE "SavingGoalPayment" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavingGoalPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavingGoalPayment_goalId_idx" ON "SavingGoalPayment"("goalId");

-- AddForeignKey
ALTER TABLE "SavingGoalPayment" ADD CONSTRAINT "SavingGoalPayment_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
