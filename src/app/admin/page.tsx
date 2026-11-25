import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { isRecentSignIn } from "@/lib/account-deletion";
import { listAdminUsers } from "@/lib/admin-users";
import { prisma } from "@/lib/prisma";
import { StudioHeader } from "@/components/StudioHeader";
import { UserList } from "@/components/admin/UserList";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/signin?callbackUrl=%2Fadmin");
  if (user.role !== "admin") notFound();

  const [users, account] = await Promise.all([
    listAdminUsers(),
    prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } }),
  ]);

  return (
    <>
      <StudioHeader user={{ email: user.email, name: user.name, tier: user.tier, role: user.role, viewingAsFree: user.viewingAsFree }} />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="font-serif text-3xl font-bold text-ink-900">Admin</h1>
        <p className="mt-1 text-sm text-ink-500">Everyone with an account, newest first.</p>
        <div className="mt-6">
          <UserList initial={users} adminId={user.id} hasPassword={Boolean(account?.passwordHash)} recentSignIn={isRecentSignIn(user.signedInAt)} />
        </div>
      </main>
    </>
  );
}
