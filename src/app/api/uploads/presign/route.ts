import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { uploadLimitResponse } from "@/lib/limit-response";
import { checkUpload } from "@/lib/limits";
import { buildStorageKey, getStorageDriver } from "@/lib/storage";
import { getBoardUsageBytes } from "@/lib/usage";

const presignSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z
    .string()
    .regex(/^image\/(jpeg|jpg|png|webp|gif|avif)$/i, "Only image files are supported"),
  size: z.number({ message: "The file size is missing or invalid." }).int("The file size is missing or invalid.").positive("The file size is missing or invalid."),
});

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = presignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid upload request" },
      { status: 400 }
    );
  }

  const check = checkUpload({ size: parsed.data.size, usedBytes: await getBoardUsageBytes(user.id) });
  if (!check.ok) return uploadLimitResponse(check);

  const driver = getStorageDriver();
  const storageKey = buildStorageKey(user.id, parsed.data.filename);
  const prepared = await driver.prepareUpload({
    storageKey,
    contentType: parsed.data.contentType,
    size: parsed.data.size,
  });

  return NextResponse.json(prepared);
}
