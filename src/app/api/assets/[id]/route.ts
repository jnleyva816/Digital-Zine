import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { fujiRecipeSchema } from "@/lib/fuji-recipe";
import { getAuthenticatedUser } from "@/lib/auth";
import { PHOTO_NAME_MAX } from "@/lib/limits";
import { readImageSize } from "@/lib/media/variants";
import { isDefaultEdit, photoEditSchema } from "@/lib/photo-edit";
import { getStorageDriver } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

const updateAssetSchema = z.object({
  kind: z.enum(["photo", "recipe"]).optional(),
  recipe: fujiRecipeSchema.nullable().optional(),
  /** The creator's name for the photo (DIG-34). Blank or null clears it. */
  name: z
    .string({ invalid_type_error: "The photo name must be text." })
    .trim()
    .max(PHOTO_NAME_MAX, `Photo names can be up to ${PHOTO_NAME_MAX} characters.`)
    .nullable()
    .optional(),
  /** Crop, frame, and card size (DIG-33). Null, or the defaults, clears the edit. */
  edit: photoEditSchema.nullable().optional(),
  /** Moves the photo to the end of another of the owner's boards (DIG-25). */
  boardId: z.string().min(1).optional(),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await prisma.mediaAsset.findFirst({
    where: { id, ownerId: user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateAssetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid update payload" },
      { status: 400 }
    );
  }

  const data: Prisma.MediaAssetUpdateInput = {};
  if (parsed.data.kind !== undefined) {
    data.kind = parsed.data.kind;
  }
  if (parsed.data.recipe !== undefined) {
    data.recipe = parsed.data.recipe
      ? (parsed.data.recipe as Prisma.InputJsonValue)
      : Prisma.DbNull;
  }

  if (parsed.data.edit !== undefined) {
    const edit = parsed.data.edit;
    data.edit = edit && !isDefaultEdit(edit) ? (edit as Prisma.InputJsonValue) : Prisma.DbNull;
    // Crops need the photo's shape. Photos from before sizes were recorded get it now.
    if (edit && (existing.width === null || existing.height === null)) {
      const bytes = await getStorageDriver().getObject(existing.storageKey);
      const size = bytes ? await readImageSize(bytes) : null;
      if (size) {
        data.width = size.width;
        data.height = size.height;
      }
    }
  }
  if (parsed.data.name !== undefined) {
    data.name = parsed.data.name || null;
  }
  if (parsed.data.boardId !== undefined && parsed.data.boardId !== existing.boardId) {
    const target = await prisma.board.findFirst({
      where: { id: parsed.data.boardId, ownerId: user.id },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }
    const { _max } = await prisma.mediaAsset.aggregate({ where: { boardId: target.id }, _max: { sortOrder: true } });
    data.board = { connect: { id: target.id } };
    data.sortOrder = (_max.sortOrder ?? -1) + 1;
  }

  const asset = await prisma.mediaAsset.update({
    where: { id: existing.id },
    data,
  });

  return NextResponse.json({ asset });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await prisma.mediaAsset.findFirst({
    where: { id, ownerId: user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  // Zine pages reference assets by `content.assetId` (JSON, no foreign key),
  // so refuse to delete a photo that any of this user's zines still uses.
  const usedBy = await prisma.zinePage.findFirst({
    where: {
      zine: { ownerId: user.id },
      content: { path: ["assetId"], equals: existing.id },
    },
    select: { zine: { select: { id: true, title: true } } },
  });
  if (usedBy) {
    return NextResponse.json(
      {
        error: `This photo is used in “${usedBy.zine.title}”. Remove it from that zine before deleting it.`,
        zineId: usedBy.zine.id,
      },
      { status: 409 }
    );
  }

  await prisma.mediaAsset.delete({
    where: { id: existing.id },
  });

  return NextResponse.json({ ok: true });
}
