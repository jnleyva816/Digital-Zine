import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { readCursor } from "@/lib/admin-users";
import { listAdminSubscriptions } from "@/lib/admin-subscriptions";
import { limitRequest } from "@/lib/rate-limit";

/** Admin-only, read-only: a page of active subscriptions (DIG-139). Changes happen in Stripe. */
export async function GET(req: Request) {
  const { admin, denied } = await requireAdmin();
  if (denied) return denied;
  const limited = await limitRequest("admin-read", admin.id);
  if (limited) return limited;

  const cursorText = new URL(req.url).searchParams.get("cursor");
  const cursor = cursorText ? readCursor(cursorText) : null;
  if (cursorText && !cursor) return NextResponse.json({ error: "That page is not valid.", code: "invalid_request" }, { status: 400 });
  return NextResponse.json(await listAdminSubscriptions({ cursor }), { headers: { "Cache-Control": "private, no-store" } });
}
