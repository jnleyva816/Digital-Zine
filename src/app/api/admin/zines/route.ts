import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { readCursor } from "@/lib/admin-users";
import { listAdminZines, type AdminZineFilter } from "@/lib/admin-zines";
import { limitRequest } from "@/lib/rate-limit";

const FILTERS = new Set<AdminZineFilter>(["all", "public", "private"]);
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Admin-only: a page of zines, optionally one status or one owner's (DIG-138). */
export async function GET(req: Request) {
  const { admin, denied } = await requireAdmin();
  if (denied) return denied;
  const limited = await limitRequest("admin-read", admin.id);
  if (limited) return limited;

  const search = new URL(req.url).searchParams;
  const status = (search.get("status") ?? "all") as AdminZineFilter;
  const ownerId = search.get("owner");
  const cursorText = search.get("cursor");
  const cursor = cursorText ? readCursor(cursorText) : null;
  if (!FILTERS.has(status) || (ownerId !== null && !ID.test(ownerId)) || (cursorText && !cursor)) {
    return NextResponse.json({ error: "That filter is not valid.", code: "invalid_request" }, { status: 400 });
  }
  return NextResponse.json(await listAdminZines({ status, ownerId, cursor }), { headers: { "Cache-Control": "private, no-store" } });
}
