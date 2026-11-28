import type { PhotoEdit } from "@/lib/board/photo-edit";
import type { ExifData, RecipeData } from "@/lib/zine/types";

/** One page of a public zine, as the page already renders it. The full-screen view adds no fetch (DIG-49). */
export interface ZinePageData {
  pageNumber: number;
  imageUrl: string;
  name?: string | null;
  edit?: PhotoEdit | null;
  dims?: { width: number; height: number } | null;
  blurDataUrl?: string | null;
  caption?: string;
  flipEnabled: boolean;
  kind: "photo" | "recipe";
  exif: ExifData | null;
  recipe: RecipeData | null;
}
