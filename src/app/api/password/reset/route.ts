import { NextResponse } from "next/server";
import { resetPasswordSchema } from "@/lib/password-reset-schema";
import { resetPassword } from "@/lib/password-reset";
import { limitRequest } from "@/lib/rate-limit";
import { clientIp } from "@/lib/sign-in";

const INVALID_TOKEN = {
  error: "This link is expired or already used. Ask for a new one.",
  code: "invalid_token",
} as const;

/**
 * DIG-107: spend a reset link and set a new password. Every attempt counts against the network's
 * limit, good or bad. An unknown, used, or expired link gets one answer. A refused password does not
 * spend the link. On success the page signs the creator in with the password it just set, and every
 * session from before the reset is signed out (see `resetPassword`).
 */
export async function POST(req: Request) {
  const limited = await limitRequest("reset-ip", clientIp(req));
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Check the form and try again.", code: "invalid_request" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!token || token.length > 200) return NextResponse.json(INVALID_TOKEN, { status: 400 });

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the form and try again.", code: "invalid_password" },
      { status: 400 }
    );
  }

  const result = await resetPassword(parsed.data.token, parsed.data.password);
  if (result.ok) return NextResponse.json({ ok: true, email: result.email });
  if (result.reason === "invalid_password") {
    return NextResponse.json({ error: result.message, code: "invalid_password" }, { status: 400 });
  }
  return NextResponse.json(INVALID_TOKEN, { status: 400 });
}
