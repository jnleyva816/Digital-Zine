import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePublicZines } from "@/lib/public-zine-cache";
import { limitRequest } from "@/lib/rate-limit";
import { accessCodeProblem, hashAccessCode } from "@/lib/zine-access";

const accessSchema = z.object({
  visibility: z.enum(["public", "private"]),
  /** A new code. Leave it out to keep a private zine's current one. */
  code: z.string().max(512).optional(),
});

/**
 * Who can read a zine (DIG-112). Private needs a code, stored only as a hash. A new code, or turning
 * a zine private, bumps `accessCodeVersion`, which ends every reader's earlier unlock. Making a
 * zine public forgets its code. The response says whether a code is set, never the code or hash.
 */
export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest("write", user.id);
  if (limited) return limited;

  const { id } = await context.params;
  const existing = await prisma.zine.findFirst({
    where: { id, ownerId: user.id },
    select: { id: true, slug: true, visibility: true, accessCodeHash: true },
  });
  if (!existing) return NextResponse.json({ error: "Zine not found" }, { status: 404 });

  const parsed = accessSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose public or private." }, { status: 400 });
  }
  const { visibility, code } = parsed.data;

  let data: { visibility: "public" | "private"; accessCodeHash?: string | null; accessCodeVersion?: { increment: number } };
  if (visibility === "public") {
    data = { visibility, accessCodeHash: null };
  } else if (code !== undefined) {
    const problem = accessCodeProblem(code);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    data = { visibility, accessCodeHash: await hashAccessCode(code), accessCodeVersion: { increment: 1 } };
  } else if (existing.visibility === "private" && existing.accessCodeHash) {
    data = { visibility };
  } else {
    return NextResponse.json({ error: "Set a code for readers to enter." }, { status: 400 });
  }

  const updated = await prisma.zine.update({
    where: { id: existing.id },
    data,
    select: { visibility: true, accessCodeHash: true },
  });
  // Readers see the change on their next view: a locked page, or an open one (DIG-27).
  await revalidatePublicZines([{ owner: user.publicId, slug: existing.slug }]);
  return NextResponse.json({ visibility: updated.visibility, hasAccessCode: updated.accessCodeHash !== null });
}
