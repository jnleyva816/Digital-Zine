import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { listAdminUsers, readCursor } from "@/lib/admin-users";
import { limitRequest } from "@/lib/rate-limit";

const MAX_QUERY = 200;

/** Admin-only: a page of accounts, searched by name or email (DIG-136). */
export async function GET(req: Request) {
  const { admin, denied } = await requireAdmin();
  if (denied) return denied;
  const limited = await limitRequest("admin-read", admin.id);
  if (limited) return limited;

  const search = new URL(req.url).searchParams;
  const query = search.get("q") ?? "";
  const cursorText = search.get("cursor");
  const cursor = cursorText ? readCursor(cursorText) : null;
  // Postgres text cannot hold a NUL.
  if (query.length > MAX_QUERY || query.includes("\0") || (cursorText && !cursor)) {
    return NextResponse.json({ error: "That search is not valid.", code: "invalid_request" }, { status: 400 });
  }
  return NextResponse.json(await listAdminUsers({ query, cursor }), { headers: { "Cache-Control": "private, no-store" } });
}
