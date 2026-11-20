import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** The link in the email. It always points at the configured app URL, never the request host. */
export function verificationLink(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/verify-email?token=${encodeURIComponent(token)}`;
}

/**
 * A new single-use token for the creator (DIG-94). Only its SHA-256 is stored, so a database
 * leak cannot be used to verify accounts. Any older link stops working.
 */
export async function issueVerificationToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { userId } }),
    prisma.emailVerificationToken.create({
      data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS) },
    }),
  ]);
  return token;
}

/**
 * Spends a token and marks the creator's email verified. Null for an unknown, used, or expired
 * token. The delete is the lock: of two simultaneous uses, only one deletes the row.
 */
export async function consumeVerificationToken(token: string) {
  if (!token || token.length > 200) return null;
  const tokenHash = hashToken(token);
  const row = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    await prisma.emailVerificationToken.deleteMany({ where: { id: row.id } });
    return null;
  }
  const spent = await prisma.emailVerificationToken.deleteMany({ where: { id: row.id } });
  if (spent.count !== 1) return null;

  const user = await prisma.user.findUnique({ where: { id: row.userId }, select: { id: true, email: true, name: true, emailVerifiedAt: true } });
  if (!user) return null;
  if (!user.emailVerifiedAt) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  }
  return { id: user.id, email: user.email, name: user.name };
}
