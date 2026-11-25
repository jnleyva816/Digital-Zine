/**
 * RFC 9116: where to report a vulnerability (DIG-104). It points at GitHub's private vulnerability
 * reporting rather than an email address, so nobody's inbox is published. `Expires` always sits
 * about six months ahead, so the file never goes stale.
 */
const REPO = "https://github.com/jnleyva816/Digital-Zine";
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

export async function GET() {
  const site = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
  const body = [
    `Contact: ${REPO}/security/advisories/new`,
    `Expires: ${new Date(Date.now() + SIX_MONTHS_MS).toISOString()}`,
    "Preferred-Languages: en",
    `Policy: ${REPO}/security/policy`,
    `Canonical: ${site}/.well-known/security.txt`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
