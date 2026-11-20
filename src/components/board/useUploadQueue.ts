"use client";

import { useCallback, useRef, useState } from "react";
import type { FoundRecipe } from "@/lib/fuji-makernote";
import { checkUpload } from "@/lib/limits";
import { ACCEPTED_IMAGE_TYPES, type BoardAsset } from "./types";
import { uploadOne, type UploadItem } from "./upload-photo";

export interface UploadQueueOptions {
  boardId: string;
  /** Bytes already stored in the account, for the early quota check. */
  usedBytes: number;
  /** Called for each photo once it is on the board. */
  onUploaded: (asset: BoardAsset, foundRecipe: FoundRecipe | null) => void;
  /** Called when the queue empties, with a sentence to announce, if any photo was added. */
  onFinished: (announcement: string) => void;
}

/**
 * The board's upload queue (DIG-47, moved out of VisionBoard). Files are checked locally first
 * (JPEG only, size and quota), then uploaded one at a time so each new photo gets the next sort
 * order. Failed files stay in the list with their error until dismissed.
 */
export function useUploadQueue({ boardId, usedBytes, onUploaded, onFinished }: UploadQueueOptions) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const uploadingRef = useRef(false);
  const queueRef = useRef<{ id: string; file: File }[]>([]);
  // The queue outlives a render, so it reads the latest callbacks through a ref.
  const callbacks = useRef({ onUploaded, onFinished });
  callbacks.current = { onUploaded, onFinished };

  const updateUpload = (id: string, patch: Partial<UploadItem>) =>
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  const drainQueue = useCallback(async () => {
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    let added = 0;
    let found = 0;
    while (queueRef.current.length > 0) {
      const { id, file } = queueRef.current.shift()!;
      try {
        const { asset, foundRecipe } = await uploadOne(file, boardId, (stage) => updateUpload(id, { stage }));
        callbacks.current.onUploaded(asset, foundRecipe);
        if (foundRecipe) found += 1;
        setUploads((prev) => prev.filter((u) => u.id !== id));
        added += 1;
      } catch (err) {
        updateUpload(id, {
          stage: "error",
          error: err instanceof Error ? err.message : "Upload failed.",
        });
      }
    }
    uploadingRef.current = false;
    if (added > 0) {
      const review =
        found === 0
          ? ""
          : found === 1
            ? " A film recipe was found in one photo. Review it before saving."
            : ` Film recipes were found in ${found} photos. Review them before saving.`;
      callbacks.current.onFinished(`${added} photo${added === 1 ? "" : "s"} added to the board.${review}`);
    }
  }, [boardId]);

  function enqueue(files: FileList | File[]) {
    const items: UploadItem[] = [];
    // The server has the final say; this saves uploading a file it would refuse.
    let committedBytes = usedBytes;
    for (const file of Array.from(files)) {
      const id = `${file.name}-${file.size}-${crypto.randomUUID()}`;
      if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
        items.push({ id, name: file.name, stage: "error", error: "Only JPEG photos can be uploaded." });
        continue;
      }
      const check = checkUpload({ size: file.size, usedBytes: committedBytes });
      if (!check.ok) {
        items.push({ id, name: file.name, stage: "error", error: check.message });
        continue;
      }
      committedBytes += file.size;
      items.push({ id, name: file.name, stage: "queued" });
      queueRef.current.push({ id, file });
    }
    if (items.length === 0) return;
    setUploads((prev) => [...prev, ...items]);
    void drainQueue();
  }

  const dismiss = (id: string) => setUploads((prev) => prev.filter((u) => u.id !== id));

  return { uploads, isUploading: uploads.some((u) => u.stage !== "error"), enqueue, dismiss };
}
