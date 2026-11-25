import { prisma } from "@/lib/prisma";

/**
 * Signing out every session at once (DIG-107). Sessions are signed tokens, so there is no session
 * table to delete from. Instead each token records when it began (`authAt`), the account records the
 * moment its sessions stopped being valid (`sessionsValidAfter`, set by a password reset), and every
 * check compares the two.
 */

/**
 * Whether a session that began at `authAt` is signed out by a reset at `validAfter`. With no reset,
 * nothing is revoked. After one, a token with no usable start time is revoked too: it began before
 * this check existed, so it began before the reset.
 */
export function isSessionRevoked(authAt: unknown, validAfter: Date | null): boolean {
  if (!validAfter) return false;
  if (typeof authAt !== "number" || !Number.isFinite(authAt)) return true;
  return authAt < validAfter.getTime();
}

/** Stamps a token that has just signed in, whichever way (password, email link, or Google). */
export function markSignedIn<T extends object>(token: T): T & { authAt: number } {
  return Object.assign(token, { authAt: Date.now() });
}

/**
 * The token if its session is still good, or null to end it: the account is gone, or a password
 * reset happened after the session began. A token with no account is returned for the caller to
 * deal with.
 */
export async function checkSessionToken<T extends { sub?: string; authAt?: unknown }>(token: T): Promise<T | null> {
  if (!token.sub) return token;
  const account = await prisma.user.findUnique({ where: { id: token.sub }, select: { sessionsValidAfter: true } });
  if (!account) return null;
  return isSessionRevoked(token.authAt, account.sessionsValidAfter) ? null : token;
}
