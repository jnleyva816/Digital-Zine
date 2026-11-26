import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publicZinePath } from "@/lib/public-zine-path";
import { ADMIN_PAGE_SIZE, writeCursor, type Cursor } from "@/lib/admin-users";

type Owner = { id: string; email: string };

/**
 * A private zine as an admin sees it (owner, 25 Nov): that it exists, whose it is, when, and how
 * long. Never its title, slug, description, pages, or photos.
 */
export interface AdminPrivateZine {
  id: string;
  status: "private";
  owner: Owner;
  pageCount: number;
  createdAt: string;
  updatedAt: string;
}

/** A published zine: what readers can already see, plus where. */
export interface AdminPublicZine extends Omit<AdminPrivateZine, "status"> {
  status: "public";
  title: string;
  /** The public address, or null while the owner is deactivated and the page is hidden (DIG-137). */
  path: string | null;
  hidden: boolean;
}

export type AdminZine = AdminPublicZine | AdminPrivateZine;
export type AdminZineFilter = "all" | "public" | "private";

export interface AdminZinePage {
  zines: AdminZine[];
  nextCursor: string | null;
}

/**
 * One page of zines, most recently changed first (DIG-138). The query selects only what the
 * response may hold, and each entry is built field by field, so a private zine's content cannot
 * reach an admin even by accident.
 */
export async function listAdminZines({
  status = "all",
  ownerId = null,
  cursor = null,
}: { status?: AdminZineFilter; ownerId?: string | null; cursor?: Cursor | null } = {}): Promise<AdminZinePage> {
  const filters: Prisma.ZineWhereInput[] = [];
  if (status !== "all") filters.push({ published: status === "public" });
  if (ownerId) filters.push({ ownerId });
  if (cursor) filters.push({ OR: [{ updatedAt: { lt: cursor.at } }, { updatedAt: cursor.at, id: { lt: cursor.id } }] });

  const rows = await prisma.zine.findMany({
    where: { AND: filters },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: ADMIN_PAGE_SIZE + 1,
    select: {
      id: true,
      published: true,
      title: true,
      slug: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: { id: true, email: true, publicId: true, deactivatedAt: true } },
      _count: { select: { pages: true } },
    },
  });
  const page = rows.slice(0, ADMIN_PAGE_SIZE);
  return {
    zines: page.map((z): AdminZine => {
      const base = {
        id: z.id,
        owner: { id: z.owner.id, email: z.owner.email },
        pageCount: z._count.pages,
        createdAt: z.createdAt.toISOString(),
        updatedAt: z.updatedAt.toISOString(),
      };
      if (!z.published) return { ...base, status: "private" };
      const hidden = z.owner.deactivatedAt !== null;
      return { ...base, status: "public", title: z.title, path: hidden ? null : publicZinePath(z.owner.publicId, z.slug), hidden };
    }),
    nextCursor: rows.length > ADMIN_PAGE_SIZE ? writeCursor({ at: page[page.length - 1].updatedAt, id: page[page.length - 1].id }) : null,
  };
}
