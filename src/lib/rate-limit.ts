import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Rate limits (DIG-28). Fixed-window counters in Postgres, shared by every app instance.
 * The numbers are the owner's "balanced" choice of 19 Nov 2026; admins get the same limits.
 */
export type RateLimitRule = "signin-email" | "signin-ip" | "upload" | "write" | "pdf";

export const RATE_LIMITS: Record<RateLimitRule, { limit: number; windowSeconds: number }> = {
  /** Failed sign-in tries per email address from one IP (DIG-37). */
  "signin-email": { limit: 5, windowSeconds: 15 * 60 },
  /** Failed sign-in tries per client IP, across all emails. */
  "signin-ip": { limit: 20, windowSeconds: 15 * 60 },
  /** Upload presigns per user. */
  upload: { limit: 300, windowSeconds: 60 * 60 },
  /** Edits, reorders, and creates or deletes of photos, zines, boards, and recipes, per user. */
  write: { limit: 120, windowSeconds: 60 },
  /** PDF exports per user; each one is CPU-heavy. */
  pdf: { limit: 10, windowSeconds: 60 * 60 },
};

export const rateLimitKey = (rule: RateLimitRule, id: string) => `${rule}:${id}`;

export type RateLimitResult = { ok: boolean; retryAfterSeconds: number };

function result(rule: RateLimitRule, count: number, windowStart: Date): RateLimitResult {
  const { limit, windowSeconds } = RATE_LIMITS[rule];
  if (count <= limit) return { ok: true, retryAfterSeconds: 0 };
  const endsAt = windowStart.getTime() + windowSeconds * 1000;
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((endsAt - Date.now()) / 1000)) };
}

/**
 * Counts one request and says whether it is allowed. One atomic upsert: a window that has ended
 * starts again at 1, so concurrent requests are all counted and never both slip through.
 */
export async function consumeRateLimit(rule: RateLimitRule, id: string): Promise<RateLimitResult> {
  const now = new Date();
  const windowEndsBefore = new Date(now.getTime() - RATE_LIMITS[rule].windowSeconds * 1000);
  const [row] = await prisma.$queryRaw<{ count: number; windowStart: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart")
    VALUES (${rateLimitKey(rule, id)}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" <= ${windowEndsBefore} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" <= ${windowEndsBefore} THEN ${now} ELSE "RateLimit"."windowStart" END
    RETURNING "count", "windowStart"`;
  return result(rule, row.count, row.windowStart);
}

/** Whether one more request would be allowed, without counting one. */
export async function peekRateLimit(rule: RateLimitRule, id: string): Promise<RateLimitResult> {
  const row = await prisma.rateLimit.findUnique({ where: { key: rateLimitKey(rule, id) } });
  if (!row || row.windowStart.getTime() + RATE_LIMITS[rule].windowSeconds * 1000 <= Date.now()) {
    return { ok: true, retryAfterSeconds: 0 };
  }
  return result(rule, row.count + 1, row.windowStart);
}

export async function clearRateLimit(rule: RateLimitRule, id: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key: rateLimitKey(rule, id) } });
}

const MESSAGES: Record<RateLimitRule, string> = {
  "signin-email": "Too many sign-in attempts.",
  "signin-ip": "Too many sign-in attempts.",
  upload: "You've reached the limit of 300 uploads an hour.",
  write: "You're making changes too quickly.",
  pdf: "You've reached the limit of 10 PDF exports an hour.",
};

/** "in 45 seconds", "in 1 minute", "in 30 minutes". */
function waitText(seconds: number): string {
  if (seconds < 60) return `in ${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * Counts a request against `rule` for `id`. Returns the 429 response to send when it is over the
 * limit, or null to carry on. The body is `{ error, code: "rate_limited" }`, which the UI shows.
 */
export async function limitRequest(rule: RateLimitRule, id: string): Promise<NextResponse | null> {
  const check = await consumeRateLimit(rule, id);
  if (check.ok) return null;
  return NextResponse.json(
    { error: `${MESSAGES[rule]} Try again ${waitText(check.retryAfterSeconds)}.`, code: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(check.retryAfterSeconds) } }
  );
}
