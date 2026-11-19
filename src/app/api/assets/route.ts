import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { fujiRecipeSchema } from "@/lib/fuji-recipe";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadLimitResponse } from "@/lib/limit-response";
import { checkUpload } from "@/lib/limits";
import { enqueueProcessing } from "@/lib/media/queue";
import { getStorageDriver } from "@/lib/storage";
import { getAccountUsageBytes, withUserLock } from "@/lib/usage";
import { getOrCreateDefaultBoard } from "@/lib/boards";

const exifSchema = z
  .object({
    iso: z.union([z.string(), z.number(), z.null()]).optional(),
    aperture: z.string().nullable().optional(),
    shutterSpeed: z.string().nullable().optional(),
    focalLength: z.string().nullable().optional(),
    cameraMake: z.string().nullable().optional(),
    cameraModel: z.string().nullable().optional(),
    lens: z.string().nullable().optional(),
    takenAt: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

/** Fujifilm film-simulation recipe (DIG-22), shared with the PATCH route and the parser. */
const recipeSchema = fujiRecipeSchema.nullable().optional();

const createAssetSchema = z.object({
  storageKey: z.string().min(1).max(500),
  originalName: z.string().max(255).optional(),
  mimeType: z.string().max(100).optional(),
  kind: z.enum(["photo", "recipe"]).default("photo"),
  exif: exifSchema,
  recipe: recipeSchema,
  /** The board to add the photo to (DIG-25). Without one, the creator's first board. */
  boardId: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // `?boardId=` narrows the list to one board (DIG-25); ownership still comes from the session.
  const boardId = new URL(req.url).searchParams.get("boardId");
  const assets = await prisma.mediaAsset.findMany({
    where: { ownerId: user.id, ...(boardId ? { boardId } : {}) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ assets });
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createAssetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid asset payload" },
      { status: 400 }
    );
  }

  if (!parsed.data.storageKey.startsWith(`users/${user.id}/`)) {
    return NextResponse.json({ error: "Invalid storage key ownership" }, { status: 403 });
  }

  const driver = getStorageDriver();
  const storageKey = parsed.data.storageKey;
  const publicUrl = driver.getPublicUrl(storageKey);

  // The size comes from storage, never from the client (DIG-32).
  const sizeBytes = await driver.getObjectSize(storageKey);
  if (sizeBytes === null) {
    return NextResponse.json(
      { error: "The upload was not found. Try uploading the photo again." },
      { status: 400 }
    );
  }

  const result = await withUserLock(user.id, async (tx) => {
    const board = parsed.data.boardId
      ? await tx.board.findFirst({ where: { id: parsed.data.boardId, ownerId: user.id }, select: { id: true } })
      : await getOrCreateDefaultBoard(user.id, tx);
    if (!board) return { rejected: "board_not_found", asset: null } as const;

    const check = checkUpload({ size: sizeBytes, usedBytes: await getAccountUsageBytes(user.id, tx) });
    if (!check.ok) return { rejected: check, asset: null } as const;

    const aggregate = await tx.mediaAsset.aggregate({
      where: { boardId: board.id },
      _max: { sortOrder: true },
    });
    const nextSortOrder = (aggregate._max.sortOrder ?? -1) + 1;

    const asset = await tx.mediaAsset.create({
      data: {
        ownerId: user.id,
        boardId: board.id,
        storageKey,
        publicUrl,
        originalName: parsed.data.originalName ?? null,
        mimeType: parsed.data.mimeType ?? "image/jpeg",
        sizeBytes,
        // The worker turns it into AVIF copies and deletes the original (DIG-26).
        status: "processing",
        kind: parsed.data.kind,
        exif: parsed.data.exif ? (parsed.data.exif as Prisma.InputJsonValue) : Prisma.DbNull,
        recipe: parsed.data.recipe
          ? (parsed.data.recipe as Prisma.InputJsonValue)
          : Prisma.DbNull,
        sortOrder: nextSortOrder,
      },
    });
    return { rejected: null, asset } as const;
  });

  if (result.rejected) {
    // Nothing references the bytes, so they would only cost money.
    await driver.deleteObject(storageKey);
    if (result.rejected === "board_not_found") {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }
    return uploadLimitResponse(result.rejected);
  }
  let { asset } = result;

  try {
    await enqueueProcessing(asset.id);
  } catch (error) {
    console.error(`Could not queue processing for ${asset.id}`, error);
    asset = await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { status: "failed", processingError: "Processing could not start. Try again." },
    });
  }

  return NextResponse.json({ asset }, { status: 201 });
}
