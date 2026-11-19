import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { DEFAULT_BOARD_NAME } from "./board-migration";

type Db = Prisma.TransactionClient | PrismaClient;

export { DEFAULT_BOARD_NAME };

/** Longest board name, in characters. */
export const BOARD_NAME_MAX = 80;

/**
 * The creator's first board, creating "My board" when they have none yet (DIG-25). New accounts
 * get their board here, the first time something needs one.
 */
export async function getOrCreateDefaultBoard(userId: string, db: Db) {
  const first = await db.board.findFirst({
    where: { ownerId: userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return first ?? db.board.create({ data: { ownerId: userId, name: DEFAULT_BOARD_NAME, sortOrder: 0 } });
}

/** Validates a board name from a request. Trims it; 1 to 80 characters. */
export const boardNameSchema = z
  .string({ required_error: "Give the board a name.", invalid_type_error: "Give the board a name." })
  .trim()
  .min(1, "Give the board a name.")
  .max(BOARD_NAME_MAX, `Board names can be up to ${BOARD_NAME_MAX} characters.`);

/** A board in the list: its name, place, and what is on it. */
export interface BoardSummary {
  id: string;
  name: string;
  sortOrder: number;
  photoCount: number;
  zineCount: number;
}

/** The creator's boards in their order, making "My board" first if they have none. */
export async function listBoards(userId: string, db: Db): Promise<BoardSummary[]> {
  await getOrCreateDefaultBoard(userId, db);
  const boards = await db.board.findMany({
    where: { ownerId: userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, sortOrder: true, _count: { select: { assets: true, zines: true } } },
  });
  return boards.map(({ _count, ...b }) => ({ ...b, photoCount: _count.assets, zineCount: _count.zines }));
}
