import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { checkHandle } from "@/lib/handles";
import { publicZinePath } from "@/lib/public-zine-path";
import { parsePhotoEdit, type PhotoEdit } from "@/lib/photo-edit";
import { parsePageContent } from "@/lib/types";

/** How many zines a profile lists. Paging can come with Discover (DIG-116) if anyone gets near it. */
const PROFILE_ZINE_LIMIT = 200;

export interface ProfileZine {
  title: string;
  description: string | null;
  /** The zine's public address, `/z/<publicId>/<slug>` (decision 0010). */
  path: string;
  /** ISO date. */
  publishedAt: string | null;
  pageCount: number;
  /** The first page's photo, or null while it is processing (it would still carry its EXIF). */
  cover: { imageUrl: string; blurDataUrl: string | null; edit: PhotoEdit | null; dims: { width: number; height: number } | null } | null;
}

export interface PublicProfile {
  handle: string;
  name: string | null;
  bio: string | null;
  zines: ProfileZine[];
}

export type PublicProfileResult = { kind: "redirect"; handle: string } | { kind: "profile"; profile: PublicProfile } | null;

/**
 * A creator's public profile at `/u/<handle>` (DIG-111), built from public fields only: never the
 * email or the account id. An old handle answers with the current one to redirect to. Unknown,
 * invalid, and deactivated creators are null. Only published zines are listed.
 */
export const getPublicProfile = cache(async (input: string): Promise<PublicProfileResult> => {
  const checked = checkHandle(input);
  if (!checked.ok) return null;
  const row = await prisma.userHandle.findUnique({
    where: { handle: checked.handle },
    select: { user: { select: { id: true, publicId: true, handle: true, name: true, bio: true, deactivatedAt: true } } },
  });
  const user = row?.user;
  if (!user || user.deactivatedAt || !user.handle) return null;
  if (user.handle !== checked.handle) return { kind: "redirect", handle: user.handle };

  const zines = await prisma.zine.findMany({
    where: { ownerId: user.id, published: true },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: PROFILE_ZINE_LIMIT,
    select: {
      slug: true,
      title: true,
      description: true,
      publishedAt: true,
      _count: { select: { pages: true } },
      pages: { orderBy: { pageNumber: "asc" }, take: 1, select: { content: true } },
    },
  });
  const coverIds = zines.map((z) => (z.pages[0] ? parsePageContent(z.pages[0].content).assetId : "")).filter(Boolean);
  // Only the creator's own processed photos, as on the zine page itself.
  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: coverIds }, ownerId: user.id, status: "ready" },
    select: { id: true, publicUrl: true, blurDataUrl: true, edit: true, width: true, height: true },
  });
  const byId = new Map(assets.map((a) => [a.id, a]));

  return {
    kind: "profile",
    profile: {
      handle: user.handle,
      name: user.name?.trim() || null,
      bio: user.bio?.trim() || null,
      zines: zines.map((z) => {
        const asset = z.pages[0] ? byId.get(parsePageContent(z.pages[0].content).assetId) : undefined;
        return {
          title: z.title,
          description: z.description?.trim() || null,
          path: publicZinePath(user.publicId, z.slug),
          publishedAt: z.publishedAt?.toISOString() ?? null,
          pageCount: z._count.pages,
          cover: asset
            ? {
                imageUrl: asset.publicUrl,
                blurDataUrl: asset.blurDataUrl,
                edit: parsePhotoEdit(asset.edit),
                dims: asset.width && asset.height ? { width: asset.width, height: asset.height } : null,
              }
            : null,
        };
      }),
    },
  };
});
