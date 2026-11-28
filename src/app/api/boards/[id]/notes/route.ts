import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/auth";
import { MAX_BOARD_NOTES, noteSchema } from "@/lib/board/board-layout";
import { limitRequest } from "@/lib/infra/rate-limit";
import { withUserLock } from "@/lib/billing/usage";

/** Adds a sticky note to a board (DIG-85). */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest("write", user.id);
  if (limited) return limited;

  const { id } = await context.params;
  const parsed = noteSchema.safeParse(await req.json().catch(() => null));

  // Under the user's lock, so two requests cannot both take the last place.
  return withUserLock(user.id, async (tx) => {
    const board = await tx.board.findFirst({ where: { id, ownerId: user.id }, select: { id: true } });
    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid note" }, { status: 400 });
    }
    if ((await tx.boardNote.count({ where: { boardId: board.id } })) >= MAX_BOARD_NOTES) {
      return NextResponse.json({ error: `A board can hold ${MAX_BOARD_NOTES} notes.` }, { status: 409 });
    }
    const note = await tx.boardNote.create({
      data: { boardId: board.id, ...parsed.data },
      select: { id: true, text: true, x: true, y: true, width: true, rotation: true, z: true },
    });
    return NextResponse.json({ note }, { status: 201 });
  });
}
