import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, cspHeaderName, cspMode } from "@/lib/csp";
import { checkSameOrigin } from "@/lib/request-origin";
import { SECURITY_HEADERS } from "@/lib/security-headers";

/**
 * Every request passes here (DIG-104): state-changing ones get the Origin check, and every response
 * gets the security headers and a Content Security Policy with a fresh nonce. Next reads the nonce
 * from the request's CSP header and tags its own scripts with it.
 */
export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // The Stripe webhook is signed instead, and the CSP report is sent by the browser on its own terms.
  const exempt = path === "/api/billing/webhook" || path === "/api/csp-report";
  if (!exempt) {
    const check = checkSameOrigin({
      method: req.method,
      origin: req.headers.get("origin"),
      secFetchSite: req.headers.get("sec-fetch-site"),
      host: req.headers.get("host"),
      forwardedHost: req.headers.get("x-forwarded-host"),
    });
    if (!check.ok) {
      console.warn(`Cross-site request refused: ${req.method} ${path} (${check.reason})`);
      const refused = NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
      for (const { key, value } of SECURITY_HEADERS) refused.headers.set(key, value);
      return refused;
    }
  }

  const nonce = btoa(crypto.randomUUID());
  const policy = buildCsp({ nonce, env: process.env });
  const headerName = cspHeaderName(cspMode(process.env));

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(headerName, policy);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set(headerName, policy);
  for (const { key, value } of SECURITY_HEADERS) res.headers.set(key, value);
  return res;
}

export const config = {
  // Everything except Next's own static files and image optimizer, which are public and cannot carry a nonce.
  matcher: [{ source: "/((?!_next/static|_next/image).*)" }],
};
