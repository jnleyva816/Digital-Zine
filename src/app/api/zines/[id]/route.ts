import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePublicZines } from "@/lib/public-zine-cache";
import { slugifyTitle, ZINE_TEMPLATE_ID } from "@/lib/types";

const pageInputSchema = z.object({
  assetId: z.string().min(1),
  caption: z.string().max(400).optional().default(""),
  flipEnabled: z.boolean().default(true),
  templateId: z.literal(ZINE_TEMPLATE_ID).optional().default(ZINE_TEMPLATE_ID),
});

const updateZineSchema = z.object({
  title: z.string().min(1).max(140).optional(),
  description: z.string().max(400).nullable().optional(),
  slug: z.string().min(1).max(80).optional(),
  published: z.boolean().optional(),
  pages: z.array(pageInputSchema).max(60).optional(),
  /** Moves the zine to another board; only while it has no pages (DIG-25). */
  boardId: z.string().min(1).optional(),
});

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const zine = await prisma.zine.findFirst({
    where: { id, ownerId: user.id },
    include: {
      pages: {
        orderBy: { pageNumber: "asc" },
      },
    },
  });

  if (!zine) {
    return NextResponse.json({ error: "Zine not found" }, { status: 404 });
  }

  return NextResponse.json({ zine });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await prisma.zine.findFirst({
    where: { id, ownerId: user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Zine not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateZineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid zine update payload" },
      { status: 400 }
    );
  }

  let nextSlug: string | undefined;
  if (parsed.data.slug !== undefined) {
    nextSlug = slugifyTitle(parsed.data.slug);
    // `publishedAt` records the first publish and is kept through unpublish,
    // so shared links keep working once a zine has ever been public.
    if (nextSlug !== existing.slug && existing.publishedAt) {
      return NextResponse.json(
        { error: "The public URL is locked once a zine has been published." },
        { status: 409 }
      );
    }
    if (nextSlug !== existing.slug) {
      const collision = await prisma.zine.findUnique({
        where: { slug: nextSlug },
      });
      if (collision && collision.id !== existing.id) {
        return NextResponse.json(
          { error: `Slug "${nextSlug}" is already taken.` },
          { status: 409 }
        );
      }
    }
  }

  let nextBoardId: string | undefined;
  if (parsed.data.boardId !== undefined && parsed.data.boardId !== existing.boardId) {
    const target = await prisma.board.findFirst({
      where: { id: parsed.data.boardId, ownerId: user.id },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }
    const pageCount =
      parsed.data.pages !== undefined
        ? parsed.data.pages.length
        : await prisma.zinePage.count({ where: { zineId: existing.id } });
    if (pageCount > 0) {
      return NextResponse.json(
        { error: "A zine's board can only be changed while it has no pages." },
        { status: 409 }
      );
    }
    nextBoardId = target.id;
  }

  if (parsed.data.published === true) {
    const pageCount =
      parsed.data.pages !== undefined
        ? parsed.data.pages.length
        : await prisma.zinePage.count({ where: { zineId: existing.id } });
    if (pageCount === 0) {
      return NextResponse.json(
        { error: "Add at least one page before publishing." },
        { status: 400 }
      );
    }
  }

  if (parsed.data.pages) {
    const requestedAssetIds = [
      ...new Set(parsed.data.pages.map((p) => p.assetId)),
    ];
    if (requestedAssetIds.length > 0) {
      const ownedAssets = await prisma.mediaAsset.findMany({
        where: {
          ownerId: user.id,
          id: { in: requestedAssetIds },
        },
        select: { id: true },
      });
      if (ownedAssets.length !== requestedAssetIds.length) {
        return NextResponse.json(
          { error: "One or more mapped assets do not belong to your Vision Board" },
          { status: 400 }
        );
      }
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (parsed.data.pages !== undefined) {
      await tx.zinePage.deleteMany({
        where: { zineId: existing.id },
      });
      if (parsed.data.pages.length > 0) {
        await tx.zinePage.createMany({
          data: parsed.data.pages.map((page, idx) => ({
            zineId: existing.id,
            pageNumber: idx + 1,
            templateId: ZINE_TEMPLATE_ID,
            content: {
              assetId: page.assetId,
              caption: page.caption ?? "",
            },
            flipEnabled: page.flipEnabled,
          })),
        });
      }
    }

    return tx.zine.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.title !== undefined
          ? { title: parsed.data.title.trim() }
          : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description?.trim() || null }
          : {}),
        ...(nextSlug !== undefined ? { slug: nextSlug } : {}),
        ...(nextBoardId !== undefined ? { boardId: nextBoardId } : {}),
        ...(parsed.data.published !== undefined
          ? {
              published: parsed.data.published,
              publishedAt: existing.publishedAt ?? (parsed.data.published ? new Date() : null),
            }
          : {}),
      },
      include: {
        pages: {
          orderBy: { pageNumber: "asc" },
        },
      },
    });
  });

  // Readers see the change on their next view, including a 404 right after unpublishing (DIG-27).
  await revalidatePublicZines([existing.slug, updated.slug]);
  return NextResponse.json({ zine: updated });
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
  const existing = await prisma.zine.findFirst({
    where: { id, ownerId: user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Zine not found" }, { status: 404 });
  }

  await prisma.zine.delete({ where: { id: existing.id } });
  await revalidatePublicZines([existing.slug]);
  return NextResponse.json({ ok: true });
}
