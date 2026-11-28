import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/auth";
import { notePatchSchema } from "@/lib/board/board-layout";
import { prisma } from "@/lib/prisma";
import { limitRequest } from "@/lib/infra/rate-limit";

type Context = { params: Promise<{ id: string; noteId: string }> };

/** The note, only through its own board and only for that board's owner. */
async function ownNote(userId: string, context: Context) {
  const { id, noteId } = await context.params;
  return prisma.boardNote.findFirst({ where: { id: noteId, boardId: id, board: { ownerId: userId } }, select: { id: true } });
}

/** Changes a note's text (DIG-85). Its position is saved with the layout. */
export async function PATCH(req: Request, context: Context) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest("write", user.id);
  if (limited) return limited;

  const note = await ownNote(user.id, context);
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  const parsed = notePatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid note" }, { status: 400 });
  }
  await prisma.boardNote.updateMany({ where: { id: note.id }, data: { text: parsed.data.text } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, context: Context) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest("write", user.id);
  if (limited) return limited;

  const note = await ownNote(user.id, context);
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  await prisma.boardNote.deleteMany({ where: { id: note.id } });
  return NextResponse.json({ ok: true });
}
