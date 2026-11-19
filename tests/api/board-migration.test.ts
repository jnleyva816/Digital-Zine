import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BOARD_NAME, migrateToBoards } from "@/lib/board-migration";

/**
 * DIG-25 data migration. Each test runs in a transaction that puts the tables back in their
 * pre-boards shape (no required board), arranges legacy rows, migrates, checks, and rolls back.
 */
class Rollback extends Error {}

async function inLegacyDatabase(fn: (tx: Prisma.TransactionClient) => Promise<void>) {
  await prisma
    .$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`ALTER TABLE "MediaAsset" ALTER COLUMN "boardId" DROP NOT NULL`);
      await tx.$executeRawUnsafe(`ALTER TABLE "Zine" ALTER COLUMN "boardId" DROP NOT NULL`);
      await fn(tx);
      throw new Rollback();
    })
    .catch((err: unknown) => {
      if (!(err instanceof Rollback)) throw err;
    });
}

async function legacyUser(tx: Prisma.TransactionClient) {
  return tx.user.create({ data: { email: `mig-${randomUUID()}@test.local`, passwordHash: "x" } });
}

async function legacyAsset(tx: Prisma.TransactionClient, ownerId: string) {
  const id = randomUUID();
  const key = `users/${ownerId}/${id}.jpg`;
  await tx.$executeRaw`
    INSERT INTO "MediaAsset" (id, "ownerId", "storageKey", "publicUrl", "updatedAt")
    VALUES (${id}, ${ownerId}, ${key}, ${`/api/media/${key}`}, now())`;
  return id;
}

async function legacyZine(tx: Prisma.TransactionClient, ownerId: string) {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "Zine" (id, "ownerId", title, slug, "updatedAt")
    VALUES (${id}, ${ownerId}, 'Legacy', ${`legacy-${id}`}, now())`;
  return id;
}

const boardIdOf = async (tx: Prisma.TransactionClient, table: "MediaAsset" | "Zine", id: string) =>
  (await tx.$queryRawUnsafe<{ boardId: string | null }[]>(`SELECT "boardId" FROM "${table}" WHERE id = $1`, id))[0]
    ?.boardId;

describe("migrateToBoards (DIG-25)", () => {
  it("gives each existing creator a board named “My board” holding all their photos and zines", async () => {
    await inLegacyDatabase(async (tx) => {
      const user = await legacyUser(tx);
      const photoA = await legacyAsset(tx, user.id);
      const photoB = await legacyAsset(tx, user.id);
      const zine = await legacyZine(tx, user.id);
      const emptyUser = await legacyUser(tx);

      await migrateToBoards(tx);

      const boards = await tx.board.findMany({ where: { ownerId: user.id } });
      expect(boards).toHaveLength(1);
      expect(boards[0]).toMatchObject({ name: DEFAULT_BOARD_NAME, sortOrder: 0 });
      expect(await boardIdOf(tx, "MediaAsset", photoA)).toBe(boards[0].id);
      expect(await boardIdOf(tx, "MediaAsset", photoB)).toBe(boards[0].id);
      expect(await boardIdOf(tx, "Zine", zine)).toBe(boards[0].id);
      // A creator with nothing yet still gets a board to upload into.
      expect(await tx.board.count({ where: { ownerId: emptyUser.id, name: DEFAULT_BOARD_NAME } })).toBe(1);
    });
  });

  it("is safe to run twice and leaves rows that already have a board alone", async () => {
    await inLegacyDatabase(async (tx) => {
      const user = await legacyUser(tx);
      const existing = await tx.board.create({ data: { ownerId: user.id, name: "Trips", sortOrder: 0 } });
      const placed = await legacyAsset(tx, user.id);
      await tx.$executeRaw`UPDATE "MediaAsset" SET "boardId" = ${existing.id} WHERE id = ${placed}`;
      const loose = await legacyAsset(tx, user.id);

      await migrateToBoards(tx);
      await migrateToBoards(tx);

      // The creator already had a board, so no "My board" is added; the loose photo joins their first board.
      expect(await tx.board.count({ where: { ownerId: user.id } })).toBe(1);
      expect(await boardIdOf(tx, "MediaAsset", placed)).toBe(existing.id);
      expect(await boardIdOf(tx, "MediaAsset", loose)).toBe(existing.id);
    });
  });
});
