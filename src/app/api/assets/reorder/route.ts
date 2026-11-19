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
    where: { ownerId: user.id },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((a) => a.id));

  const validIds = parsed.data.orderedIds.filter((id) => ownedSet.has(id));

  await prisma.$transaction(
    validIds.map((id, index) =>
      prisma.mediaAsset.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
