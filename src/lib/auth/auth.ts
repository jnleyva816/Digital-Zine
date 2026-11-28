import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { effectiveAccess, VIEW_AS_FREE_COOKIE } from "@/lib/billing/entitlements";
import { AccountDeactivatedError, EmailNotVerifiedError, SignInRateLimitedError, authorizeCredentials } from "@/lib/auth/sign-in";
import { consumeVerificationToken } from "@/lib/auth/email-verification";
import { googleEnabled } from "@/lib/auth/google-config";
import { resolveGoogleUser } from "@/lib/auth/google-signin";
import { checkSessionToken, markSignedIn } from "@/lib/auth/session-token";

/** Too many failed sign-ins (DIG-28). The form reads `code` and says to wait. */
class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

/** The password was right but the email is not verified yet (DIG-94). The form offers a resend. */
class EmailNotVerifiedSignin extends CredentialsSignin {
  code = "email_not_verified";
}

/** An admin deactivated the account (DIG-137). Only sent once the credentials are proven. */
class AccountDeactivatedSignin extends CredentialsSignin {
  code = "account_deactivated";
}

/** Where a refused Google sign-in lands, with a reason the form can explain (DIG-94). */
const GOOGLE_REFUSALS = {
  unverified_email: "google_unverified",
  email_linked_elsewhere: "google_linked_elsewhere",
  invalid_profile: "google_failed",
  deactivated: "account_deactivated",
} as const;

declare module "next-auth" {
  interface Session {
    /** When this session began, in ms since the epoch (DIG-107). Absent on sessions from before it was recorded. */
    authAt?: number;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/signin",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        try {
          return await authorizeCredentials(credentials, request);
        } catch (error) {
          if (error instanceof SignInRateLimitedError) throw new RateLimitedSignin();
          if (error instanceof EmailNotVerifiedError) throw new EmailNotVerifiedSignin();
          if (error instanceof AccountDeactivatedError) throw new AccountDeactivatedSignin();
          throw error;
        }
      },
    }),
    // The verification link signs the creator in, once (DIG-94). The token is the credential.
    Credentials({
      id: "email-verification",
      name: "Email verification",
      credentials: { token: { label: "Token", type: "text" } },
      async authorize(credentials) {
        const token = typeof credentials?.token === "string" ? credentials.token : "";
        let user;
        try {
          user = await consumeVerificationToken(token);
        } catch (error) {
          if (error instanceof AccountDeactivatedError) throw new AccountDeactivatedSignin();
          throw error;
        }
        return user ? { id: user.id, email: user.email, name: user.name ?? user.email.split("@")[0] } : null;
      },
    }),
    ...(googleEnabled()
      ? [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET })]
      : []),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;
      try {
        const result = await resolveGoogleUser(profile ?? {});
        return result.ok ? true : `/signin?error=${GOOGLE_REFUSALS[result.reason]}`;
      } catch (error) {
        console.error("Google sign-in failed", error);
        return "/signin?error=google_failed";
      }
    },
    async jwt({ token, user, account }) {
      if (account?.provider === "google") {
        // `signIn` above made or linked the account, so Google's id maps to ours.
        const linked = await prisma.user.findUnique({ where: { googleId: account.providerAccountId }, select: { id: true } });
        if (linked) token.sub = linked.id;
      } else if (user?.id) {
        token.sub = user.id;
      }
      // A sign-in starts a session; every later call checks it is still good, so a password reset
      // signs out the sessions from before it (DIG-107).
      if (account || user) markSignedIn(token);
      return checkSessionToken(token);
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      if (typeof token.authAt === "number") session.authAt = token.authAt;
      return session;
    },
  },
});

export async function getAuthenticatedUser() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      publicId: true,
      email: true,
      name: true,
      tier: true,
      role: true,
      subscriptionStatus: true,
      stripeCustomerId: true,
      deactivatedAt: true,
    },
  });
  // A deactivated account is signed out (DIG-137); the session check ends it too, this is the backstop.
  if (!user || user.deactivatedAt) return null;

  // `tier` is what feature checks use: Pro for admins (unless viewing as Free), otherwise the
  // billed tier. `billingTier` is what Stripe says, for the billing page.
  const viewAsFree = (await cookies()).get(VIEW_AS_FREE_COOKIE)?.value === "1";
  const { deactivatedAt: _deactivated, ...account } = user;
  const access = effectiveAccess(account, viewAsFree);
  // When this session began, for actions that ask for a recent sign-in (DIG-108).
  const signedInAt = typeof session?.authAt === "number" ? session.authAt : null;
  return { ...account, tier: access.tier, billingTier: user.tier, viewingAsFree: access.viewingAsFree, signedInAt };
}
