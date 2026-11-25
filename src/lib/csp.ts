/**
 * The Content Security Policy (DIG-104), as a pure function of the request's nonce and the
 * environment, so it can be tested without a server and used from the middleware.
 *
 * What it allows is exactly what the app uses: its own scripts (each tagged with the request's
 * nonce, and anything those load), styles, fonts, and images from this site, from the photo
 * storage, and from data and blob URLs; connections to this site, to storage for uploads, and to
 * Sentry; and forms and redirects to Google sign-in and Stripe. Nothing is wildcarded.
 */
export type CspMode = "report-only" | "enforce";
type Env = Record<string, string | undefined>;

/** A nonce goes into a header, so it must not be able to carry a quote, a semicolon, or a space. */
const NONCE_PATTERN = /^[A-Za-z0-9+/=_-]{16,}$/;

/** The policy only reports, unless CSP_MODE is "enforce". Reporting first shows what would break (DIG-104). */
export function cspMode(env: Env): CspMode {
  return (env.CSP_MODE ?? "").trim().toLowerCase() === "enforce" ? "enforce" : "report-only";
}

export function cspHeaderName(mode: CspMode): string {
  return mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
}

/** The origin of a configured URL, or null when it is missing, not a URL, or plain http in production. */
function originOf(value: string | undefined, production: boolean): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol === "https:" || (url.protocol === "http:" && !production)) return url.origin;
  } catch {
    // Not a URL: leave it out.
  }
  return null;
}

/** Where a browser uploads a photo: the S3-compatible endpoint, or AWS's own address for the bucket. */
function storageOrigin(env: Env, production: boolean): string | null {
  const endpoint = originOf(env.AWS_S3_ENDPOINT, production);
  if (endpoint) return endpoint;
  if (env.AWS_S3_BUCKET?.trim() && env.AWS_REGION?.trim()) {
    return originOf(`https://${env.AWS_S3_BUCKET.trim()}.s3.${env.AWS_REGION.trim()}.amazonaws.com`, production);
  }
  return null;
}

const unique = (values: (string | null)[]): string[] => [...new Set(values.filter((v): v is string => Boolean(v)))];

export function buildCsp({ nonce, env }: { nonce: string; env: Env }): string {
  if (!NONCE_PATTERN.test(nonce)) throw new Error("The CSP nonce must be at least 16 characters of base64 or URL-safe text.");
  const production = env.NODE_ENV === "production";

  const images = unique([
    "'self'",
    "data:",
    "blob:",
    originOf(env.AWS_S3_PUBLIC_URL, production),
    originOf(env.NEXT_PUBLIC_IMAGE_CDN_URL, production),
  ]);
  const connections = unique([
    "'self'",
    storageOrigin(env, production),
    originOf(env.NEXT_PUBLIC_SENTRY_DSN || env.SENTRY_DSN, production),
  ]);

  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    // strict-dynamic: scripts the nonce-tagged ones load are trusted too, so Next's chunks work.
    // Next's development tooling needs eval; production never does.
    ["script-src", unique(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", production ? null : "'unsafe-eval'"])],
    // React sets style attributes on many elements, which only 'unsafe-inline' allows. Styles cannot run code.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", images],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", connections],
    ["media-src", ["'self'"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'", "https://accounts.google.com", "https://checkout.stripe.com", "https://billing.stripe.com"]],
    ["frame-ancestors", ["'none'"]],
    ["frame-src", ["'none'"]],
    ["report-uri", ["/api/csp-report"]],
  ];

  const parts = directives.map(([name, sources]) => `${name} ${sources.join(" ")}`);
  if (production) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}
