import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { zineLimitFor, zineLimitMessage } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { StudioHeader } from "@/components/StudioHeader";
import { NewZineForm } from "@/components/editor/NewZineForm";

export const metadata: Metadata = {
  title: "Your zines",
  robots: { index: false, follow: false },
};

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function ZineListPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/signin?callbackUrl=%2Feditor");

  const zines = await prisma.zine.findMany({
    where: { ownerId: user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      published: true,
      updatedAt: true,
      _count: { select: { pages: true } },
    },
  });
  const latest = zines[0];
  const zineLimit = zineLimitFor(user.tier);
  const limitReached = zineLimit !== null && zines.length >= zineLimit ? zineLimitMessage(zineLimit) : null;

  return (
    <>
      <StudioHeader
        user={{ email: user.email, name: user.name, tier: user.tier, role: user.role, viewingAsFree: user.viewingAsFree }}
        activeZineId={latest?.id ?? null}
        publishedSlug={latest?.published ? latest.slug : null}
      />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="font-serif text-3xl font-bold text-ink-900">Your zines</h1>
        <p className="mt-1 text-sm text-ink-500">Sequence photos from your board into pages, then publish.</p>

        <div className="mt-6">
          <NewZineForm limitReached={limitReached} />
        </div>

        {zines.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-paper-300 bg-white px-6 py-12 text-center">
            <h2 className="font-serif text-xl font-bold text-ink-900">No zines yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-500">
              Give your first zine a title above. Nothing is public until you publish it.
            </p>
          </div>
        ) : (
          <ol aria-label="Zines" className="mt-6 divide-y divide-paper-200 overflow-hidden rounded-2xl border border-paper-300 bg-white">
            {zines.map((zine) => (
              <li key={zine.id}>
                <Link
                  href={`/editor/${zine.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-paper-100 focus-visible:bg-paper-100"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-serif text-lg font-bold text-ink-900">{zine.title}</span>
                    <span className="block text-xs text-ink-500">
                      {zine._count.pages} {zine._count.pages === 1 ? "page" : "pages"} · Updated{" "}
                      {dateFormat.format(zine.updatedAt)}
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-wider ${
                      zine.published ? "bg-vermilion-500 text-white" : "border border-paper-300 bg-paper-100 text-ink-700"
                    }`}
                  >
                    {zine.published ? "Published" : "Draft"}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </main>
    </>
  );
}
