import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { writeLocalObject } from "@/lib/storage/local";

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
  const arrayBuffer = await req.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    return NextResponse.json({ error: "Empty upload payload" }, { status: 400 });
  }
  if (arrayBuffer.byteLength > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "File exceeds 25MB limit" }, { status: 413 });
  }

  await writeLocalObject(storageKey, Buffer.from(arrayBuffer), contentType);

  return NextResponse.json({ ok: true, storageKey });
}
