import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

export interface EnsureAdminResult {
  created: boolean;
  promoted: boolean;
  /** The new password, shown once. Null when an existing password was left alone. */
  password: string | null;
}

/**
 * Creates an admin account, or promotes an existing one (DIG-17). A new account, or `reset: true`,
 * gets a random password that is returned once and stored only as a bcrypt hash.
 */
export async function ensureAdmin(
  db: PrismaClient,
  options: { email: string; name?: string; reset?: boolean }
): Promise<EnsureAdminResult> {
  // Same normalisation as sign-in, so the account can actually sign in.
  const email = options.email.trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) {
    throw new Error(`"${options.email}" is not a valid email address.`);
  }

  const existing = await db.user.findUnique({ where: { email } });
  const password = !existing || options.reset ? randomBytes(24).toString("base64url") : null;
  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

  if (!existing) {
    await db.user.create({
      data: { email, name: options.name?.trim() || "Admin", role: "admin", passwordHash: passwordHash!, emailVerifiedAt: new Date() },
    });
    return { created: true, promoted: true, password };
  }

  await db.user.update({
    where: { id: existing.id },
    data: { role: "admin", ...(passwordHash ? { passwordHash } : {}) },
  });
  return { created: false, promoted: existing.role !== "admin", password };
}
