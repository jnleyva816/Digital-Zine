import { NextResponse } from "next/server";
import { z } from "zod";
import "@/lib/infra/zod-setup";
import { confirmIdentity, requireAdmin } from "@/lib/admin/admin-guard";
import { changeRole, type RoleChange } from "@/lib/admin/admin-users";
import { limitRequest } from "@/lib/infra/rate-limit";

const bodySchema = z.object({ role: z.enum(["user", "admin"]), password: z.string().max(200).optional() });

const REFUSALS: Record<Exclude<RoleChange, "ok">, { status: number; error: string }> = {
  self: { status: 409, error: "You cannot change your own role. Ask another admin." },
  forbidden: { status: 403, error: "Only admins can do this." },
  not_found: { status: 404, error: "That account no longer exists." },
  unverified: { status: 409, error: "That person has not verified their email yet, so they cannot be made an admin." },
  deactivated: { status: 409, error: "That account is deactivated. Reactivate it first." },
};

/** Admin-only: give someone the admin role, or remove it (DIG-136). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { admin, denied } = await requireAdmin();
  if (denied) return denied;
  const limited = await limitRequest("admin-action", admin.id);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a role.", code: "invalid_request" }, { status: 400 });
  }
  const refused = await confirmIdentity(admin, parsed.data.password);
  if (refused) return refused;

  const { id } = await params;
  const result = await changeRole(admin.id, id, parsed.data.role);
  if (result === "ok") return NextResponse.json({ id, role: parsed.data.role });
  const { status, error } = REFUSALS[result];
  return NextResponse.json({ error, code: result }, { status });
}
