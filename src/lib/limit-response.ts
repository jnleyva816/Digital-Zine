import { NextResponse } from "next/server";
import type { UploadCheck } from "@/lib/limits";

const STATUS = { invalid_size: 400, too_large: 413, over_quota: 403 } as const;

/** The JSON error for a failed upload check: `{ error, code }` with 400, 413, or 403. */
export function uploadLimitResponse(check: Extract<UploadCheck, { ok: false }>) {
  return NextResponse.json({ error: check.message, code: check.reason }, { status: STATUS[check.reason] });
}
