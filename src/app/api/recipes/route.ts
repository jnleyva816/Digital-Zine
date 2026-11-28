import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/auth";
import { fujiRecipeSchema } from "@/lib/fuji/fuji-recipe";
import { prisma } from "@/lib/prisma";
import { duplicateNameMessage, listSavedRecipes, recipeNameTaken, settingsOf, toSavedRecipe } from "@/lib/fuji/recipes";
import { withUserLock } from "@/lib/billing/usage";
import { limitRequest } from "@/lib/infra/rate-limit";

const createSchema = z.object({
  recipe: fujiRecipeSchema,
  /** Also link this photo to the new recipe ("Save to library" on a photo). */
  linkAssetId: z.string().min(1).optional(),
});

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ recipes: await listSavedRecipes(prisma, user.id) });
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitRequest("write", user.id);
  if (limited) return limited;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid recipe" }, { status: 400 });
  }
  const { recipe, linkAssetId } = parsed.data;

  // Under the user's lock so two saves cannot both pass the name check.
  const result = await withUserLock(user.id, async (tx) => {
    if (await recipeNameTaken(tx, user.id, recipe.name)) return { status: 409, body: { error: duplicateNameMessage(recipe.name) } };
    if (linkAssetId) {
      const asset = await tx.mediaAsset.findFirst({ where: { id: linkAssetId, ownerId: user.id }, select: { id: true } });
      if (!asset) return { status: 404, body: { error: "Photo not found" } };
    }
    const row = await tx.recipe.create({
      data: { ownerId: user.id, name: recipe.name, settings: settingsOf(recipe) },
      select: { id: true, name: true, settings: true },
    });
    if (linkAssetId) {
      await tx.mediaAsset.update({
        where: { id: linkAssetId },
        data: { recipeId: row.id, recipe: recipe as Prisma.InputJsonValue, kind: "recipe" },
      });
    }
    return { status: 201, body: { recipe: { ...toSavedRecipe(row), photoCount: linkAssetId ? 1 : 0 } } };
  });

  return NextResponse.json(result.body, { status: result.status });
}
