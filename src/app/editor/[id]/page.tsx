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

  const [zine, assets] = await Promise.all([
    prisma.zine.findFirst({
      where: { id, ownerId: user.id },
      include: { pages: { orderBy: { pageNumber: "asc" } } },
    }),
    prisma.mediaAsset.findMany({
      where: { ownerId: user.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, publicUrl: true, originalName: true, kind: true, exif: true, recipe: true },
    }),
  ]);
  // The layout already 404s for missing or foreign zines; this covers a delete mid-request.
  if (!zine) notFound();

  return (
    <>
      <StudioHeader
        user={{ email: user.email, name: user.name, tier: user.tier }}
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
          boardAssets={assets.map(toBoardAsset)}
          tier={user.tier}
        />
      </main>
    </>
  );
}
