import { prisma } from "@/lib/prisma";
import { BOARD_ORDER } from "@/lib/board-pages";

/** The fields a board card needs; see `toBoardAsset`. */
export const BOARD_ASSET_SELECT = {
  id: true,
  publicUrl: true,
  originalName: true,
  name: true,
  kind: true,
  exif: true,
  recipe: true,
  recipeId: true,
  sizeBytes: true,
  status: true,
  processingError: true,
  blurDataUrl: true,
  edit: true,
  width: true,
  height: true,
} as const;

/**
 * One page of a board's photos in board order (DIG-29), the cursor for the next page, and the
 * board's total. `cursor` is the id of the last photo of the previous page, and must be one of
 * this creator's photos on this board; otherwise this returns null.
 */
export async function boardPhotoPage(ownerId: string, boardId: string, limit: number, cursor: string | null) {
  if (cursor) {
    const anchor = await prisma.mediaAsset.findFirst({ where: { id: cursor, ownerId, boardId }, select: { id: true } });
    if (!anchor) return null;
  }
  const where = { ownerId, boardId };
  const [rows, total] = await Promise.all([
    prisma.mediaAsset.findMany({
      where,
      orderBy: [...BOARD_ORDER],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: BOARD_ASSET_SELECT,
    }),
    prisma.mediaAsset.count({ where }),
  ]);
  const assets = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? assets[assets.length - 1].id : null;
  return { assets, nextCursor, total };
}
