-- DIG-137: admins deactivate, reactivate, and delete accounts. Additive only.
-- Postgres 12+ adds enum values inside a transaction, as long as they are not used in it.
ALTER TYPE "AdminActionType" ADD VALUE 'deactivate';
ALTER TYPE "AdminActionType" ADD VALUE 'reactivate';
ALTER TYPE "AdminActionType" ADD VALUE 'delete_user';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deactivatedAt" TIMESTAMP(3);
