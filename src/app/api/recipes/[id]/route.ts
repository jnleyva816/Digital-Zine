import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { fujiRecipeSchema } from "@/lib/fuji-recipe";
import { prisma } from "@/lib/prisma";
import { duplicateNameMessage, recipeNameTaken, settingsOf, syncLinkedPhotos, toSavedRecipe } from "@/lib/recipes";
import { withUserLock } from "@/lib/usage";

const updateSchema = z.object({ recipe: fujiRecipeSchema });
type Context = { params: Promise<{ id: string }> };

/** Edits a saved recipe and rewrites it on every linked photo (DIG-24). */
export async function PATCH(req: Request, context: Context) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const existing = await prisma.recipe.findFirst({ where: { id, ownerId: user.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid recipe" }, { status: 400 });
  }
  const { recipe } = parsed.data;

  const result = await withUserLock(user.id, async (tx) => {
    if (await recipeNameTaken(tx, user.id, recipe.name, existing.id)) {
      return { status: 409, body: { error: duplicateNameMessage(recipe.name) } };
    }
    const row = await tx.recipe.update({
      where: { id: existing.id },
      data: { name: recipe.name, settings: settingsOf(recipe) },
      select: { id: true, name: true, settings: true, _count: { select: { assets: true } } },
    });
    await syncLinkedPhotos(tx, existing.id, recipe);
    return { status: 200, body: { recipe: toSavedRecipe(row) } };
  });
  return NextResponse.json(result.body, { status: result.status });
}

/** Deletes a saved recipe. Linked photos are unlinked and keep their copy of its settings. */
export async function DELETE(_req: Request, context: Context) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const existing = await prisma.recipe.findFirst({ where: { id, ownerId: user.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

  // `recipeId` is ON DELETE SET NULL; each photo's `recipe` copy is untouched.
  await prisma.recipe.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
