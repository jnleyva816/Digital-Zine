import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getAuthenticatedUser } from "@/lib/auth";
import { isRecentSignIn } from "@/lib/account-deletion";
import { prisma } from "@/lib/prisma";
import { clearRateLimit, limitRequest } from "@/lib/rate-limit";

type SignedIn = NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>;

/** The signed-in admin, or the 401 or 403 to send (DIG-136). Every admin route starts here. */
export async function requireAdmin(): Promise<{ admin: SignedIn; denied?: undefined } | { admin?: undefined; denied: NextResponse }> {
  const user = await getAuthenticatedUser();
  if (!user) return { denied: NextResponse.json({ error: "Sign in to continue." }, { status: 401 }) };
  if (user.role !== "admin") return { denied: NextResponse.json({ error: "Only admins can do this." }, { status: 403 }) };
  return { admin: user };
}

/**
 * Proves it is the admin before a change to someone's account: the password, or a sign-in from the
 * last five minutes, the rule for deleting your own account (DIG-108). A password that is given must
 * be right. Tries are counted before they are checked, so concurrent guesses cannot slip through.
 * Returns the response to send, or null to carry on.
 */
export async function confirmIdentity(admin: SignedIn, password: string | undefined): Promise<NextResponse | null> {
  const account = await prisma.user.findUnique({ where: { id: admin.id }, select: { passwordHash: true } });
  if (account?.passwordHash && password) {
    const limited = await limitRequest("admin-reauth", admin.id);
    if (limited) return limited;
    if (!(await bcrypt.compare(password, account.passwordHash))) {
      return NextResponse.json({ error: "That password is not right.", code: "wrong_password" }, { status: 403 });
    }
    await clearRateLimit("admin-reauth", admin.id);
    return null;
  }
  if (isRecentSignIn(admin.signedInAt)) return null;
  return NextResponse.json({ error: "Enter your password, or sign in again, to confirm it is you.", code: "reauth_required" }, { status: 403 });
}
