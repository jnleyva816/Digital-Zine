import { Prisma, type PrismaClient } from "@prisma/client";
import type { FujiRecipe } from "./fuji-recipe";
import { parseFujiRecipe } from "./fuji-recipe";
import type { SavedRecipe } from "./recipe-library";

type Db = Prisma.TransactionClient | PrismaClient;

/** A library row as the app uses it: the full recipe with its name, and the linked photo count. */
export function toSavedRecipe(row: { id: string; name: string; settings: unknown; _count?: { assets: number } }): SavedRecipe | null {
  const recipe = parseFujiRecipe({ ...(row.settings as object), name: row.name });
  return recipe ? { id: row.id, recipe, photoCount: row._count?.assets ?? 0 } : null;
}

/** The recipe's settings without its name, as stored on `Recipe.settings`. */
export function settingsOf(recipe: FujiRecipe): Prisma.InputJsonValue {
  const { name: _name, ...settings } = recipe;
  return settings as Prisma.InputJsonValue;
}

/** Whether the creator already has another recipe with this name, ignoring case. */
export async function recipeNameTaken(db: Db, ownerId: string, name: string, exceptId?: string): Promise<boolean> {
  const found = await db.recipe.findFirst({
    where: { ownerId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return found !== null;
}

/** Copies a saved recipe onto every photo linked to it, so every reader shows the new version. */
export async function syncLinkedPhotos(db: Db, recipeId: string, recipe: FujiRecipe): Promise<void> {
  await db.mediaAsset.updateMany({
    where: { recipeId },
    data: { recipe: recipe as Prisma.InputJsonValue, kind: "recipe" },
  });
}

export function duplicateNameMessage(name: string): string {
  return `You already have a recipe named “${name}”.`;
}

/** The creator's saved recipes by name, with linked photo counts. */
export async function listSavedRecipes(db: Db, ownerId: string): Promise<SavedRecipe[]> {
  const rows = await db.recipe.findMany({
    where: { ownerId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, settings: true, _count: { select: { assets: true } } },
  });
  return rows.map(toSavedRecipe).filter((r): r is SavedRecipe => r !== null);
}
