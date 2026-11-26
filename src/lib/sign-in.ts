import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { clearRateLimit, consumeRateLimit, peekRateLimit } from "@/lib/rate-limit";

/** Thrown when sign-in is refused for too many failed tries; `auth.ts` turns it into an Auth.js error. */
export class SignInRateLimitedError extends Error {}

/** The password was right but the email was never verified (DIG-94). */
export class EmailNotVerifiedError extends Error {}

/** How many proxies sit in front of the app (owner, 19 Nov; DIG-37). Set per host when deploying. */
function trustedProxyHops(): number {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? "1");
  return Number.isInteger(hops) && hops >= 1 ? hops : 1;
}

/**
 * The client's IP, from a source the client cannot forge (DIG-37). Each proxy appends the address
 * that connected to it to `X-Forwarded-For`, so with N trusted proxies the client is the Nth entry
 * from the right; anything further left came from the client. "unknown" without the header, so
 * such requests share one counter.
 */
export function clientIp(req: Request | undefined): string {
  const entries = (req?.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (entries.length === 0) return "unknown";
  return entries[Math.max(0, entries.length - trustedProxyHops())];
}

/**
 * Checks an email and password (DIG-28). Only failed tries count: 5 per email from one IP, and 20
 * per IP across all emails, in 15 minutes. Once either is used up, sign-in from that IP is refused,
 * even with the right password, until the window ends. Counting an email per IP means an attacker
 * cannot lock a creator out from elsewhere (owner, 19 Nov; DIG-37). A successful sign-in clears
 * that email's failed tries from that IP.
 */
export async function authorizeCredentials(
  credentials: Partial<Record<"email" | "password", unknown>> | undefined,
  request: Request | undefined
): Promise<{ id: string; email: string; name: string } | null> {
  const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
  const password = typeof credentials?.password === "string" ? credentials.password : "";
  if (!email || !password) return null;

  const ip = clientIp(request);
  const emailFromIp = `${email}|${ip}`;
  const [byEmail, byIp] = await Promise.all([peekRateLimit("signin-email", emailFromIp), peekRateLimit("signin-ip", ip)]);
  if (!byEmail.ok || !byIp.ok) throw new SignInRateLimitedError();

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !valid) {
    await Promise.all([consumeRateLimit("signin-email", emailFromIp), consumeRateLimit("signin-ip", ip)]);
    return null;
  }

  await clearRateLimit("signin-email", emailFromIp);
  if (user.deactivatedAt) throw new AccountDeactivatedError();
  // Said only after the password is right, so this never tells a stranger which emails exist.
  if (!user.emailVerifiedAt) throw new EmailNotVerifiedError();
  return { id: user.id, email: user.email, name: user.name ?? user.email.split("@")[0] };
}

/** An admin deactivated the account (DIG-137). Said only once the credentials are proven. */
export class AccountDeactivatedError extends Error {}
