import { PrismaClient } from "@prisma/client";
import { getOrCreateDefaultBoard } from "../src/lib/board/boards";
import { seedLargeBoard } from "./large-board";

/**
 * Fills a creator's first board with test photos (DIG-29):
 *   npx tsx scripts/seed-large-board.ts creator@digitalzine.local 2000
 */
async function main() {
  const [email, countArg = "2000"] = process.argv.slice(2);
  const count = Number(countArg);
  if (!email || !Number.isInteger(count) || count < 1) {
    throw new Error("Usage: tsx scripts/seed-large-board.ts <email> [count]");
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const board = await getOrCreateDefaultBoard(user.id, prisma);
    await seedLargeBoard(prisma, user.id, board.id, count);
    console.log(`Added ${count} photos to “${board.name}” for ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
