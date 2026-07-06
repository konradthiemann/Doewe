-- Allow users without a local password (accounts created via an OAuth provider
-- such as Google). Credentials sign-in already rejects users without a password.
-- AlterTable
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;
