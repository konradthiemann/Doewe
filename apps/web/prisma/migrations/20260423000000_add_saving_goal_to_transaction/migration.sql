-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "savingGoalId" TEXT;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_savingGoalId_fkey" FOREIGN KEY ("savingGoalId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
