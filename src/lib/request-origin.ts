/**
 * One rule for "did this state-changing request come from our own pages?" (DIG-104). A forged
 * cross-site request carries the attacker's site in `Origin` (or `Sec-Fetch-Site: cross-site`),
 * which a page cannot fake. Pure, so the middleware and the tests share it.
 */
export interface OriginCheckInput {
  method: string;
  origin?: string | null;
  secFetchSite?: string | null;
  /** The `Host` header. */
  host?: string | null;
  /** `X-Forwarded-Host`, set by a proxy; the host the browser used. May hold a list. */
  forwardedHost?: string | null;
  /** Extra origins to trust, written exactly like `https://preview.example.com`. */
  allowedOrigins?: string[];
}

export type OriginCheck = { ok: true } | { ok: false; reason: string };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function checkSameOrigin(input: OriginCheckInput): OriginCheck {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return { ok: true };

  const origin = input.origin?.trim();
  if (origin) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      return { ok: false, reason: `Origin "${origin.slice(0, 80)}" is not a valid origin` };
    }
    if (url.origin === "null") return { ok: false, reason: "Origin is opaque (null)" };

    // The host the browser used: the proxy's word for it when there is one, else the Host header.
    const browserHost = (input.forwardedHost?.split(",")[0].trim() || input.host?.trim() || "").toLowerCase();
    if (browserHost && url.host.toLowerCase() === browserHost) return { ok: true };
    if (input.allowedOrigins?.includes(url.origin)) return { ok: true };
    return { ok: false, reason: `Origin ${url.origin} is not this site` };
  }

  const site = input.secFetchSite?.trim().toLowerCase();
  if (site) {
    if (site === "same-origin" || site === "none") return { ok: true };
    return { ok: false, reason: `Sec-Fetch-Site is ${site}` };
  }

  // Neither header: not a browser, and only a browser can be tricked into sending a cookie.
  return { ok: true };
}
