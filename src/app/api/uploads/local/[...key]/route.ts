import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { uploadLimitResponse } from "@/lib/limit-response";
import { checkUpload } from "@/lib/limits";
import { writeLocalObject } from "@/lib/storage/local";
import { getAccountUsageBytes } from "@/lib/usage";

export async function PUT(
  req: Request,
  context: { params: Promise<{ key: string[] }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await context.params;
  const storageKey = key.map((segment) => decodeURIComponent(segment)).join("/");

  if (!storageKey.startsWith(`users/${user.id}/`)) {
    return NextResponse.json({ error: "Forbidden storage key" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") || "image/jpeg";
  // Refuse a declared oversize body before reading it into memory.
  const declared = Number(req.headers.get("content-length"));
  if (declared > 0) {
    const early = checkUpload({ size: declared, usedBytes: 0 });
    if (!early.ok && early.reason === "too_large") return uploadLimitResponse(early);
  }
  const arrayBuffer = await req.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    return NextResponse.json({ error: "Empty upload payload" }, { status: 400 });
  }
  // The local driver cannot sign a size like S3 does, so it checks the real body here (DIG-32).
  const check = checkUpload({ size: arrayBuffer.byteLength, usedBytes: await getAccountUsageBytes(user.id) });
  if (!check.ok) return uploadLimitResponse(check);

  await writeLocalObject(storageKey, Buffer.from(arrayBuffer), contentType);

  return NextResponse.json({ ok: true, storageKey });
}
