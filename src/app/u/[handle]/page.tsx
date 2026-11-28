import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { EditedPhoto } from "@/components/EditedPhoto";
import { profilePath } from "@/lib/profile/handles";
import { shareImageUrl } from "@/lib/media/variant-urls";
import { getPublicProfile, type PublicProfile } from "@/lib/profile/public-profile";

/** A creator's public profile (DIG-111, decisions 0007 and 0022). */
type Props = { params: Promise<{ handle: string }> };

/** The profile, a 308 to the current handle for an old one, or a 404. */
async function load(params: Props["params"]): Promise<PublicProfile> {
  const { handle } = await params;
  let decoded: string;
  try {
    decoded = decodeURIComponent(handle);
  } catch {
    notFound(); // A malformed escape, such as /u/%E0.
  }
  const result = await getPublicProfile(decoded);
  if (!result) notFound();
  if (result.kind === "redirect") permanentRedirect(profilePath(result.handle));
  // An address typed in another case, or with an @, settles on the canonical one.
  if (handle !== result.profile.handle) permanentRedirect(profilePath(result.profile.handle));
  return result.profile;
}

const displayName = (p: PublicProfile) => p.name ?? `@${p.handle}`;

function describe(p: PublicProfile): string {
  if (p.bio) return p.bio;
  const count = `${p.zines.length} ${p.zines.length === 1 ? "zine" : "zines"}`;
  return `Photo zines by ${displayName(p)} on Folio · ${count}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await load(params);
  const title = profile.name ? `${profile.name} (@${profile.handle})` : `@${profile.handle}`;
  const description = describe(profile);
  const cover = profile.zines.find((z) => z.cover)?.cover;
  const images = cover ? [{ url: shareImageUrl(cover.imageUrl), alt: `A zine by ${displayName(profile)}` }] : undefined;
  const url = profilePath(profile.handle);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "profile", siteName: "Folio Digital Zine", title, description, url, images, username: profile.handle },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, images: images?.map((i) => i.url) },
  };
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default async function ProfilePage({ params }: Props) {
  const profile = await load(params);

  return (
    <div className="min-h-screen bg-paper-100">
      <header className="border-b border-paper-300 bg-paper-50/80">
        <div className="mx-auto max-w-3xl px-4 py-3 font-mono text-xs uppercase tracking-[0.2em] text-ink-500 sm:px-6">
          Folio · Digital Zine
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <div className="mb-8 sm:mb-10">
          <h1 className="wrap-break-word font-serif text-3xl font-bold leading-tight text-ink-900 sm:text-4xl">{displayName(profile)}</h1>
          {profile.name ? <p className="mt-1 font-mono text-sm text-ink-500">@{profile.handle}</p> : null}
          {profile.bio ? (
            <p className="mt-4 whitespace-pre-line wrap-break-word font-serif text-lg leading-relaxed text-ink-800">{profile.bio}</p>
          ) : null}
        </div>

        <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-ink-500">
          {profile.zines.length} {profile.zines.length === 1 ? "zine" : "zines"}
        </h2>
        {profile.zines.length === 0 ? (
          <p className="rounded-2xl border border-paper-300 bg-paper-50 p-6 text-center text-sm text-ink-700">
            No published zines yet.
          </p>
        ) : (
          <ul aria-label="Zines" className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3">
            {profile.zines.map((zine) => (
              <li key={zine.path}>
                <Link href={zine.path} className="group block focus-visible:outline-2 focus-visible:outline-offset-4">
                  {zine.cover ? (
                    <EditedPhoto
                      src={zine.cover.imageUrl}
                      alt=""
                      edit={zine.cover.edit}
                      dims={zine.cover.dims}
                      blurDataUrl={zine.cover.blurDataUrl}
                      sizes="(min-width: 640px) 240px, 45vw"
                      className="overflow-hidden rounded-lg bg-paper-200 shadow-sm transition group-hover:shadow-md"
                    />
                  ) : (
                    <div aria-hidden="true" className="aspect-4/5 rounded-lg bg-paper-200" />
                  )}
                  <span className="mt-2 block wrap-break-word font-serif text-base font-semibold leading-snug text-ink-900 group-hover:underline">
                    {zine.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-500">
                    {zine.publishedAt ? <time dateTime={zine.publishedAt}>{dateFormat.format(new Date(zine.publishedAt))}</time> : null}
                    {zine.publishedAt ? " · " : null}
                    {zine.pageCount} {zine.pageCount === 1 ? "page" : "pages"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      <footer className="border-t border-paper-300 py-6 text-center font-mono text-xs uppercase tracking-[0.2em] text-ink-500">
        Made with Folio
      </footer>
    </div>
  );
}
