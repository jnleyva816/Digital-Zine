import { notFound, permanentRedirect } from "next/navigation";
import { legacyZineAddress } from "@/lib/zine/legacy-zine-url";
import { publicZinePath } from "@/lib/zine/public-zine-path";

// The answer depends on what is published right now.
export const dynamic = "force-dynamic";

/**
 * `/z/<slug>`, the address zines had before creators were part of it (DIG-102). Links already
 * shared keep working: they redirect for good to `/z/<creator>/<slug>`.
 *
 * The segment is named `owner` because Next requires every dynamic segment at one level to share a
 * name, and `/z/[owner]/[slug]` is the real page. Here, on its own, it is the old slug.
 */
export default async function LegacyZinePage({ params }: { params: Promise<{ owner: string }> }) {
  const { owner: slug } = await params;
  const address = await legacyZineAddress(slug);
  if (!address) notFound();
  permanentRedirect(publicZinePath(address.owner, address.slug));
}
