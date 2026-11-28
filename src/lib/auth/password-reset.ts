import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendGoogleSignInReminderEmail, sendPasswordResetEmail } from "@/lib/infra/email";
import { siteUrl } from "@/lib/site/site";

/** A reset link works for one hour (DIG-107). */
export const RESET_TTL_MS = 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** The link in the email. It always points at the configured site, never at the request host. */
export function resetLink(token: string): string {
  return `${siteUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * A new single-use token for the creator. Only its SHA-256 is stored, so a database leak cannot be
 * used to take over accounts. Any older link stops working: a creator has one at a time.
 */
export async function issueResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.create({
      data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    }),
  ]);
  return token;
}

/**
 * What a request for a reset link does once the answer has gone out. It runs after the response,
 * so how long it takes, and whether it happens at all, cannot tell a stranger whether the address
 * has an account. A password account gets a link; a Google-only account is told to sign in with
 * Google; an address with no account gets nothing.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true, googleId: true } });
  if (!user) return;
  if (user.passwordHash) {
    await sendPasswordResetEmail(email, resetLink(await issueResetToken(user.id)));
  } else if (user.googleId) {
    await sendGoogleSignInReminderEmail(email, `${siteUrl()}/signin`);
  }
}

export type ResetResult =
  | { ok: true; email: string }
  /** Unknown, used, and expired links are all this, so the answer never says which. */
  | { ok: false; reason: "invalid_token" }
  | { ok: false; reason: "invalid_password"; message: string };

/**
 * Spends a reset link and sets the new password. The password is checked before the link is
 * spent, so a refused password does not use it up. Spending is one atomic delete: of two
 * simultaneous submissions only one removes the row and wins. The same transaction retires every
 * other link, signs out every earlier session (`sessionsValidAfter`), and marks the email verified,
 * because the link reached the creator's inbox.
 */
export async function resetPassword(token: string, password: string): Promise<ResetResult> {
  if (!token || token.length > 200) return { ok: false, reason: "invalid_token" };

  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row) return { ok: false, reason: "invalid_token" };
  if (row.expiresAt.getTime() <= Date.now()) {
    await prisma.passwordResetToken.deleteMany({ where: { id: row.id } });
    return { ok: false, reason: "invalid_token" };
  }

  const user = await prisma.user.findUnique({ where: { id: row.userId }, select: { id: true, email: true, emailVerifiedAt: true } });
  if (!user) return { ok: false, reason: "invalid_token" };
  if (password.toLowerCase() === user.email) {
    return { ok: false, reason: "invalid_password", message: "Do not use your email as your password." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const spent = await prisma.$transaction(async (tx) => {
    const lock = await tx.passwordResetToken.deleteMany({ where: { id: row.id } });
    if (lock.count !== 1) return false;
    const now = new Date();
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, sessionsValidAfter: now, emailVerifiedAt: user.emailVerifiedAt ?? now },
    });
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await tx.emailVerificationToken.deleteMany({ where: { userId: user.id } });
    return true;
  });
  return spent ? { ok: true, email: user.email } : { ok: false, reason: "invalid_token" };
}
