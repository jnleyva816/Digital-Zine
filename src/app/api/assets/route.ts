import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { fujiRecipeSchema } from "@/lib/fuji/fuji-recipe";
import { getAuthenticatedUser } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import { isUniqueViolation } from "@/lib/infra/db-errors";
import { BOARD_ORDER, BOARD_PAGE_MAX } from "@/lib/board/board-pages";
import { TRAY_FILTERS, TRAY_SEARCH_MAX, boardPhotoPage, trayCounts, type TrayFilter } from "@/lib/board/board-photos";
import { uploadLimitResponse } from "@/lib/billing/limit-response";
import { checkUpload } from "@/lib/billing/limits";
import { enqueueProcessing } from "@/lib/media/queue";
import { getStorageDriver } from "@/lib/storage";
import { isValidStorageKey, isWellFormedStorageKey } from "@/lib/storage/keys";
import { getAccountUsageBytes, withUserLock } from "@/lib/billing/usage";
import { getOrCreateDefaultBoard } from "@/lib/board/boards";
import { limitRequest } from "@/lib/infra/rate-limit";

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

  const query = new URL(req.url).searchParams;
  // `?ids=` returns just those photos, for checking on ones still processing (DIG-29).
  const ids = query.get("ids");
  if (ids !== null) {
    const wanted = ids.split(",").filter(Boolean).slice(0, BOARD_PAGE_MAX);
    const assets = await prisma.mediaAsset.findMany({ where: { ownerId: user.id, id: { in: wanted } } });
    return NextResponse.json({ assets });
  }

  // `?boardId=` narrows the list to one board (DIG-25); ownership still comes from the session.
  const boardId = query.get("boardId");
  const limitParam = query.get("limit");
  if (limitParam !== null) {
    // One page at a time (DIG-29).
    const limit = Number(limitParam);
    if (!boardId || !Number.isInteger(limit) || limit < 1 || limit > BOARD_PAGE_MAX) {
      return NextResponse.json({ error: `Ask for 1 to ${BOARD_PAGE_MAX} photos of one board.` }, { status: 400 });
    }
    // The tray's search and filters (DIG-88).
    const search = query.get("q") ?? "";
    const show = (query.get("show") ?? "all") as TrayFilter;
    if (search.length > TRAY_SEARCH_MAX || !TRAY_FILTERS.includes(show)) {
      return NextResponse.json({ error: "That search is not supported." }, { status: 400 });
    }
    const [page, counts] = await Promise.all([
      boardPhotoPage(user.id, boardId, limit, query.get("cursor"), { search, show }),
      trayCounts(user.id, boardId),
    ]);
    if (!page) return NextResponse.json({ error: "That page of photos was not found." }, { status: 400 });
    return NextResponse.json({ ...page, counts });
  }

  const assets = await prisma.mediaAsset.findMany({
    where: { ownerId: user.id, ...(boardId ? { boardId } : {}) },
    orderBy: [...BOARD_ORDER],
  });
  return NextResponse.json({ assets });
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await limitRequest("write", user.id);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = createAssetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid asset payload" },
      { status: 400 }
    );
  }

  // Before any storage call: a key like users/<me>/../<them>/… would reach another creator's
  // file, and the rejection path below deletes the upload (DIG-35).
  if (!isWellFormedStorageKey(parsed.data.storageKey)) {
    return NextResponse.json({ error: "Invalid storage key." }, { status: 400 });
  }
  if (!isValidStorageKey(user.id, parsed.data.storageKey)) {
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

  // A retried request can send a key that is already a photo. Answer 409, and never delete the
  // file, which belongs to that photo (DIG-45).
  const duplicate = () => NextResponse.json({ error: "This upload has already been added." }, { status: 409 });
  if (await prisma.mediaAsset.findUnique({ where: { storageKey }, select: { id: true } })) return duplicate();

  let result;
  try {
    result = await withUserLock(user.id, async (tx) => {
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
  } catch (error) {
    // Two requests with the same key at once: the constraint stops the second.
    if (isUniqueViolation(error, "storageKey")) return duplicate();
    throw error;
  }

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
