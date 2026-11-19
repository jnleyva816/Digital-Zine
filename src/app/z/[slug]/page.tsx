import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FlipCard } from "@/components/FlipCard";
import { getPublicZine, shareDescription } from "@/lib/public-zine";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const zine = await getPublicZine(slug);
  if (!zine) notFound();

  const description = shareDescription({
    description: zine.description,
    ownerName: zine.ownerName,
    pageCount: zine.pages.length,
  });
  const cover = zine.pages[0];
  const images = cover ? [{ url: cover.shareImageUrl, alt: cover.caption || zine.title }] : undefined;
  const url = `/z/${zine.slug}`;

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
      publishedTime: zine.publishedAt?.toISOString(),
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
  const { slug } = await params;
  const zine = await getPublicZine(slug);
  if (!zine) notFound();

  const total = zine.pages.length;
  const anyFlip = zine.pages.some((p) => p.flipEnabled);

  return (
    <div className="min-h-screen bg-paper-100">
      <header className="border-b border-paper-300 bg-paper-50/80">
        <div className="mx-auto max-w-2xl px-4 py-3 font-mono text-xs uppercase tracking-[0.2em] text-ink-500 sm:px-6">
          Folio · Digital Zine
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <div className="mb-8 sm:mb-10">
          <h1 className="break-words font-serif text-3xl font-bold leading-tight text-ink-900 sm:text-4xl">
            {zine.title}
          </h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-500">
            {zine.ownerName ? (
              <>
                <span className="font-medium text-ink-700">By {zine.ownerName}</span>
                {zine.publishedAt ? <span aria-hidden="true">·</span> : null}
              </>
            ) : null}
            {zine.publishedAt ? (
              <time dateTime={zine.publishedAt.toISOString()}>{dateFormat.format(zine.publishedAt)}</time>
            ) : null}
            <span aria-hidden="true">·</span>
            <span>
              {total} {total === 1 ? "page" : "pages"}
            </span>
          </p>
          {zine.description ? (
            <p className="mt-4 whitespace-pre-line break-words font-serif text-lg leading-relaxed text-ink-800">
              {zine.description}
            </p>
          ) : null}
          {anyFlip ? (
            <p className="mt-4 text-sm text-ink-500">Tap or press Enter on a card with a Flip label to see its reverse.</p>
          ) : null}
        </div>

        {total === 0 ? (
          <p className="rounded-2xl border border-paper-300 bg-paper-50 p-6 text-center text-sm text-ink-700">
            This zine has no pages to show right now.
          </p>
        ) : (
          <ol aria-label="Pages" className="space-y-8 sm:space-y-12">
            {zine.pages.map((page, i) => (
              <li key={page.pageNumber}>
                <FlipCard
                  pageNumber={page.pageNumber}
                  totalPages={total}
                  imageUrl={page.imageUrl}
                  name={page.name}
                  edit={page.edit}
                  dims={page.dims}
                  blurDataUrl={page.blurDataUrl}
                  caption={page.caption || undefined}
                  flipEnabled={page.flipEnabled}
                  kind={page.kind}
                  exif={page.exif}
                  recipe={page.recipe}
                  priority={i === 0}
                />
              </li>
            ))}
          </ol>
        )}
      </main>

      <footer className="border-t border-paper-300 py-6 text-center font-mono text-xs uppercase tracking-[0.2em] text-ink-500">
        Made with Folio
      </footer>
    </div>
  );
}
