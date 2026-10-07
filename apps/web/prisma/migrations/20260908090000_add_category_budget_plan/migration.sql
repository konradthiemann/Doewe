-- CreateTable
CREATE TABLE "CategoryBudgetPlan" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CategoryBudgetPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryBudgetPlan_categoryId_key" ON "CategoryBudgetPlan"("categoryId");

-- CreateIndex
CREATE INDEX "CategoryBudgetPlan_householdId_idx" ON "CategoryBudgetPlan"("householdId");

-- AddForeignKey
ALTER TABLE "CategoryBudgetPlan" ADD CONSTRAINT "CategoryBudgetPlan_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryBudgetPlan" ADD CONSTRAINT "CategoryBudgetPlan_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

