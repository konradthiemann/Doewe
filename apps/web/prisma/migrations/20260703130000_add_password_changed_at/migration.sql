-- Track when a user's password last changed so that JWT sessions issued before
-- that instant can be rejected (password reset / change evicts old sessions).
-- AlterTable
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
