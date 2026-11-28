type Env = Record<string, string | undefined>;

/**
 * Where the site lives (DIG-106), without a trailing slash. Robots, the sitemap, and structured data
 * all build their absolute addresses from this, so they cannot disagree.
 */
export function siteUrl(env: Env = process.env): string {
  return (env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}

/** A path on the site as a full address. An address that is already full, such as a CDN photo, is kept. */
export function absoluteUrl(pathOrUrl: string, env: Env = process.env): string {
  return /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${siteUrl(env)}${pathOrUrl}`;
}
