import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { limitRequest } from "@/lib/rate-limit";

const reorderSchema = z.object({ orderedIds: z.array(z.string().min(1)).min(1).max(500) });

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest("write", user.id);
  if (limited) return limited;

  const parsed = reorderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid reorder payload" }, { status: 400 });

  const owned = new Set(
    (await prisma.board.findMany({ where: { ownerId: user.id }, select: { id: true } })).map((b) => b.id)
  );
  const ids = parsed.data.orderedIds.filter((id) => owned.has(id));

  await prisma.$transaction(ids.map((id, index) => prisma.board.update({ where: { id }, data: { sortOrder: index } })));
  return NextResponse.json({ ok: true });
}
