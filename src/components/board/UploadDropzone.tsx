"use client";

import { useState, type RefObject } from "react";
import { ImagePlus } from "lucide-react";
import { formatBytes, MAX_UPLOAD_BYTES } from "@/lib/limits";
import { ACCEPTED_IMAGE_TYPES } from "./types";

export interface UploadDropzoneProps {
  inputId: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFiles: (files: FileList) => void;
  /** True while a card is being dragged to reorder, so the drop is not taken as files. */
  isReordering: () => boolean;
}

/** Where photos are dropped or chosen (DIG-47, moved out of VisionBoard). */
export function UploadDropzone({ inputId, fileInputRef, onFiles, isReordering }: UploadDropzoneProps) {
  const [active, setActive] = useState(false);
  return (
    <section
      aria-label="Add photos"
      onDragOver={(e) => {
        if (isReordering()) return;
        if (Array.from(e.dataTransfer.types).includes("Files")) {
          e.preventDefault();
          setActive(true);
        }
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        if (isReordering()) return;
        e.preventDefault();
        setActive(false);
        if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
      }}
      className={`rounded-2xl border-2 border-dashed px-5 py-3 text-center transition ${
        active ? "border-vermilion-500 bg-vermilion-500/5" : "border-paper-300 bg-paper-100/60"
      }`}
    >
      <p className="text-sm text-ink-700">
        <ImagePlus className="mr-2 inline h-5 w-5 text-vermilion-500" aria-hidden="true" />
        Drop photos here, or{" "}
        <label htmlFor={inputId} className="cursor-pointer font-semibold text-vermilion-600 underline underline-offset-2 hover:text-vermilion-500">
          choose files
        </label>
        .
      </p>
      <p className="mt-1 text-xs text-ink-500">
        JPEG photos up to {formatBytes(MAX_UPLOAD_BYTES)}. Camera EXIF is read on your device before upload.
      </p>
      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        multiple
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="sr-only"
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </section>
  );
}
