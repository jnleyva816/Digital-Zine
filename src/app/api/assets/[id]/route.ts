import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateAssetSchema = z.object({
  kind: z.enum(["photo", "recipe"]).optional(),
  recipe: z
    .object({
      title: z.string().max(160).optional(),
      servings: z.string().max(80).optional(),
      prepTime: z.string().max(80).optional(),
      ingredients: z.array(z.string().max(300)).max(50).optional(),
      method: z.array(z.string().max(800)).max(40).optional(),
    })
    .nullable()
    .optional(),
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
