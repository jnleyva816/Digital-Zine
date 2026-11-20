import type { FoundRecipe } from "@/lib/fuji-makernote";
import type { PreparedUpload } from "@/lib/storage/types";
import { readApiError, toBoardAsset, type BoardAsset } from "./types";

export type UploadStage = "queued" | "reading" | "uploading" | "saving" | "error";

export interface UploadItem {
  id: string;
  name: string;
  stage: UploadStage;
  error?: string;
}

export const STAGE_LABEL: Record<UploadStage, string> = {
  queued: "Waiting",
  reading: "Reading EXIF",
  uploading: "Uploading",
  saving: "Saving to board",
  error: "Failed",
};

/** Reads a photo's EXIF, uploads it, and adds it to `boardId`, reporting each stage. */
export async function uploadOne(
  file: File,
  boardId: string,
  onStage: (stage: UploadStage) => void,
): Promise<{ asset: BoardAsset; foundRecipe: FoundRecipe | null }> {
  onStage("reading");
  // Loaded on demand so exifreader stays out of the board's initial bundle.
  const { extractExifFromFile } = await import("@/lib/exif-client");
  const { exif, foundRecipe } = await extractExifFromFile(file);

  onStage("uploading");
  const presign = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
  });
  if (!presign.ok) {
    throw new Error(await readApiError(presign, "Could not prepare the upload."));
  }
  const prepared = (await presign.json()) as PreparedUpload;

  const put = await fetch(prepared.uploadUrl, {
    method: prepared.method,
    headers: prepared.headers,
    body: file,
  });
  if (!put.ok) {
    throw new Error(await readApiError(put, "The file upload failed."));
  }

  onStage("saving");
  const created = await fetch("/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storageKey: prepared.storageKey,
      originalName: file.name,
      mimeType: file.type,
      kind: "photo",
      exif,
      boardId,
    }),
  });
  if (!created.ok) {
    throw new Error(await readApiError(created, "The photo uploaded but could not be saved."));
  }
  const body = (await created.json()) as { asset: Parameters<typeof toBoardAsset>[0] };
  return { asset: toBoardAsset(body.asset), foundRecipe };
}
