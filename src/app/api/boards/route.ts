import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { boardNameSchema, listBoards } from "@/lib/boards";
import { boardLimitFor, boardLimitMessage } from "@/lib/limits";
import { withUserLock } from "@/lib/usage";
import { limitRequest } from "@/lib/rate-limit";

const createBoardSchema = z.object({ name: boardNameSchema });

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const boards = await withUserLock(user.id, (tx) => listBoards(user.id, tx));
  return NextResponse.json({ boards });
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest("write", user.id);
  if (limited) return limited;

  const parsed = createBoardSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid board" }, { status: 400 });
  }

  const limit = boardLimitFor(user.tier);
  const board = await withUserLock(user.id, async (tx) => {
    const count = await tx.board.count({ where: { ownerId: user.id } });
    if (limit !== null && count >= limit) return null;
    const { _max } = await tx.board.aggregate({ where: { ownerId: user.id }, _max: { sortOrder: true } });
    return tx.board.create({
      data: { ownerId: user.id, name: parsed.data.name, sortOrder: (_max.sortOrder ?? -1) + 1 },
      select: { id: true, name: true, sortOrder: true },
    });
  });

  if (!board) {
    return NextResponse.json({ error: boardLimitMessage(limit ?? 0), code: "board_limit" }, { status: 403 });
  }
  return NextResponse.json({ board: { ...board, photoCount: 0, zineCount: 0 } }, { status: 201 });
}
