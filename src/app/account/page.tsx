import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/auth";
import { isRecentSignIn } from "@/lib/auth/account-deletion";
import { prisma } from "@/lib/prisma";
import { publicZinePath } from "@/lib/zine/public-zine-path";
import { StudioHeader } from "@/components/StudioHeader";
import { DeleteAccountPanel } from "@/components/account/DeleteAccountPanel";
import { ProfilePanel } from "@/components/account/ProfilePanel";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/signin?callbackUrl=%2Faccount");

  const [account, latestZine] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true, handle: true, name: true, bio: true } }),
    prisma.zine.findFirst({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true, published: true },
    }),
  ]);

  return (
    <>
      <StudioHeader
        user={{ email: user.email, name: user.name, tier: user.tier, role: user.role, viewingAsFree: user.viewingAsFree }}
        activeZineId={latestZine?.id ?? null}
        publishedPath={latestZine?.published ? publicZinePath(user.publicId, latestZine.slug) : null}
      />
      <main className="mx-auto max-w-2xl stack-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="font-serif text-3xl font-bold text-ink-900">Account</h1>
          <p className="mt-1 text-sm text-ink-500">
            Signed in as <span className="break-all font-medium text-ink-700">{user.email}</span>.
          </p>
        </div>
        <ProfilePanel initial={{ handle: account?.handle ?? null, name: account?.name ?? null, bio: account?.bio ?? null }} />
        <DeleteAccountPanel
          email={user.email}
          hasPassword={Boolean(account?.passwordHash)}
          recentSignIn={isRecentSignIn(user.signedInAt)}
          subscribed={user.billingTier === "pro"}
        />
      </main>
    </>
  );
}
