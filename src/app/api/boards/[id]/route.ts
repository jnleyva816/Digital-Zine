import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { boardNameSchema } from "@/lib/boards";
import { prisma } from "@/lib/prisma";
import { withUserLock } from "@/lib/usage";
import { limitRequest } from "@/lib/rate-limit";

const renameSchema = z.object({ name: boardNameSchema });
const deleteSchema = z.object({ moveToBoardId: z.string().min(1).optional() }).nullable();

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: Context) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest("write", user.id);
  if (limited) return limited;

  const { id } = await context.params;
  const existing = await prisma.board.findFirst({ where: { id, ownerId: user.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Board not found" }, { status: 404 });

  const parsed = renameSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid board" }, { status: 400 });
  }

  const board = await prisma.board.update({
    where: { id: existing.id },
    data: { name: parsed.data.name },
    select: { id: true, name: true, sortOrder: true },
  });
  return NextResponse.json({ board });
}

type DeleteOutcome = { status: number; body: Record<string, unknown> };

/**
 * Deletes a board (DIG-25). Refused while a zine is built from it, and for the last board. Its
 * photos move to `moveToBoardId`, after that board's own photos.
 */
export async function DELETE(req: Request, context: Context) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest("write", user.id);
  if (limited) return limited;

  const { id } = await context.params;
  const text = await req.text().catch(() => "");
  let raw: unknown = null;
  try {
    raw = text ? JSON.parse(text) : null;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = deleteSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const moveToBoardId = parsed.data?.moveToBoardId;

  // Under the user's lock, so a zine or photo cannot land on the board while it is deleted.
  const outcome = await withUserLock(user.id, async (tx): Promise<DeleteOutcome> => {
    const board = await tx.board.findFirst({ where: { id, ownerId: user.id }, select: { id: true } });
    if (!board) return { status: 404, body: { error: "Board not found" } };

    const zine = await tx.zine.findFirst({
      where: { boardId: board.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true },
    });
    if (zine) {
      return {
        status: 409,
        body: {
          error: `“${zine.title}” is built from this board. Delete that zine or move it to another board first.`,
          zineId: zine.id,
        },
      };
    }

    if ((await tx.board.count({ where: { ownerId: user.id } })) <= 1) {
      return { status: 409, body: { error: "You need at least one board." } };
    }

    const photos = await tx.mediaAsset.findMany({
      where: { boardId: board.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    if (photos.length > 0) {
      if (!moveToBoardId) return { status: 400, body: { error: "Choose a board to move this board's photos to." } };
      if (moveToBoardId === board.id) {
        return { status: 400, body: { error: "Choose a different board to move the photos to." } };
      }
      const target = await tx.board.findFirst({ where: { id: moveToBoardId, ownerId: user.id }, select: { id: true } });
      if (!target) return { status: 404, body: { error: "Board to move the photos to was not found" } };

      const { _max } = await tx.mediaAsset.aggregate({ where: { boardId: target.id }, _max: { sortOrder: true } });
      const start = (_max.sortOrder ?? -1) + 1;
      for (const [i, photo] of photos.entries()) {
        await tx.mediaAsset.update({ where: { id: photo.id }, data: { boardId: target.id, sortOrder: start + i } });
      }
    }

    await tx.board.delete({ where: { id: board.id } });
    return { status: 200, body: { ok: true, movedPhotos: photos.length } };
  });

  return NextResponse.json(outcome.body, { status: outcome.status });
}
