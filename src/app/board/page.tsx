import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StudioHeader } from "@/components/StudioHeader";
import { VisionBoard } from "@/components/board/VisionBoard";
import { toBoardAsset } from "@/components/board/types";

export const metadata: Metadata = {
  title: "Vision Board",
  robots: { index: false, follow: false },
};

export default async function BoardPage() {
  // `layout.tsx` already redirects signed-out visitors; this covers a user deleted mid-session.
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/signin?callbackUrl=%2Fboard");
  }

  const [assets, latestZine] = await Promise.all([
    prisma.mediaAsset.findMany({
      where: { ownerId: user.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        publicUrl: true,
        originalName: true,
        kind: true,
        exif: true,
        recipe: true,
        sizeBytes: true,
        status: true,
        processingError: true,
        blurDataUrl: true,
      },
    }),
    prisma.zine.findFirst({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true, published: true },
    }),
  ]);

  return (
    <>
      <StudioHeader
        user={{ email: user.email, name: user.name, tier: user.tier, role: user.role, viewingAsFree: user.viewingAsFree }}
        activeZineId={latestZine?.id ?? null}
        publishedSlug={latestZine?.published ? latestZine.slug : null}
      />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="font-serif text-3xl font-bold text-ink-900">Vision Board</h1>
          <p className="mt-1 text-sm text-ink-500">
            Private to you. Collect photos, add recipes, and set the order before you build a zine.
          </p>
        </div>
        <VisionBoard initialAssets={assets.map(toBoardAsset)} />
      </main>
    </>
  );
}
