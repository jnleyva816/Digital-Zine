import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/auth";
import { enqueueProcessing } from "@/lib/media/queue";
import { prisma } from "@/lib/prisma";
import { limitRequest } from "@/lib/infra/rate-limit";

/** Retries a photo whose processing failed (DIG-26). */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await limitRequest("write", user.id);
  if (limited) return limited;

  const { id } = await context.params;
  const existing = await prisma.mediaAsset.findFirst({ where: { id, ownerId: user.id }, select: { status: true } });
  if (!existing) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  // Only flip failed -> processing, so a double click cannot queue the same photo twice.
  const reset = await prisma.mediaAsset.updateMany({
    where: { id, ownerId: user.id, status: "failed" },
    data: { status: "processing", processingError: null },
  });
  if (reset.count === 0) {
    return NextResponse.json({ error: "Only a photo whose processing failed can be retried." }, { status: 409 });
  }

  try {
    await enqueueProcessing(id);
  } catch (error) {
    console.error(`Could not queue processing for ${id}`, error);
    await prisma.mediaAsset.update({
      where: { id },
      data: { status: "failed", processingError: "Processing could not start. Try again." },
    });
    return NextResponse.json({ error: "Processing could not start. Try again." }, { status: 503 });
  }

  const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id } });
  return NextResponse.json({ asset }, { status: 202 });
}
