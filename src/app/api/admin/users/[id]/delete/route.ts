import { NextResponse } from "next/server";
import { z } from "zod";
import "@/lib/zod-setup";
import { confirmIdentity, requireAdmin } from "@/lib/admin-guard";
import { refusal } from "@/lib/admin-refusals";
import { deleteUserAsAdmin } from "@/lib/admin-users";
import type { DeletionFailure } from "@/lib/account-deletion";
import { prisma } from "@/lib/prisma";
import { limitRequest } from "@/lib/rate-limit";

const bodySchema = z.object({ email: z.string().max(254), password: z.string().max(200).optional() });

/** Worded for the admin; the person stays deactivated, so a retry is safe. */
const FAILURES: Record<DeletionFailure, { status: number; error: string }> = {
  billing_unavailable: { status: 503, error: "Billing is not available, so their subscription could not be cancelled. They are deactivated, not deleted. Try again later." },
  stripe_failed: { status: 502, error: "Stripe could not cancel their subscription. They are deactivated, not deleted. Try again in a moment." },
  storage_failed: { status: 502, error: "Some of their files could not be removed. They are deactivated, not deleted. Try again to finish." },
  last_admin: { status: 409, error: "That person is an admin. Remove their admin role first." },
  failed: { status: 500, error: "The account could not be deleted. They are deactivated. Try again in a moment." },
};

/**
 * Admin-only: delete someone's account and everything it owns (DIG-137), as DIG-108 deletes your
 * own. The admin types the person's email and confirms it is them.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { admin, denied } = await requireAdmin();
  if (denied) return denied;
  const limited = await limitRequest("admin-action", admin.id);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Type their email address to confirm.", code: "invalid_request" }, { status: 400 });
  }
  const refused = await confirmIdentity(admin, parsed.data.password);
  if (refused) return refused;

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id }, select: { email: true } });
  if (!target) return refusal("not_found");
  if (parsed.data.email.trim().toLowerCase() !== target.email.toLowerCase()) {
    return NextResponse.json({ error: "That is not their email address.", code: "wrong_confirmation" }, { status: 400 });
  }

  const result = await deleteUserAsAdmin(admin.id, id);
  if (typeof result !== "string") return NextResponse.json({ id, deleted: true });
  if (result in FAILURES) {
    const { status, error } = FAILURES[result as DeletionFailure];
    return NextResponse.json({ error, code: result }, { status });
  }
  return refusal(result as Exclude<typeof result, DeletionFailure>);
}
