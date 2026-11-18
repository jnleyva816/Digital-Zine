import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { zineLimitFor, zineLimitMessage } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { withUserLock } from "@/lib/usage";
import { slugifyTitle, ZINE_TEMPLATE_ID } from "@/lib/types";

const createZineSchema = z.object({
  title: z.string().min(1).max(140),
  description: z.string().max(400).optional(),
  assetIds: z.array(z.string()).max(60).optional(),
});

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const zines = await prisma.zine.findMany({
    where: { ownerId: user.id },
    include: {
      pages: {
        orderBy: { pageNumber: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ zines });
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createZineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid zine payload" },
      { status: 400 }
    );
  }

  let slug = slugifyTitle(parsed.data.title);
  const collision = await prisma.zine.findUnique({ where: { slug } });
  if (collision) {
    slug = `${slug}-${crypto.randomBytes(2).toString("hex")}`;
  }

  let validAssetIds: string[] = [];
  if (parsed.data.assetIds && parsed.data.assetIds.length > 0) {
    const owned = await prisma.mediaAsset.findMany({
      where: {
        ownerId: user.id,
        id: { in: parsed.data.assetIds },
      },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((a) => a.id));
    validAssetIds = parsed.data.assetIds.filter((id) => ownedSet.has(id));
  } else {
    const defaultBoardAssets = await prisma.mediaAsset.findMany({
      where: { ownerId: user.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 8,
      select: { id: true },
    });
    validAssetIds = defaultBoardAssets.map((a) => a.id);
  }

  const limit = zineLimitFor(user.tier);
  const zine = await withUserLock(user.id, async (tx) => {
    if (limit !== null && (await tx.zine.count({ where: { ownerId: user.id } })) >= limit) return null;
    return tx.zine.create({
    data: {
      ownerId: user.id,
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      slug,
      published: false,
      pages: {
        create: validAssetIds.map((assetId, idx) => ({
          pageNumber: idx + 1,
          templateId: ZINE_TEMPLATE_ID,
          content: {
            assetId,
            caption: "",
          },
          flipEnabled: true,
        })),
      },
    },
    include: {
      pages: {
        orderBy: { pageNumber: "asc" },
      },
    },
    });
  });

  if (!zine) {
    return NextResponse.json({ error: zineLimitMessage(limit ?? 0), code: "zine_limit" }, { status: 403 });
  }

  return NextResponse.json({ zine }, { status: 201 });
}
