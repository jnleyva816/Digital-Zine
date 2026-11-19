import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StudioHeader } from "@/components/StudioHeader";
import { VisionBoard } from "@/components/board/VisionBoard";
import { toBoardAsset } from "@/components/board/types";

export const metadata: Metadata = {
  title: "Vision Board",
  robots: { index: false, follow: false },
};

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // `layout.tsx` already redirects signed-out visitors; this covers a user deleted mid-session.
  const user = await getAuthenticatedUser();
  if (!user) redirect(`/signin?callbackUrl=${encodeURIComponent(`/boards/${id}`)}`);

  const board = await prisma.board.findFirst({ where: { id, ownerId: user.id }, select: { id: true, name: true } });
  if (!board) notFound();

  const [assets, otherBoards, elsewhere, pages, latestZine] = await Promise.all([
    prisma.mediaAsset.findMany({
      where: { boardId: board.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        publicUrl: true,
        originalName: true,
        name: true,
        kind: true,
        exif: true,
        recipe: true,
        sizeBytes: true,
        status: true,
        processingError: true,
        blurDataUrl: true,
      },
    }),
    prisma.board.findMany({
      where: { ownerId: user.id, id: { not: board.id } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
    // Storage is one quota for the account, so the meter counts the other boards too.
    prisma.mediaAsset.aggregate({
      where: { ownerId: user.id, boardId: { not: board.id } },
      _sum: { sizeBytes: true },
    }),
    prisma.zinePage.findMany({
      where: { zine: { ownerId: user.id } },
      select: { content: true, zine: { select: { id: true, title: true } } },
    }),
    prisma.zine.findFirst({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true, published: true },
    }),
  ]);

  // Which zines use each photo, so moving one can say so first.
  const usedIn: Record<string, string[]> = {};
  const seen = new Set<string>();
  for (const page of pages) {
    const assetId = (page.content as { assetId?: unknown } | null)?.assetId;
    if (typeof assetId !== "string" || seen.has(`${assetId}:${page.zine.id}`)) continue;
    seen.add(`${assetId}:${page.zine.id}`);
    (usedIn[assetId] ??= []).push(page.zine.title);
  }

  return (
    <>
      <StudioHeader
        user={{ email: user.email, name: user.name, tier: user.tier, role: user.role, viewingAsFree: user.viewingAsFree }}
        activeZineId={latestZine?.id ?? null}
        publishedSlug={latestZine?.published ? latestZine.slug : null}
      />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Link href="/boards" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          All boards
        </Link>
        <div className="mb-6">
          <h1 className="font-serif text-3xl font-bold text-ink-900">{board.name}</h1>
          <p className="mt-1 text-sm text-ink-500">
            Private to you. Collect photos, add recipes, and set the order before you build a zine.
          </p>
        </div>
        <VisionBoard
          key={board.id}
          boardId={board.id}
          initialAssets={assets.map(toBoardAsset)}
          otherBoards={otherBoards}
          otherBoardsBytes={elsewhere._sum.sizeBytes ?? 0}
          usedIn={usedIn}
        />
      </main>
    </>
  );
}
