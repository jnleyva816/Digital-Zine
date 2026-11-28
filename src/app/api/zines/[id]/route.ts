import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePublicZines } from "@/lib/zine/public-zine-cache";
import { pdfSettingsSchema } from "@/lib/pdf/pdf-settings";
import { parsePageContent, slugifyTitle, ZINE_TEMPLATE_ID } from "@/lib/zine/types";
import { isUniqueViolation } from "@/lib/infra/db-errors";
import { limitRequest } from "@/lib/infra/rate-limit";

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
  /** How the zine's PDF looks (DIG-64). */
  pdfSettings: pdfSettingsSchema.optional(),
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
    // The access code's hash never leaves the server (DIG-112).
    omit: { accessCodeHash: true },
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
  const limited = await limitRequest("write", user.id);
  if (limited) return limited;

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
      // Only this creator's other zines can clash: slugs are unique per creator (DIG-102).
      const collision = await prisma.zine.findUnique({
        where: { ownerId_slug: { ownerId: existing.ownerId, slug: nextSlug } },
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

  const { miniPhotos = [], cover } = parsed.data.pdfSettings ?? {};
  if (miniPhotos.length || cover?.photo) {
    // The pages this save leaves the zine with. Those photos are the owner's own, checked below.
    const onPages =
      parsed.data.pages?.map((p) => p.assetId) ??
      (await prisma.zinePage.findMany({ where: { zineId: existing.id }, select: { content: true } })).map((p) => parsePageContent(p.content).assetId);
    if (miniPhotos.some((assetId) => !onPages.includes(assetId))) {
      return NextResponse.json({ error: "The mini zine can only use photos that are on this zine's pages." }, { status: 400 });
    }
    if (cover?.photo && !onPages.includes(cover.photo)) {
      return NextResponse.json({ error: "The cover can only use a photo that is on this zine's pages." }, { status: 400 });
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
      // A zine is built from its own board (DIG-25). Photos already on its pages may have been
      // moved to another board since, and stay; any photo newly added must be on the zine's board
      // (DIG-44).
      const current = await prisma.zinePage.findMany({ where: { zineId: existing.id }, select: { content: true } });
      const alreadyUsed = new Set(current.map((p) => parsePageContent(p.content).assetId).filter(Boolean));
      const added = requestedAssetIds.filter((assetId) => !alreadyUsed.has(assetId));
      if (added.length > 0) {
        const onBoard = await prisma.mediaAsset.count({
          where: { id: { in: added }, ownerId: user.id, boardId: existing.boardId },
        });
        if (onBoard !== added.length) {
          return NextResponse.json({ error: "Only photos on this zine's board can be added to it." }, { status: 400 });
        }
      }
    }
  }

  let updated;
  try {
      updated = await prisma.$transaction(async (tx) => {
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
          ...(parsed.data.pdfSettings !== undefined ? { pdfSettings: parsed.data.pdfSettings } : {}),
          ...(parsed.data.published !== undefined
            ? {
                published: parsed.data.published,
                publishedAt: existing.publishedAt ?? (parsed.data.published ? new Date() : null),
              }
            : {}),
        },
        omit: { accessCodeHash: true },
        include: {
          pages: {
            orderBy: { pageNumber: "asc" },
          },
        },
      });
    });
  } catch (error) {
    // Another zine took the slug after the check above (DIG-45). Nothing was written.
    if (nextSlug !== undefined && isUniqueViolation(error, "slug")) {
      return NextResponse.json({ error: `Slug "${nextSlug}" is already taken.` }, { status: 409 });
    }
    throw error;
  }

  // Readers see the change on their next view, including a 404 right after unpublishing (DIG-27).
  await revalidatePublicZines([
    { owner: user.publicId, slug: existing.slug },
    { owner: user.publicId, slug: updated.slug },
  ]);
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
  const limited = await limitRequest("write", user.id);
  if (limited) return limited;

  const { id } = await context.params;
  const existing = await prisma.zine.findFirst({
    where: { id, ownerId: user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Zine not found" }, { status: 404 });
  }

  await prisma.zine.delete({ where: { id: existing.id } });
  await revalidatePublicZines([{ owner: user.publicId, slug: existing.slug }]);
  return NextResponse.json({ ok: true });
}
