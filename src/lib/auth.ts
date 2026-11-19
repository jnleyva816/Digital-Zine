import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { effectiveAccess, VIEW_AS_FREE_COOKIE } from "@/lib/entitlements";
import { SignInRateLimitedError, authorizeCredentials } from "@/lib/sign-in";

/** Too many failed sign-ins (DIG-28). The form reads `code` and says to wait. */
class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
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
          throw error;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
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
      email: true,
      name: true,
      tier: true,
      role: true,
      subscriptionStatus: true,
      stripeCustomerId: true,
    },
  });
  if (!user) return null;

  // `tier` is what feature checks use: Pro for admins (unless viewing as Free), otherwise the
  // billed tier. `billingTier` is what Stripe says, for the billing page.
  const viewAsFree = (await cookies()).get(VIEW_AS_FREE_COOKIE)?.value === "1";
  const access = effectiveAccess(user, viewAsFree);
  return { ...user, tier: access.tier, billingTier: user.tier, viewingAsFree: access.viewingAsFree };
}
