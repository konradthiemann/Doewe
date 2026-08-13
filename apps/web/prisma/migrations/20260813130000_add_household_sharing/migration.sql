-- Teil D — Haushalts-Sharing: move the tenant boundary from User to Household.
-- Additive + backfill migration. Every existing user becomes the OWNER of their
-- own single-member household; their accounts/categories are scoped to it.

-- 1. New tables ------------------------------------------------------------
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HouseholdMember" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HouseholdInvite" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HouseholdInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HouseholdMember_userId_key" ON "HouseholdMember"("userId");
CREATE INDEX "HouseholdMember_householdId_idx" ON "HouseholdMember"("householdId");
CREATE UNIQUE INDEX "HouseholdInvite_tokenHash_key" ON "HouseholdInvite"("tokenHash");
CREATE INDEX "HouseholdInvite_householdId_idx" ON "HouseholdInvite"("householdId");

-- 2. New scoping columns (nullable first, so the backfill can populate them) --
ALTER TABLE "Account" ADD COLUMN "householdId" TEXT;
ALTER TABLE "Category" ADD COLUMN "householdId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "createdByUserId" TEXT;

-- 3. Backfill: one household per existing user (deterministic ids) ----------
INSERT INTO "Household" ("id", "name", "createdAt")
SELECT 'hh_' || u."id", COALESCE(NULLIF(u."name", ''), 'Haushalt'), CURRENT_TIMESTAMP
FROM "User" u;

INSERT INTO "HouseholdMember" ("id", "householdId", "userId", "role", "joinedAt")
SELECT 'hm_' || u."id", 'hh_' || u."id", u."id", 'OWNER', CURRENT_TIMESTAMP
FROM "User" u;

UPDATE "Account" SET "householdId" = 'hh_' || "userId";
UPDATE "Category" SET "householdId" = 'hh_' || "userId";
UPDATE "Transaction" t SET "createdByUserId" = a."userId"
FROM "Account" a WHERE t."accountId" = a."id";

-- 4. Enforce NOT NULL now that every row is backfilled ---------------------
ALTER TABLE "Account" ALTER COLUMN "householdId" SET NOT NULL;
ALTER TABLE "Category" ALTER COLUMN "householdId" SET NOT NULL;

-- 5. Swap the Category uniqueness from (userId,name) to (householdId,name) --
DROP INDEX "Category_userId_name_key";
CREATE UNIQUE INDEX "Category_householdId_name_key" ON "Category"("householdId", "name");

-- 6. Indexes for the new scoping columns -----------------------------------
CREATE INDEX "Account_householdId_idx" ON "Account"("householdId");
CREATE INDEX "Category_householdId_idx" ON "Category"("householdId");

-- 7. Foreign keys ----------------------------------------------------------
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdInvite" ADD CONSTRAINT "HouseholdInvite_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
