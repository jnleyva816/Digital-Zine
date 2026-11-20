import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type GoogleResolution =
  | { ok: true; userId: string }
  | { ok: false; reason: "unverified_email" | "email_linked_elsewhere" | "invalid_profile" };

/**
 * Turns a Google profile into one of our accounts (DIG-94, owner's rules of 20 Nov).
 * - Google's `sub` is the identity. A known `sub` signs in, even if its email changed.
 * - A new `sub` whose email already has an account links to it, but only when Google says the
 *   email is verified. An unverified email never links and never creates.
 * - An account already linked to a different Google account is never taken over.
 * - Otherwise a verified, password-less Free account is created.
 */
export async function resolveGoogleUser(profile: {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
}): Promise<GoogleResolution> {
  const sub = typeof profile.sub === "string" ? profile.sub.trim() : "";
  const email = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
  if (!sub || !email) return { ok: false, reason: "invalid_profile" };
  if (profile.email_verified !== true) return { ok: false, reason: "unverified_email" };

  try {
    const known = await prisma.user.findUnique({ where: { googleId: sub }, select: { id: true } });
    if (known) return { ok: true, userId: known.id };

    const byEmail = await prisma.user.findUnique({ where: { email }, select: { id: true, googleId: true, emailVerifiedAt: true } });
    if (byEmail) {
      if (byEmail.googleId) return { ok: false, reason: "email_linked_elsewhere" };
      await prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId: sub, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date() },
      });
      return { ok: true, userId: byEmail.id };
    }

    const name = typeof profile.name === "string" && profile.name.trim() ? profile.name.trim().slice(0, 80) : null;
    const created = await prisma.user.create({
      data: { email, name, googleId: sub, emailVerifiedAt: new Date() },
      select: { id: true },
    });
    return { ok: true, userId: created.id };
  } catch (error) {
    // Two first sign-ins at once: the other one made the account. Resolve again to find it.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return resolveGoogleUser(profile);
    }
    throw error;
  }
}
