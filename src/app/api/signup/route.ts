import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { limitRequest } from "@/lib/rate-limit";
import { clientIp } from "@/lib/sign-in";
import { signupSchema } from "@/lib/signup";
import { EmailNotConfiguredError, sendVerificationEmail } from "@/lib/email";
import { issueVerificationToken, verificationLink } from "@/lib/email-verification";

/** DIG-94: create a password account and mail the link that verifies it. */
export async function POST(req: Request) {
  const limited = await limitRequest("signup-ip", clientIp(req));
  if (limited) return limited;

  const parsed = signupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form and try again." }, { status: 400 });
  }
  const { name, email, password } = parsed.data;

  const taken = NextResponse.json(
    { error: "An account with that email already exists. Sign in instead.", code: "email_taken" },
    { status: 409 }
  );
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return taken;

  let userId: string;
  try {
    const user = await prisma.user.create({
      data: { email, name, passwordHash: await bcrypt.hash(password, 12), termsAcceptedAt: new Date() },
      select: { id: true },
    });
    userId = user.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return taken;
    throw error;
  }

  try {
    await sendVerificationEmail(email, verificationLink(await issueVerificationToken(userId)));
  } catch (error) {
    // No account without a way to verify it: undo, so the creator can try again.
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    if (error instanceof EmailNotConfiguredError) {
      return NextResponse.json(
        { error: "Sign-up is not available yet: email is not set up on this server.", code: "email_not_configured" },
        { status: 503 }
      );
    }
    console.error("Verification email failed", error);
    return NextResponse.json({ error: "We could not send the verification email. Try again in a moment.", code: "email_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
