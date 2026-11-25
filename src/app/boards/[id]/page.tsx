import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { publicZinePath } from "@/lib/public-zine-path";
import { prisma } from "@/lib/prisma";
import { StudioHeader } from "@/components/StudioHeader";
import { VisionBoard } from "@/components/board/VisionBoard";
import { toBoardAsset } from "@/components/board/types";
import { listSavedRecipes } from "@/lib/recipes";
import { parseViewPrefs, type Placement } from "@/lib/board-layout";
import { BOARD_ASSET_SELECT, boardPhotoPage } from "@/lib/board-photos";
import { BOARD_PAGE_SIZE } from "@/lib/board-pages";
import { getAccountUsageBytes } from "@/lib/usage";
import { caveat } from "../fonts";

export const metadata: Metadata = {
  title: "Vision Board",
  robots: { index: false, follow: false },
};

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // `layout.tsx` already redirects signed-out visitors; this covers a user deleted mid-session.
  const user = await getAuthenticatedUser();
  if (!user) redirect(`/signin?callbackUrl=${encodeURIComponent(`/boards/${id}`)}`);

  const board = await prisma.board.findFirst({ where: { id, ownerId: user.id }, select: { id: true, name: true, viewPrefs: true } });
  if (!board) notFound();

  const [firstPage, otherBoards, accountBytes, pages, latestZine, savedRecipes, placed, notes] = await Promise.all([
    // The first page only; the board loads more as it scrolls (DIG-29).
    boardPhotoPage(user.id, board.id, BOARD_PAGE_SIZE, null),
    prisma.board.findMany({
      where: { ownerId: user.id, id: { not: board.id } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
    // Storage is one quota for the account, so the meter counts everything stored.
    getAccountUsageBytes(user.id),
    prisma.zinePage.findMany({
      where: { zine: { ownerId: user.id } },
      select: { content: true, zine: { select: { id: true, title: true } } },
    }),
    prisma.zine.findFirst({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true, published: true },
    }),
    listSavedRecipes(prisma, user.id),
    // The free-form layout, with its photos: they may be anywhere in the board's order (DIG-87).
    prisma.boardPlacement.findMany({ where: { boardId: board.id }, include: { asset: { select: BOARD_ASSET_SELECT } } }),
    prisma.boardNote.findMany({ where: { boardId: board.id }, select: { id: true, text: true, x: true, y: true, width: true, rotation: true, z: true } }),
  ]);

  const assets = firstPage?.assets ?? [];
  const onFirstPage = new Set(assets.map((a) => a.id));
  const placements = placed.map(({ assetId, x, y, width, rotation, z, look, tape }): Placement => ({ assetId, x, y, width, rotation, z, look: look === "plain" ? "plain" : "print", tape }));

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
        publishedPath={latestZine?.published ? publicZinePath(user.publicId, latestZine.slug) : null}
      />
      <main className={caveat.variable}>
        <VisionBoard
          key={board.id}
          boardId={board.id}
          boardName={board.name}
          viewPrefs={parseViewPrefs(board.viewPrefs)}
          initialPlacements={placements}
          initialNotes={notes}
          placedAssets={placed.filter((p) => !onFirstPage.has(p.assetId)).map((p) => toBoardAsset(p.asset))}
          initialAssets={assets.map(toBoardAsset)}
          otherBoards={otherBoards}
          otherBoardsBytes={Math.max(0, accountBytes - assets.reduce((sum, a) => sum + a.sizeBytes, 0))}
          initialCursor={firstPage?.nextCursor ?? null}
          initialTotal={firstPage?.total ?? 0}
          usedIn={usedIn}
          savedRecipes={savedRecipes}
        />
      </main>
    </>
  );
}
