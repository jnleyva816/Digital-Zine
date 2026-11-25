-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "viewPrefs" JSONB;

-- CreateTable
CREATE TABLE "BoardPlacement" (
    "assetId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "z" INTEGER NOT NULL DEFAULT 0,
    "look" TEXT NOT NULL DEFAULT 'print',
    "tape" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BoardPlacement_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "BoardNote" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "z" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoardPlacement_boardId_idx" ON "BoardPlacement"("boardId");

-- CreateIndex
CREATE INDEX "BoardNote_boardId_idx" ON "BoardNote"("boardId");

-- AddForeignKey
ALTER TABLE "BoardPlacement" ADD CONSTRAINT "BoardPlacement_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardPlacement" ADD CONSTRAINT "BoardPlacement_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardNote" ADD CONSTRAINT "BoardNote_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

