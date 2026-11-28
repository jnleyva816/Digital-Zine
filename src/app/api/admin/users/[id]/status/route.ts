import { NextResponse } from "next/server";
import { z } from "zod";
import "@/lib/infra/zod-setup";
import { confirmIdentity, requireAdmin } from "@/lib/admin/admin-guard";
import { refusal } from "@/lib/admin/admin-refusals";
import { deactivateUser, reactivateUser } from "@/lib/admin/admin-users";
import { limitRequest } from "@/lib/infra/rate-limit";

const bodySchema = z.object({ action: z.enum(["deactivate", "reactivate"]), password: z.string().max(200).optional() });

/**
 * Admin-only: deactivate or reactivate an account (DIG-137). Both are safe to repeat. Deactivating
 * answers with what happened to the person's subscription, which may need a retry.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { admin, denied } = await requireAdmin();
  if (denied) return denied;
  const limited = await limitRequest("admin-action", admin.id);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose deactivate or reactivate.", code: "invalid_request" }, { status: 400 });
  }
  const refused = await confirmIdentity(admin, parsed.data.password);
  if (refused) return refused;

  const { id } = await params;
  if (parsed.data.action === "deactivate") {
    const result = await deactivateUser(admin.id, id);
    if (typeof result === "string") return refusal(result);
    return NextResponse.json({ id, deactivated: true, billing: result.billing });
  }
  const result = await reactivateUser(admin.id, id);
  if (typeof result === "string") return refusal(result);
  return NextResponse.json({ id, deactivated: false });
}
