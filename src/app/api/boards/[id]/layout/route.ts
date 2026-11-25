import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { layoutChangeSchema } from "@/lib/board-layout";
import { prisma } from "@/lib/prisma";
import { limitRequest } from "@/lib/rate-limit";

type Context = { params: Promise<{ id: string }> };

const spot = { x: true, y: true, width: true, rotation: true, z: true } as const;

/** A board's free-form layout (DIG-85): every placed photo and note, in stacking order. */
export async function GET(_req: Request, context: Context) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const board = await prisma.board.findFirst({
    where: { id, ownerId: user.id },
    select: {
      placements: { orderBy: [{ z: "asc" }, { assetId: "asc" }], select: { assetId: true, ...spot, look: true, tape: true } },
      notes: { orderBy: [{ z: "asc" }, { id: "asc" }], select: { id: true, text: true, ...spot } },
    },
  });
  if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });
  return NextResponse.json(board);
}

class NotOnBoard extends Error {}

/** Saves what one drag, Tidy up, or Scatter changed: all of it, or none of it. */
export async function PUT(req: Request, context: Context) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest("write", user.id);
  if (limited) return limited;

  const { id } = await context.params;
  const board = await prisma.board.findFirst({ where: { id, ownerId: user.id }, select: { id: true } });
  if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

  const parsed = layoutChangeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid layout" }, { status: 400 });
  }
  const { placements, removed, notes } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      if (removed.length > 0) await tx.boardPlacement.deleteMany({ where: { boardId: board.id, assetId: { in: removed } } });

      if (placements.length > 0) {
        // The join is the ownership check: only this owner's photos, on this board, at this moment.
        const saved = await tx.$executeRaw`
          INSERT INTO "BoardPlacement" ("assetId", "boardId", "x", "y", "width", "rotation", "z", "look", "tape")
          SELECT a."id", ${board.id}, p."x", p."y", p."width", p."rotation", p."z", p."look", p."tape"
          FROM jsonb_to_recordset(${JSON.stringify(placements)}::jsonb)
            AS p("assetId" text, "x" float8, "y" float8, "width" float8, "rotation" float8, "z" int, "look" text, "tape" boolean)
          JOIN "MediaAsset" a ON a."id" = p."assetId" AND a."boardId" = ${board.id} AND a."ownerId" = ${user.id}
          ON CONFLICT ("assetId") DO UPDATE SET
            "boardId" = EXCLUDED."boardId", "x" = EXCLUDED."x", "y" = EXCLUDED."y", "width" = EXCLUDED."width",
            "rotation" = EXCLUDED."rotation", "z" = EXCLUDED."z", "look" = EXCLUDED."look", "tape" = EXCLUDED."tape"`;
        if (saved !== placements.length) throw new NotOnBoard();
      }

      if (notes.length > 0) {
        const moved = await tx.$executeRaw`
          UPDATE "BoardNote" n SET "x" = p."x", "y" = p."y", "width" = p."width", "rotation" = p."rotation", "z" = p."z"
          FROM jsonb_to_recordset(${JSON.stringify(notes)}::jsonb)
            AS p("id" text, "x" float8, "y" float8, "width" float8, "rotation" float8, "z" int)
          WHERE n."id" = p."id" AND n."boardId" = ${board.id}`;
        if (moved !== notes.length) throw new NotOnBoard();
      }
    });
  } catch (error) {
    if (error instanceof NotOnBoard) return NextResponse.json({ error: "Something in this layout is no longer on the board." }, { status: 404 });
    throw error;
  }
  return NextResponse.json({ ok: true });
}
