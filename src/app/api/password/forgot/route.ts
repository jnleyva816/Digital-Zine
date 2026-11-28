import { after, NextResponse } from "next/server";
import { forgotPasswordSchema } from "@/lib/auth/password-reset-schema";
import { requestPasswordReset } from "@/lib/auth/password-reset";
import { limitRequest } from "@/lib/infra/rate-limit";
import { clientIp } from "@/lib/auth/sign-in";

/**
 * DIG-107: ask for a password reset link. The answer is the same whether or not the address has an
 * account, and it goes out before the account is even looked up: the lookup, the token, and the
 * email all happen in `after()`. So neither the wording nor the time taken can be used to find out
 * who is signed up. The limits count every address alike for the same reason.
 */
export async function POST(req: Request) {
  const parsed = forgotPasswordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter a valid email address." }, { status: 400 });
  }
  const { email } = parsed.data;

  const limited = (await limitRequest("forgot-ip", clientIp(req))) ?? (await limitRequest("forgot-email", email));
  if (limited) return limited;

  after(async () => {
    try {
      await requestPasswordReset(email);
    } catch (error) {
      console.error("Password reset email failed", error);
    }
  });
  return NextResponse.json({ ok: true });
}
