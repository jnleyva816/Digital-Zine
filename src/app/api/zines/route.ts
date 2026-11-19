import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { zineLimitFor, zineLimitMessage } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { withUserLock } from "@/lib/usage";
import { getOrCreateDefaultBoard } from "@/lib/boards";
import { revalidatePublicZines } from "@/lib/public-zine-cache";
import { slugifyTitle, ZINE_TEMPLATE_ID } from "@/lib/types";
import { limitRequest } from "@/lib/rate-limit";

const createZineSchema = z.object({
  title: z.string().min(1).max(140),
  description: z.string().max(400).optional(),
  assetIds: z.array(z.string()).max(60).optional(),
  /** The board the zine is built from (DIG-25). Without one, the creator's first board. */
  boardId: z.string().min(1).optional(),
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
  const limited = await limitRequest("write", user.id);
  if (limited) return limited;

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

  const limit = zineLimitFor(user.tier);
  const result = await withUserLock(user.id, async (tx) => {
    const board = parsed.data.boardId
      ? await tx.board.findFirst({ where: { id: parsed.data.boardId, ownerId: user.id }, select: { id: true } })
      : await getOrCreateDefaultBoard(user.id, tx);
    if (!board) return "board_not_found" as const;
    if (limit !== null && (await tx.zine.count({ where: { ownerId: user.id } })) >= limit) return null;

    // Pages come only from the zine's own board.
    let validAssetIds: string[];
    if (parsed.data.assetIds && parsed.data.assetIds.length > 0) {
      const onBoard = await tx.mediaAsset.findMany({
        where: { ownerId: user.id, boardId: board.id, id: { in: parsed.data.assetIds } },
        select: { id: true },
      });
      const onBoardSet = new Set(onBoard.map((a) => a.id));
      validAssetIds = parsed.data.assetIds.filter((id) => onBoardSet.has(id));
    } else {
      const firstPhotos = await tx.mediaAsset.findMany({
        where: { boardId: board.id },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: 8,
        select: { id: true },
      });
      validAssetIds = firstPhotos.map((a) => a.id);
    }

    return tx.zine.create({
      data: {
        ownerId: user.id,
        boardId: board.id,
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

  if (result === "board_not_found") {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }
  const zine = result;

  if (!zine) {
    return NextResponse.json({ error: zineLimitMessage(limit ?? 0), code: "zine_limit" }, { status: 403 });
  }

  // A 404 may be cached at this address from before the zine existed (DIG-27).
  await revalidatePublicZines([zine.slug]);
  return NextResponse.json({ zine }, { status: 201 });
}
