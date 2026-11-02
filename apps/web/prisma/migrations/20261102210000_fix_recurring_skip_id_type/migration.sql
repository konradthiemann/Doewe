-- Production drift: "RecurringTransactionSkip" existed before
-- 20260119110500_fix_recurring_columns ran (created by hand with an integer
-- SERIAL id), so its CREATE TABLE IF NOT EXISTS never applied the TEXT id.
-- Prisma writes cuid strings -> every skip insert failed with 22P03.
-- Align the column with schema.prisma. Safe where the id is already TEXT.
ALTER TABLE "RecurringTransactionSkip" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "RecurringTransactionSkip" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
DROP SEQUENCE IF EXISTS "RecurringTransactionSkip_id_seq";
