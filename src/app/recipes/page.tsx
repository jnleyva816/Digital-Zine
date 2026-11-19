import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listSavedRecipes } from "@/lib/recipes";
import { StudioHeader } from "@/components/StudioHeader";
import { RecipeLibrary } from "@/components/recipes/RecipeLibrary";

export const metadata: Metadata = {
  title: "Recipes",
  robots: { index: false, follow: false },
};

export default async function RecipesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/signin?callbackUrl=%2Frecipes");

  const [recipes, latestZine] = await Promise.all([
    listSavedRecipes(prisma, user.id),
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
        publishedSlug={latestZine?.published ? latestZine.slug : null}
      />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="font-serif text-3xl font-bold text-ink-900">Recipes</h1>
        <p className="mt-1 text-sm text-ink-500">
          Your saved Fujifilm recipes. Use one on many photos; editing it here updates every photo that uses it.
        </p>
        <div className="mt-6">
          <RecipeLibrary initial={recipes} />
        </div>
      </main>
    </>
  );
}
