import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/auth";
import { publicZinePath } from "@/lib/public-zine-path";
import { parsePdfSettings } from "@/lib/pdf-settings";
import { prisma } from "@/lib/prisma";
import { BOARD_ASSET_SELECT, boardPhotoPage } from "@/lib/board-photos";
import { BOARD_PAGE_SIZE } from "@/lib/board-pages";
import { StudioHeader } from "@/components/StudioHeader";
import { toBoardAsset } from "@/components/board/types";
import { ZineEditor } from "@/components/editor/ZineEditor";

export const metadata: Metadata = {
  title: "Edit zine",
  robots: { index: false, follow: false },
};

export default async function ZineEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthenticatedUser();
  if (!user) redirect("/signin?callbackUrl=%2Feditor");

  const zine = await prisma.zine.findFirst({
    where: { id, ownerId: user.id },
    include: { pages: { orderBy: { pageNumber: "asc" } }, board: { select: { id: true, name: true } } },
  });
  // The layout already 404s for missing or foreign zines; this covers a delete mid-request.
  if (!zine) notFound();

  const pageAssetIds = zine.pages
    .map((p) => (p.content as { assetId?: unknown } | null)?.assetId)
    .filter((v): v is string => typeof v === "string");
  const [firstPage, pagePhotos, boards] = await Promise.all([
    // The picker loads the board a page at a time (DIG-29).
    boardPhotoPage(user.id, zine.boardId, BOARD_PAGE_SIZE, null),
    // Every photo on the zine's pages, wherever it is: later on the board, or moved to another
    // board (DIG-25).
    prisma.mediaAsset.findMany({
      where: { ownerId: user.id, id: { in: pageAssetIds } },
      select: BOARD_ASSET_SELECT,
    }),
    prisma.board.findMany({
      where: { ownerId: user.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  return (
    <>
      <StudioHeader
        user={{ email: user.email, name: user.name, tier: user.tier, role: user.role, viewingAsFree: user.viewingAsFree }}
        activeZineId={zine.id}
        publishedPath={zine.published ? publicZinePath(user.publicId, zine.slug) : null}
      />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Link href="/editor" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          All zines
        </Link>
        <ZineEditor
          ownerPublicId={user.publicId}
          zine={{
            id: zine.id,
            title: zine.title,
            description: zine.description,
            slug: zine.slug,
            published: zine.published,
            publishedAt: zine.publishedAt?.toISOString() ?? null,
            pages: zine.pages.map((p) => ({ pageNumber: p.pageNumber, flipEnabled: p.flipEnabled, content: p.content })),
          }}
          board={zine.board}
          boards={boards}
          boardAssets={(firstPage?.assets ?? []).map(toBoardAsset)}
          boardCursor={firstPage?.nextCursor ?? null}
          boardTotal={firstPage?.total ?? 0}
          pageAssets={pagePhotos.filter((p) => !firstPage?.assets.some((a) => a.id === p.id)).map(toBoardAsset)}
          tier={user.tier}
          authorName={user.name?.trim() || null}
          pdfSettings={parsePdfSettings(zine.pdfSettings)}
        />
      </main>
    </>
  );
}
