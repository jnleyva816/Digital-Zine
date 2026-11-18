import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkUpload, MAX_UPLOAD_BYTES } from "@/lib/limits";
import { writeLocalObject } from "@/lib/storage/local";
import { getBoardUsageBytes } from "@/lib/usage";

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
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
    const check = checkUpload({ size: declared, usedBytes: 0 });
    return NextResponse.json({ error: check.ok ? "" : check.message, code: "too_large" }, { status: 413 });
  }
  const arrayBuffer = await req.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    return NextResponse.json({ error: "Empty upload payload" }, { status: 400 });
  }
  // The local driver cannot sign a size like S3 does, so it checks the real body here (DIG-32).
  const check = checkUpload({ size: arrayBuffer.byteLength, usedBytes: await getBoardUsageBytes(user.id) });
  if (!check.ok) {
    return NextResponse.json(
      { error: check.message, code: check.reason },
      { status: check.reason === "too_large" ? 413 : 403 }
    );
  }

  await writeLocalObject(storageKey, Buffer.from(arrayBuffer), contentType);

  return NextResponse.json({ ok: true, storageKey });
}
