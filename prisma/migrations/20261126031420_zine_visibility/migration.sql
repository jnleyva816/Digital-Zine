-- CreateEnum
CREATE TYPE "ZineVisibility" AS ENUM ('public', 'private');

-- AlterTable
ALTER TABLE "Zine" ADD COLUMN     "accessCodeHash" TEXT,
ADD COLUMN     "accessCodeVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "visibility" "ZineVisibility" NOT NULL DEFAULT 'public';

