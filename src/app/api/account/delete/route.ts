import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import "@/lib/infra/zod-setup";
import { getAuthenticatedUser } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import { limitRequest } from "@/lib/infra/rate-limit";
import { deleteAccountCompletely, isRecentSignIn, type DeletionFailure } from "@/lib/auth/account-deletion";

const bodySchema = z.object({ email: z.string().max(254), password: z.string().max(200).optional() });

const STATUS: Record<DeletionFailure, number> = {
  last_admin: 409,
  stripe_failed: 502,
  storage_failed: 502,
  billing_unavailable: 503,
  failed: 500,
};

/**
 * DIG-108: delete the signed-in creator's own account. Three checks come first, and every attempt
 * counts against the creator's limit, so none of them can be guessed at: the typed email is the
 * account's own, and the creator has either signed in within the last five minutes or gives the
 * account's password. A password that is given must be right, even on a fresh sign-in. An account
 * with no password (Google only) needs the recent sign-in.
 */
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const limited = await limitRequest("account-delete", user.id);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Type your email address to confirm.", code: "invalid_request" }, { status: 400 });
  }
  if (parsed.data.email.trim().toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: "That is not the email address on this account.", code: "wrong_confirmation" }, { status: 400 });
  }

  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (account?.passwordHash && parsed.data.password) {
    if (!(await bcrypt.compare(parsed.data.password, account.passwordHash))) {
      return NextResponse.json({ error: "That password is not right.", code: "wrong_password" }, { status: 403 });
    }
  } else if (!isRecentSignIn(user.signedInAt)) {
    return NextResponse.json({ error: "Sign in again to confirm it is you.", code: "reauth_required" }, { status: 403 });
  }

  const result = await deleteAccountCompletely(user.id);
  if (result.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: result.message, code: result.code }, { status: STATUS[result.code] });
}
