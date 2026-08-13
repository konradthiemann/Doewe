-- CreateTable
CREATE TABLE "MutationLog" (
    "id" TEXT NOT NULL,
    "mutationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MutationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MutationLog_mutationId_key" ON "MutationLog"("mutationId");

-- CreateIndex
CREATE INDEX "MutationLog_userId_idx" ON "MutationLog"("userId");
