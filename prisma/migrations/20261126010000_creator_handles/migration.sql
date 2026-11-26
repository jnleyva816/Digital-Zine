-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "handle" TEXT;

-- CreateTable
CREATE TABLE "UserHandle" (
    "handle" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserHandle_pkey" PRIMARY KEY ("handle")
);

-- CreateIndex
CREATE INDEX "UserHandle_userId_idx" ON "UserHandle"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- AddForeignKey
ALTER TABLE "UserHandle" ADD CONSTRAINT "UserHandle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

