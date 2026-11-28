import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/auth";
import { listBoards } from "@/lib/board/boards";
import { boardLimitFor, boardLimitMessage } from "@/lib/billing/limits";
import { publicZinePath } from "@/lib/zine/public-zine-path";
import { prisma } from "@/lib/prisma";
import { withUserLock } from "@/lib/billing/usage";
import { StudioHeader } from "@/components/StudioHeader";
import { BoardList } from "@/components/boards/BoardList";

export const metadata: Metadata = {
  title: "Your boards",
  robots: { index: false, follow: false },
};

export default async function BoardsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/signin?callbackUrl=%2Fboards");

  const [boards, latestZine] = await Promise.all([
    withUserLock(user.id, (tx) => listBoards(user.id, tx)),
    prisma.zine.findFirst({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true, published: true },
    }),
  ]);
  const limit = boardLimitFor(user.tier);
  const limitReached = limit !== null && boards.length >= limit ? boardLimitMessage(limit) : null;

  return (
    <>
      <StudioHeader
        user={{ email: user.email, name: user.name, tier: user.tier, role: user.role, viewingAsFree: user.viewingAsFree }}
        activeZineId={latestZine?.id ?? null}
        publishedPath={latestZine?.published ? publicZinePath(user.publicId, latestZine.slug) : null}
      />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="font-serif text-3xl font-bold text-ink-900">Your boards</h1>
        <p className="mt-1 text-sm text-ink-500">
          Keep a Vision Board per trip or series. Each zine is built from one board.
        </p>
        <div className="mt-6">
          <BoardList boards={boards} limitReached={limitReached} />
        </div>
      </main>
    </>
  );
}
