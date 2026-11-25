import { NextResponse } from "next/server";
import type { AccountRefusal } from "@/lib/admin-users";

const REFUSALS: Record<AccountRefusal, { status: number; error: string }> = {
  self: { status: 409, error: "You cannot do this to your own account." },
  forbidden: { status: 403, error: "Only admins can do this." },
  not_found: { status: 404, error: "That account no longer exists." },
  target_admin: { status: 409, error: "That person is an admin. Remove their admin role first." },
};

/** The response for an admin action refused on its target (DIG-137). */
export function refusal(code: AccountRefusal): NextResponse {
  const { status, error } = REFUSALS[code];
  return NextResponse.json({ error, code }, { status });
}
