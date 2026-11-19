import type { Prisma, PrismaClient } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

/** Name of the board every existing creator gets when boards arrive (DIG-25). */
export const DEFAULT_BOARD_NAME = "My board";

/**
 * Puts every existing photo and zine on a board, so `prisma db push` can then make `boardId`
 * required (DIG-25). Run it before `db push`; it is safe to run any number of times.
 *
 * Each creator without a board gets "My board". Rows with no board join their owner's first
 * board. On a fresh database (no `User` table yet) it does nothing.
 */
export async function migrateToBoards(db: Db): Promise<{ boardsCreated: number }> {
  const [{ exists }] = await db.$queryRaw<{ exists: boolean }[]>`
    SELECT to_regclass('public."User"') IS NOT NULL AS "exists"`;
  if (!exists) return { boardsCreated: 0 };

  // The shape `db push` creates; it adds the foreign key and indexes afterwards.
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Board" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "ownerId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL
    )`);
  await db.$executeRawUnsafe(`ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "boardId" TEXT`);
  await db.$executeRawUnsafe(`ALTER TABLE "Zine" ADD COLUMN IF NOT EXISTS "boardId" TEXT`);

  const boardsCreated = await db.$executeRaw`
    INSERT INTO "Board" ("id", "ownerId", "name", "sortOrder", "updatedAt")
    SELECT gen_random_uuid()::text, u."id", ${DEFAULT_BOARD_NAME}, 0, CURRENT_TIMESTAMP
    FROM "User" u
    WHERE NOT EXISTS (SELECT 1 FROM "Board" b WHERE b."ownerId" = u."id")`;

  for (const table of ["MediaAsset", "Zine"]) {
    await db.$executeRawUnsafe(`
      UPDATE "${table}" t
      SET "boardId" = (
        SELECT b."id" FROM "Board" b
        WHERE b."ownerId" = t."ownerId"
        ORDER BY b."sortOrder", b."createdAt", b."id"
        LIMIT 1
      )
      WHERE t."boardId" IS NULL`);
  }

  return { boardsCreated };
}
