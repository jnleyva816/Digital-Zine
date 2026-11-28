import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/JsonLd";
import { UnlockZineForm } from "@/components/zine/UnlockZineForm";
import { ZinePages } from "@/components/zine/ZinePages";
import { profilePath } from "@/lib/handles";
import { getPublicZine, shareDescription, type PublicZine } from "@/lib/public-zine";
import { publicZinePath } from "@/lib/public-zine-path";
import { siteUrl } from "@/lib/site";
import { zineJsonLd } from "@/lib/structured-data";
import { isUnlocked, unlockCookieName } from "@/lib/zine-access";

/** `owner` is the creator's public ID (DIG-102): slugs are only unique per creator. */
type Props = { params: Promise<{ owner: string; slug: string }> };

/** Whether this reader may see the zine: always for a public one, with a valid unlock for a private one (DIG-112). */
async function readerMaySee(zine: PublicZine): Promise<boolean> {
  if (zine.visibility !== "private") return true;
  const jar = await cookies();
  return isUnlocked(jar.get(unlockCookieName(zine.id))?.value, zine.id, zine.accessCodeVersion);
}

const PRIVATE_DESCRIPTION = "A private zine on Folio. Enter the code you were given to read it.";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner, slug } = await params;
  const zine = await getPublicZine(owner, slug);
  if (!zine) notFound();

  // A private zine (DIG-112) gives search engines and link previews nothing: no title, description,
  // or photo, and it is never indexed. Only a reader who unlocked it sees its title in the tab.
  if (zine.visibility === "private") {
    return {
      title: (await readerMaySee(zine)) ? zine.title : "Private zine",
      description: PRIVATE_DESCRIPTION,
      robots: { index: false, follow: false, nocache: true },
      openGraph: { type: "website", siteName: "Folio Digital Zine", title: "Private zine", description: PRIVATE_DESCRIPTION },
      twitter: { card: "summary", title: "Private zine", description: PRIVATE_DESCRIPTION },
    };
  }

  const description = shareDescription({
    description: zine.description,
    ownerName: zine.ownerName,
    pageCount: zine.pages.length,
  });
  const cover = zine.pages[0];
  const images = cover ? [{ url: cover.shareImageUrl, alt: cover.caption || zine.title }] : undefined;
  const url = publicZinePath(zine.owner, zine.slug);

  return {
    title: zine.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: "Folio Digital Zine",
      title: zine.title,
      description,
      url,
      images,
      publishedTime: zine.publishedAt ?? undefined,
      authors: zine.ownerName ? [zine.ownerName] : undefined,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title: zine.title,
      description,
      images: images?.map((i) => i.url),
    },
  };
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

export default async function PublicZinePage({ params }: Props) {
  const { owner, slug } = await params;
  const zine = await getPublicZine(owner, slug);
  if (!zine) notFound();
  if (!(await readerMaySee(zine))) return <PrivateZineGate owner={zine.owner} slug={zine.slug} />;

  const total = zine.pages.length;
  const anyFlip = zine.pages.some((p) => p.flipEnabled);

  return (
    <div className="min-h-screen bg-paper-100">
      {zine.visibility === "public" ? <JsonLd data={zineJsonLd(zine, siteUrl())} /> : null}
      <header className="snap-start border-b border-paper-300 bg-paper-50/80">
        <div className="mx-auto max-w-2xl px-4 py-3 font-mono text-xs uppercase tracking-[0.2em] text-ink-500 sm:px-6">
          Folio · Digital Zine
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <div className="mb-8 sm:mb-10">
          <h1 className="wrap-break-word font-serif text-3xl font-bold leading-tight text-ink-900 sm:text-4xl sm:leading-10">
            {zine.title}
          </h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-500">
            {zine.ownerName || zine.ownerHandle ? (
              <>
                <span className="font-medium text-ink-700">
                  By{" "}
                  {zine.ownerHandle ? (
                    <Link href={profilePath(zine.ownerHandle)} className="underline decoration-paper-300 underline-offset-4 hover:text-ink-900 hover:decoration-ink-500">
                      {zine.ownerName ?? `@${zine.ownerHandle}`}
                    </Link>
                  ) : (
                    zine.ownerName
                  )}
                </span>
                {zine.publishedAt ? <span aria-hidden="true">·</span> : null}
              </>
            ) : null}
            {zine.publishedAt ? (
              <time dateTime={zine.publishedAt}>{dateFormat.format(new Date(zine.publishedAt))}</time>
            ) : null}
            <span aria-hidden="true">·</span>
            <span>
              {total} {total === 1 ? "page" : "pages"}
            </span>
          </p>
          {zine.description ? (
            <p className="mt-4 whitespace-pre-line wrap-break-word font-serif text-lg leading-relaxed text-ink-800">
              {zine.description}
            </p>
          ) : null}
          {anyFlip ? (
            <p className="mt-4 text-sm text-ink-500">Tap a photo, or the label in its corner, to see how it was shot.</p>
          ) : null}
        </div>

        {total === 0 ? (
          <p className="rounded-2xl border border-paper-300 bg-paper-50 p-6 text-center text-sm text-ink-700">
            This zine has no pages to show right now.
          </p>
        ) : (
          <ZinePages
            pages={zine.pages.map((page) => ({
              pageNumber: page.pageNumber,
              imageUrl: page.imageUrl,
              name: page.name,
              edit: page.edit,
              dims: page.dims,
              blurDataUrl: page.blurDataUrl,
              caption: page.caption || undefined,
              flipEnabled: page.flipEnabled,
              kind: page.kind,
              exif: page.exif,
              recipe: page.recipe,
            }))}
          />
        )}
      </main>

      <footer className="border-t border-paper-300 py-6 text-center font-mono text-xs uppercase tracking-[0.2em] text-ink-500">
        Made with Folio
      </footer>
    </div>
  );
}

/** What a reader sees before entering a private zine's code: nothing about the zine itself. */
function PrivateZineGate({ owner, slug }: { owner: string; slug: string }) {
  return (
    <div className="min-h-screen bg-paper-100">
      <header className="border-b border-paper-300 bg-paper-50/80">
        <div className="mx-auto max-w-2xl px-4 py-3 font-mono text-xs uppercase tracking-[0.2em] text-ink-500 sm:px-6">
          Folio · Digital Zine
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 pb-16 pt-12 sm:px-6 sm:pt-20">
        <h1 className="font-serif text-3xl font-bold leading-tight text-ink-900">This zine is private</h1>
        <p className="mt-3 text-sm text-ink-700">Enter the code the creator gave you to read it.</p>
        <UnlockZineForm owner={owner} slug={slug} />
      </main>
      <footer className="border-t border-paper-300 py-6 text-center font-mono text-xs uppercase tracking-[0.2em] text-ink-500">
        Made with Folio
      </footer>
    </div>
  );
}
