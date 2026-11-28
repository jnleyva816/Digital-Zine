import * as Sentry from "@sentry/nextjs";
import { limitRequest } from "@/lib/infra/rate-limit";
import { clientIp } from "@/lib/auth/sign-in";

/** More than a real browser ever sends in one report. */
const MAX_BODY_BYTES = 8 * 1024;
const MAX_REPORTS = 10;
const MAX_FIELD = 200;

interface Violation {
  document: string;
  directive: string;
  blocked: string;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * A URL with its query and fragment cut off, and a cap on its length (DIG-104). A page's address can
 * carry a one-time token (`/verify-email?token=...`), and that must never reach a log or Sentry.
 * Keywords like "inline" and "eval" pass through unchanged.
 */
function clean(value: string): string {
  let out = value;
  try {
    const url = new URL(value);
    out = `${url.origin}${url.pathname}`;
  } catch {
    out = value.split(/[?#]/)[0];
  }
  return out.slice(0, MAX_FIELD);
}

/** Reads both report formats: the classic `{ "csp-report": {...} }` and the Reporting API's list. */
function violationsIn(body: unknown): Violation[] {
  const found: Violation[] = [];
  if (Array.isArray(body)) {
    for (const item of body) {
      if (item && typeof item === "object" && (item as { type?: unknown }).type === "csp-violation") {
        const b = ((item as { body?: unknown }).body ?? {}) as Record<string, unknown>;
        found.push({
          document: clean(text(b.documentURL)),
          directive: text(b.effectiveDirective || b.violatedDirective).split(/\s+/)[0].slice(0, MAX_FIELD),
          blocked: clean(text(b.blockedURL)),
        });
      }
    }
  } else if (body && typeof body === "object") {
    const r = (body as { "csp-report"?: unknown })["csp-report"];
    if (r && typeof r === "object") {
      const b = r as Record<string, unknown>;
      found.push({
        document: clean(text(b["document-uri"])),
        directive: text(b["effective-directive"] || b["violated-directive"]).split(/\s+/)[0].slice(0, MAX_FIELD),
        blocked: clean(text(b["blocked-uri"])),
      });
    }
  }
  return found.filter((v) => v.directive).slice(0, MAX_REPORTS);
}

/**
 * Where browsers report what the Content Security Policy blocked (DIG-104). It logs one short line
 * per violation and sends it to Sentry as a warning. Anyone can call it, so it is rate limited, caps
 * the body, never reflects it, and always answers 204.
 */
export async function POST(req: Request) {
  const limited = await limitRequest("csp-report", clientIp(req));
  if (limited) return limited;

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 204 });
  }

  for (const v of violationsIn(body)) {
    const line = `CSP violation: ${v.directive} blocked ${v.blocked || "(unknown)"} on ${v.document || "(unknown)"}`;
    console.warn(line);
    Sentry.captureMessage(line, { level: "warning", tags: { csp_directive: v.directive } });
  }
  return new Response(null, { status: 204 });
}
