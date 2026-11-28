import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { ACCESS_CODE_MAX, ACCESS_CODE_MIN } from "./zine-access-rules";

export { ACCESS_CODE_MAX, ACCESS_CODE_MIN };

/**
 * Private zines (DIG-112). A private zine is published, but its page opens only for a reader who
 * enters the creator's access code. Only a bcrypt hash of the code is stored. A right code gives
 * the reader a signed cookie for that one zine, tied to `Zine.accessCodeVersion`, so changing the
 * code (which bumps the version) ends every earlier unlock.
 */

/** bcrypt compares only the first 72 bytes; a longer code would be partly ignored. */
const BCRYPT_MAX_BYTES = 72;
const BCRYPT_COST = 12;

/** How long an unlock lasts, unless the code changes first (owner's choice, 26 Nov 2026). */
export const UNLOCK_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Why `code` cannot be an access code, or null when it can. Spaces around it do not count. */
export function accessCodeProblem(code: string): string | null {
  const trimmed = code.trim();
  if (trimmed.length < ACCESS_CODE_MIN) return `The code needs at least ${ACCESS_CODE_MIN} characters.`;
  if (trimmed.length > ACCESS_CODE_MAX || Buffer.byteLength(trimmed, "utf8") > BCRYPT_MAX_BYTES) {
    return `The code can be at most ${ACCESS_CODE_MAX} characters.`;
  }
  return null;
}

export async function hashAccessCode(code: string): Promise<string> {
  return bcrypt.hash(code.trim(), BCRYPT_COST);
}

export async function checkAccessCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code.trim(), hash);
}

/** One cookie per zine. The zine ID is a cuid, safe in a cookie name. */
export function unlockCookieName(zineId: string): string {
  return `folio_unlock_${zineId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

function secret(): string {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value) throw new Error("AUTH_SECRET is not set; private zines cannot be unlocked.");
  return value;
}

function mac(zineId: string, version: number, expires: number): Buffer {
  return createHmac("sha256", secret()).update(`zine-unlock:${zineId}:${version}:${expires}`).digest();
}

/** The cookie value: `<version>.<expires, unix seconds>.<HMAC, base64url>`. */
export function signUnlock(zineId: string, version: number, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + UNLOCK_MAX_AGE_SECONDS;
  return `${version}.${expires}.${mac(zineId, version, expires).toString("base64url")}`;
}

/** Whether `token` unlocks `zineId` at its current code `version`. */
export function isUnlocked(token: string | undefined, zineId: string, version: number, now = Date.now()): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [versionText, expiresText, given] = parts;
  if (!/^\d+$/.test(versionText) || !/^\d+$/.test(expiresText)) return false;
  const tokenVersion = Number(versionText);
  const expires = Number(expiresText);
  if (tokenVersion !== version || expires * 1000 <= now) return false;
  const expected = mac(zineId, tokenVersion, expires);
  const actual = Buffer.from(given, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
