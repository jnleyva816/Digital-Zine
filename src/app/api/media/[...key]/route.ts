import { NextResponse } from "next/server";
import { readLocalObject } from "@/lib/storage/local";

export async function GET(
  _req: Request,
  context: { params: Promise<{ key: string[] }> }
) {
  const { key } = await context.params;
  const storageKey = key.map((segment) => decodeURIComponent(segment)).join("/");

  try {
    const obj = await readLocalObject(storageKey);
    if (!obj) {
      return new NextResponse("Not found", { status: 404 });
    }

    return new NextResponse(new Uint8Array(obj.bytes), {
      status: 200,
      headers: {
        "Content-Type": obj.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        // Even if a file's bytes are not what its type says, browsers must never run it (DIG-36).
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new NextResponse("Invalid path", { status: 400 });
  }
}
