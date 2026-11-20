import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { limitRequest } from "@/lib/rate-limit";
import { clientIp } from "@/lib/sign-in";
import { sendVerificationEmail } from "@/lib/email";
import { issueVerificationToken, verificationLink } from "@/lib/email-verification";

const resendSchema = z.object({ email: z.string().trim().toLowerCase().max(254).email("Enter a valid email address.") });

/**
 * DIG-94: mail a new verification link. The answer is the same whether or not the address has
 * an unverified account, so this cannot be used to find out who is signed up.
 */
export async function POST(req: Request) {
  const parsed = resendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter a valid email address." }, { status: 400 });
  }
  const { email } = parsed.data;

  const limited = (await limitRequest("resend-ip", clientIp(req))) ?? (await limitRequest("resend-email", email));
  if (limited) return limited;

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true, emailVerifiedAt: true } });
  if (user?.passwordHash && !user.emailVerifiedAt) {
    try {
      await sendVerificationEmail(email, verificationLink(await issueVerificationToken(user.id)));
    } catch (error) {
      console.error("Verification email failed", error);
    }
  }
  return NextResponse.json({ ok: true });
}
