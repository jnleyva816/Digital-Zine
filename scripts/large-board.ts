import type { PrismaClient } from "@prisma/client";

/** Seed images every environment has (the seed writes them). Large boards cycle through them. */
const SEED_IMAGES = [
  "seed/plate-01-harbor-dusk.jpg",
  "seed/plate-02-morning-fog.jpg",
  "seed/plate-03-neon-alley.jpg",
];

/**
 * Adds `count` photos to a board for testing large boards (DIG-29). They are named p0000,
 * p0001, … in board order and show the seed images, so no files are written. Their storage keys
 * are placeholders under `seed/large/`, and their size counts as 0 bytes.
 */
export async function seedLargeBoard(db: PrismaClient, ownerId: string, boardId: string, count: number) {
  const width = String(count - 1).length;
  for (let start = 0; start < count; start += 1000) {
    await db.mediaAsset.createMany({
      data: Array.from({ length: Math.min(1000, count - start) }, (_, j) => {
        const i = start + j;
        const name = `p${String(i).padStart(Math.max(4, width), "0")}`;
        return {
          ownerId,
          boardId,
          storageKey: `seed/large/${boardId}/${name}.jpg`,
          publicUrl: `/api/media/${SEED_IMAGES[i % SEED_IMAGES.length]}`,
          originalName: name,
          sortOrder: i,
        };
      }),
    });
  }
}
