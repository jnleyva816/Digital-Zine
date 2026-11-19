import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { clearRateLimit, consumeRateLimit, peekRateLimit } from "@/lib/rate-limit";

/** Thrown when sign-in is refused for too many failed tries; `auth.ts` turns it into an Auth.js error. */
export class SignInRateLimitedError extends Error {}

/**
 * The client's IP: the first address in `X-Forwarded-For`, which the hosting proxy sets, or
 * `X-Real-IP`. "unknown" when neither is present, so such requests share one counter.
 */
export function clientIp(req: Request | undefined): string {
  const forwarded = req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req?.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Checks an email and password (DIG-28). Only failed tries count: 5 per email and 20 per IP in
 * 15 minutes. Once either is used up, sign-in is refused, even with the right password, until
 * the window ends. A successful sign-in clears that email's failed tries.
 */
export async function authorizeCredentials(
  credentials: Partial<Record<"email" | "password", unknown>> | undefined,
  request: Request | undefined
): Promise<{ id: string; email: string; name: string } | null> {
  const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
  const password = typeof credentials?.password === "string" ? credentials.password : "";
  if (!email || !password) return null;

  const ip = clientIp(request);
  const [byEmail, byIp] = await Promise.all([peekRateLimit("signin-email", email), peekRateLimit("signin-ip", ip)]);
  if (!byEmail.ok || !byIp.ok) throw new SignInRateLimitedError();

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !valid) {
    await Promise.all([consumeRateLimit("signin-email", email), consumeRateLimit("signin-ip", ip)]);
    return null;
  }

  await clearRateLimit("signin-email", email);
  return { id: user.id, email: user.email, name: user.name ?? user.email.split("@")[0] };
}
