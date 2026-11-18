import { NextResponse } from "next/server";
import sharp from "sharp";
import { getAuthenticatedUser } from "@/lib/auth";
import { renderZinePdfBuffer, type PdfRenderedPageItem } from "@/lib/pdf-zine";
import { prisma } from "@/lib/prisma";
import { readLocalObject } from "@/lib/storage/local";
import { parseExif, parsePageContent, parseRecipe } from "@/lib/types";

export const runtime = "nodejs";

const REMOTE_IMAGE_TIMEOUT_MS = 10_000;

/**
 * Loads a page's photo as JPEG bytes, or null if it cannot be read. Local files are read by
 * storage key. Only absolute https URLs (the S3 driver's public URLs, stored at upload time) are
 * fetched; nothing is ever fetched from a host taken from the request.
 */
async function loadPageImage(storageKey: string, publicUrl: string): Promise<Buffer | null> {
  try {
    let raw: Buffer | null = null;
    const local = await readLocalObject(storageKey);
    if (local) {
      raw = local.bytes;
    } else if (publicUrl.startsWith("https://")) {
      const res = await fetch(publicUrl, { signal: AbortSignal.timeout(REMOTE_IMAGE_TIMEOUT_MS) });
      if (res.ok) raw = Buffer.from(await res.arrayBuffer());
    }
    if (!raw) return null;
    return await sharp(raw).rotate().jpeg({ quality: 88 }).toBuffer();
  } catch (error) {
    console.error(`PDF export: could not load image ${storageKey}`, error);
    return null;
  }
}

export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in with a Pro account ($15/month) to export PDF editions.", code: "AUTH_REQUIRED" },
      { status: 401 }
    );
  }

  if (user.tier !== "pro") {
    return NextResponse.json(
      {
        error: "PDF export is a Pro feature ($15/month). Upgrade in Billing to download your published zines.",
        code: "PRO_REQUIRED",
      },
      { status: 403 }
    );
  }

  const { slug } = await context.params;
  // Owner-only: someone else's zine is indistinguishable from a missing one.
  const zine = await prisma.zine.findFirst({
    where: { slug, published: true, ownerId: user.id },
    include: {
      owner: { select: { name: true } },
      pages: { orderBy: { pageNumber: "asc" } },
    },
  });

  if (!zine) {
    return NextResponse.json(
      { error: "Published zine not found. Publish the zine before exporting a PDF." },
      { status: 404 }
    );
  }

  const pageContents = zine.pages.map((page) => ({ page, content: parsePageContent(page.content) }));
  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: pageContents.map((p) => p.content.assetId).filter(Boolean) }, ownerId: user.id },
  });
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  const loaded = await Promise.all(
    pageContents.map(async ({ page, content }) => {
      const asset = assetMap.get(content.assetId);
      if (!asset) return null;
      const image = await loadPageImage(asset.storageKey, asset.publicUrl);
      if (!image) return null;
      return {
        caption: content.caption?.trim() ?? "",
        flipEnabled: page.flipEnabled,
        assetKind: asset.kind,
        imageSrc: { data: image, format: "jpg" as const },
        exif: parseExif(asset.exif),
        recipe: parseRecipe(asset.recipe),
      };
    })
  );
  // Number the pages that made it, so the PDF never shows gaps.
  const pages: PdfRenderedPageItem[] = loaded
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p, i) => ({ ...p, pageNumber: i + 1 }));

  let pdf: Buffer;
  try {
    pdf = await renderZinePdfBuffer({
      title: zine.title,
      description: zine.description,
      authorName: zine.owner.name?.trim() || null,
      slug: zine.slug,
      publishedAt: (zine.publishedAt ?? zine.updatedAt).toISOString().slice(0, 10),
      pages,
    });
  } catch (error) {
    console.error(`PDF export failed for zine ${zine.id}`, error);
    return NextResponse.json({ error: "The PDF could not be generated. Try again in a moment." }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${zine.slug}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
