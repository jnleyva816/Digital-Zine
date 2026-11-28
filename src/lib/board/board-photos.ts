import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BOARD_ORDER } from "@/lib/board/board-pages";

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

/** Which of a board's photos the tray shows (DIG-88). */
export const TRAY_FILTERS = ["all", "unplaced", "recipes"] as const;
export type TrayFilter = (typeof TRAY_FILTERS)[number];
export const TRAY_SEARCH_MAX = 100;

const SHOW: Record<TrayFilter, Prisma.MediaAssetWhereInput> = {
  all: {},
  unplaced: { placement: { is: null } },
  recipes: { kind: "recipe" },
};

/** Photos whose name, file name, recipe, film simulation, or camera contains the text. */
function matching(search: string): Prisma.MediaAssetWhereInput {
  const text = search.trim();
  if (!text) return {};
  // LIKE's wildcards are plain characters in a search box.
  const contains = text.replace(/[\\%_]/g, "\\$&");
  const mode = "insensitive" as const;
  const json = (path: string[]) => ({ path, string_contains: contains, mode });
  return {
    OR: [
      { name: { contains, mode } },
      { originalName: { contains, mode } },
      { recipe: json(["name"]) },
      { recipe: json(["filmSimulation"]) },
      { exif: json(["cameraModel"]) },
      { exif: json(["cameraMake"]) },
    ],
  };
}

/** How many photos each tray filter holds, whatever is being searched for. */
export async function trayCounts(ownerId: string, boardId: string): Promise<Record<TrayFilter, number>> {
  const [all, unplaced, recipes] = await Promise.all(TRAY_FILTERS.map((show) => prisma.mediaAsset.count({ where: { ownerId, boardId, ...SHOW[show] } })));
  return { all, unplaced, recipes };
}

/**
 * One page of a board's photos in board order (DIG-29), the cursor for the next page, and the
 * board's total. `cursor` is the id of the last photo of the previous page, and must be one of
 * this creator's photos on this board; otherwise this returns null.
 */
export async function boardPhotoPage(
  ownerId: string,
  boardId: string,
  limit: number,
  cursor: string | null,
  { search = "", show = "all" }: { search?: string; show?: TrayFilter } = {}
) {
  if (cursor) {
    const anchor = await prisma.mediaAsset.findFirst({ where: { id: cursor, ownerId, boardId }, select: { id: true } });
    if (!anchor) return null;
  }
  const where: Prisma.MediaAssetWhereInput = { ownerId, boardId, ...SHOW[show], ...matching(search) };
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
