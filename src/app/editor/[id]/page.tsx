import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
  const assetSelect = { id: true, publicUrl: true, originalName: true, name: true, kind: true, exif: true, recipe: true } as const;
  const [assets, movedPageAssets, boards] = await Promise.all([
    prisma.mediaAsset.findMany({
      where: { boardId: zine.boardId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: assetSelect,
    }),
    // A page keeps its photo when the photo moves to another board (DIG-25).
    prisma.mediaAsset.findMany({
      where: { ownerId: user.id, id: { in: pageAssetIds }, boardId: { not: zine.boardId } },
      select: assetSelect,
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
        publishedSlug={zine.published ? zine.slug : null}
      />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Link href="/editor" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          All zines
        </Link>
        <ZineEditor
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
          boardAssets={assets.map(toBoardAsset)}
          pageAssets={movedPageAssets.map(toBoardAsset)}
          tier={user.tier}
        />
      </main>
    </>
  );
}
