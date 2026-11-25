import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** How many accounts one page of the admin user list holds (DIG-136). */
export const ADMIN_PAGE_SIZE = 25;

/** Everything the panel knows about an account. Built by name, so a new column is never sent by accident. */
export interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  role: "user" | "admin";
  /** The billed tier, not an admin's free Pro. */
  tier: "free" | "pro";
  verified: boolean;
  zineCount: number;
  createdAt: string;
}

export interface AdminUserPage {
  users: AdminUser[];
  nextCursor: string | null;
}

type Cursor = { createdAt: Date; id: string };

/** The position after one account. It holds the values, so it works after that account is deleted. */
const writeCursor = (c: Cursor) => `${c.createdAt.toISOString()}_${c.id}`;

export function readCursor(text: string): Cursor | null {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_([A-Za-z0-9-]{1,64})$/.exec(text);
  if (!match) return null;
  const createdAt = new Date(match[1]);
  return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id: match[2] };
}

/** Prisma passes `contains` to ILIKE as it is, so a typed % or _ would match anything. */
const literal = (text: string) => text.replace(/[\\%_]/g, "\\$&");

/** One page of accounts, newest first, whose name or email contains `query`. */
export async function listAdminUsers({ query = "", cursor = null }: { query?: string; cursor?: Cursor | null } = {}): Promise<AdminUserPage> {
  const filters: Prisma.UserWhereInput[] = [];
  const term = query.trim();
  if (term) {
    const contains = { contains: literal(term), mode: "insensitive" } as const;
    filters.push({ OR: [{ email: contains }, { name: contains }] });
  }
  if (cursor) {
    filters.push({ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] });
  }
  const rows = await prisma.user.findMany({
    where: { AND: filters },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ADMIN_PAGE_SIZE + 1,
    select: { id: true, name: true, email: true, role: true, tier: true, emailVerifiedAt: true, createdAt: true, _count: { select: { zines: true } } },
  });
  const page = rows.slice(0, ADMIN_PAGE_SIZE);
  return {
    users: page.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      tier: u.tier,
      verified: u.emailVerifiedAt !== null,
      zineCount: u._count.zines,
      createdAt: u.createdAt.toISOString(),
    })),
    nextCursor: rows.length > ADMIN_PAGE_SIZE ? writeCursor(page[page.length - 1]) : null,
  };
}

export type RoleChange = "ok" | "self" | "forbidden" | "not_found" | "unverified";

/**
 * Gives or removes the admin role, and records it in the same transaction. Nobody changes their own
 * role, and the lock (shared with account deletion) makes the actor's role current, so there is
 * always an admin left: the one who acted.
 */
export async function changeRole(actorId: string, targetId: string, role: "user" | "admin"): Promise<RoleChange> {
  if (actorId === targetId) return "self";
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('dz-last-admin'))`;
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
    if (actor?.role !== "admin") return "forbidden";
    const target = await tx.user.findUnique({ where: { id: targetId }, select: { role: true, emailVerifiedAt: true } });
    if (!target) return "not_found";
    if (target.role === role) return "ok";
    // Whoever signed up with an unproven address may not own it, and may know its password.
    if (role === "admin" && !target.emailVerifiedAt) return "unverified";
    await tx.user.update({ where: { id: targetId }, data: { role } });
    await tx.adminAction.create({ data: { actorId, targetId, action: role === "admin" ? "grant_admin" : "revoke_admin" } });
    return "ok";
  });
}
