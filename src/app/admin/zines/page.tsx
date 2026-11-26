import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { listAdminZines, type AdminZineFilter } from "@/lib/admin-zines";
import { prisma } from "@/lib/prisma";
import { StudioHeader } from "@/components/StudioHeader";
import { AdminNav } from "@/components/admin/AdminNav";
import { ZineList } from "@/components/admin/ZineList";

export const metadata: Metadata = {
  title: "Admin · Zines",
  robots: { index: false, follow: false },
};

const FILTERS: AdminZineFilter[] = ["all", "public", "private"];

export default async function AdminZinesPage({ searchParams }: { searchParams: Promise<{ status?: string | string[]; owner?: string | string[] }> }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/signin?callbackUrl=%2Fadmin%2Fzines");
  if (user.role !== "admin") notFound();

  const params = await searchParams;
  const status = FILTERS.find((f) => f === params.status) ?? "all";
  const ownerId = typeof params.owner === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(params.owner) ? params.owner : null;
  const owner = ownerId ? await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, email: true } }) : null;
  const zines = ownerId && !owner ? { zines: [], nextCursor: null } : await listAdminZines({ status, ownerId });

  return (
    <>
      <StudioHeader user={{ email: user.email, name: user.name, tier: user.tier, role: user.role, viewingAsFree: user.viewingAsFree }} />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="font-serif text-3xl font-bold text-ink-900">Admin</h1>
        <AdminNav current="zines" />
        <p className="mt-4 text-sm text-ink-500">Every zine, most recently changed first. Private zines show only that they exist.</p>
        <div className="mt-5">
          <ZineList initial={zines} initialStatus={status} owner={owner} />
        </div>
      </main>
    </>
  );
}
