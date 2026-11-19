import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { limitRequest } from "@/lib/rate-limit";

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await limitRequest("write", user.id);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reorder payload" }, { status: 400 });
  }

  const owned = await prisma.mediaAsset.findMany({
    where: { ownerId: user.id, id: { in: parsed.data.orderedIds } },
    select: { id: true, boardId: true },
  });
  if (owned.length === 0) return NextResponse.json({ ok: true });
  const boards = new Set(owned.map((a) => a.boardId));
  if (boards.size > 1) {
    return NextResponse.json({ error: "Reorder one board at a time." }, { status: 400 });
  }
  const [boardId] = boards;
  const ownedSet = new Set(owned.map((a) => a.id));
  const validIds = parsed.data.orderedIds.filter((id) => ownedSet.has(id));

  // A large board is loaded a page at a time, so the client sends only what it has loaded
  // (DIG-29). Those photos take the first positions in the order sent; the rest of the board
  // keeps its own order after them. One statement renumbers the whole board 0..n-1.
  await prisma.$executeRaw`
    WITH sent AS (
      SELECT id, ord FROM unnest(${validIds}::text[]) WITH ORDINALITY AS s(id, ord)
    ), ranked AS (
      SELECT a.id,
             row_number() OVER (
               ORDER BY (sent.ord IS NULL), sent.ord, a."sortOrder", a."createdAt", a.id
             ) - 1 AS position
      FROM "MediaAsset" a
      LEFT JOIN sent ON sent.id = a.id
      WHERE a."boardId" = ${boardId}
    )
    UPDATE "MediaAsset" m SET "sortOrder" = ranked.position
    FROM ranked
    WHERE m.id = ranked.id AND m."sortOrder" IS DISTINCT FROM ranked.position`;

  return NextResponse.json({ ok: true });
}
