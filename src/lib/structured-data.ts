import { publicZinePath } from "@/lib/public-zine-path";
import { shareDescription, type PublicZine } from "@/lib/public-zine";
import { absoluteUrl } from "@/lib/site";

/**
 * Structured data for search engines (DIG-106). It is built from the same public view readers get,
 * and only from the fields named here, so nothing private (an email, an internal ID, EXIF, GPS,
 * camera settings) can reach it.
 */
export interface ZineJsonLd {
  "@context": "https://schema.org";
  "@type": "ImageGallery";
  name: string;
  description: string;
  url: string;
  datePublished?: string;
  author?: { "@type": "Person"; name: string };
  image?: string;
}

export function zineJsonLd(zine: PublicZine, site: string): ZineJsonLd {
  const env = { NEXT_PUBLIC_APP_URL: site };
  const cover = zine.pages[0];
  const authorName = zine.ownerName?.trim();
  return {
    "@context": "https://schema.org",
    "@type": "ImageGallery",
    name: zine.title,
    description: shareDescription({ description: zine.description, ownerName: zine.ownerName, pageCount: zine.pages.length }),
    url: absoluteUrl(publicZinePath(zine.owner, zine.slug), env),
    ...(zine.publishedAt ? { datePublished: zine.publishedAt } : {}),
    ...(authorName ? { author: { "@type": "Person" as const, name: authorName } } : {}),
    ...(cover ? { image: absoluteUrl(cover.shareImageUrl, env) } : {}),
  };
}

export interface LandingJsonLd {
  "@context": "https://schema.org";
  "@graph": Array<{ "@type": "WebSite" | "Organization"; name: string; url: string; logo?: string }>;
}

/** The product itself: a WebSite and the Organization behind it. No site search is claimed. */
export function landingJsonLd(site: string): LandingJsonLd {
  const env = { NEXT_PUBLIC_APP_URL: site };
  const home = absoluteUrl("/", env);
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", name: "Folio", url: home },
      { "@type": "Organization", name: "Folio", url: home, logo: absoluteUrl("/icon-512.png", env) },
    ],
  };
}

/**
 * JSON for a `<script type="application/ld+json">` block. A creator's title can hold anything, so
 * `<`, `>`, `&`, and the two line separators are written as escapes: the text can never close the
 * tag or open a comment, and parses back to exactly the same data.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
