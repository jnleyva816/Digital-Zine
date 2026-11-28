import { PrismaClient } from "@prisma/client";
import { migrateToBoards } from "../src/lib/board/board-migration";

/**
 * DIG-25: puts existing photos and zines on a board before `prisma db push` makes the board
 * required. `npm run db:push` runs it first. Safe to run again.
 */
const prisma = new PrismaClient();

migrateToBoards(prisma)
  .then(({ boardsCreated }) => console.log(`Boards ready (${boardsCreated} created).`))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
