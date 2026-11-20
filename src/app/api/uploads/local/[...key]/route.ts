import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { uploadLimitResponse } from "@/lib/limit-response";
import { checkUpload } from "@/lib/limits";
import { contentTypeForKey, writeLocalObject } from "@/lib/storage/local";
import { isValidStorageKey, isWellFormedStorageKey } from "@/lib/storage/keys";
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
  // Never decode the segments again: that would turn %2e%2e into ".." (DIG-35). Keys the server
  // builds need no escaping, so a %-escape, like any malformed key, is refused outright.
  const storageKey = key.join("/");
  if (!isWellFormedStorageKey(storageKey)) {
    return NextResponse.json({ error: "Invalid storage key." }, { status: 400 });
  }
  if (!isValidStorageKey(user.id, storageKey)) {
    return NextResponse.json({ error: "Forbidden storage key" }, { status: 403 });
  }

  // JPEG only (owner, 19 Nov), by both the declared type and the file name (DIG-36).
  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType !== "image/jpeg" || contentTypeForKey(storageKey) !== "image/jpeg") {
    return NextResponse.json({ error: "Only JPEG photos can be uploaded." }, { status: 415 });
  }
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
