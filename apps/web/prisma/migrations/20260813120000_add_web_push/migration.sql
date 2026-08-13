-- AlterTable: user notification preferences + locale for server-rendered push
ALTER TABLE "User" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'de';
ALTER TABLE "User" ADD COLUMN     "notifyBudgetAlerts" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN     "notifyMonthlyReview" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetAlertLog" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "threshold" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetAlertLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "time" TEXT NOT NULL DEFAULT '20:00',
    "weekdays" INTEGER NOT NULL DEFAULT 127,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "smartSuppress" BOOLEAN NOT NULL DEFAULT true,
    "lastSentOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "BudgetAlertLog_budgetId_idx" ON "BudgetAlertLog"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetAlertLog_budgetId_year_month_threshold_key" ON "BudgetAlertLog"("budgetId", "year", "month", "threshold");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderSetting_userId_key" ON "ReminderSetting"("userId");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderSetting" ADD CONSTRAINT "ReminderSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
