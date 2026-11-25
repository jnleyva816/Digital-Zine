import { NextResponse } from "next/server";
import sharp from "sharp";
import { getAuthenticatedUser } from "@/lib/auth";
import { publicZinePath } from "@/lib/public-zine-path";
import { renderZinePdfBuffer, type PdfRenderedPageItem } from "@/lib/pdf-zine";
import { readImageSize } from "@/lib/media/variants";
import { parsePdfSettings } from "@/lib/pdf-settings";
import { cropPixels, parsePhotoEdit, type PhotoEdit } from "@/lib/photo-edit";
import { prisma } from "@/lib/prisma";
import { limitRequest } from "@/lib/rate-limit";
import { mapLimit } from "@/lib/concurrency";
import { readLocalObject } from "@/lib/storage/local";
import { parseExif, parsePageContent, parseRecipe } from "@/lib/types";

export const runtime = "nodejs";

const REMOTE_IMAGE_TIMEOUT_MS = 10_000;

/**
 * Photos decoded at once (DIG-41). A 40MP photo takes a few hundred MB to decode, and a zine can
 * have 60 pages, so they are loaded a couple at a time rather than all together.
 */
const PDF_IMAGE_CONCURRENCY = 2;

/** The copy the PDF prints: 1600 px wide is about 225 dpi on the page (owner, 19 Nov; DIG-41). */
const PDF_WIDTH = 1600;

async function readStored(storageKey: string, publicUrl: string): Promise<Buffer | null> {
  const local = await readLocalObject(storageKey);
  if (local) return local.bytes;
  if (publicUrl.startsWith("https://")) {
    const res = await fetch(publicUrl, { signal: AbortSignal.timeout(REMOTE_IMAGE_TIMEOUT_MS) });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
  }
  return null;
}

/**
 * Loads a page's photo as JPEG bytes, or null if it cannot be read. Local files are read by
 * storage key. Only absolute https URLs (the S3 driver's public URLs, stored at upload time) are
 * fetched; nothing is ever fetched from a host taken from the request.
 */
async function loadPageImage(storageKey: string, publicUrl: string, edit: PhotoEdit | null): Promise<Buffer | null> {
  try {
    // A processed photo prints from its 1600 px copy. Photos narrower than that have no such
    // copy, and older photos are a single JPEG, so both fall back to the stored file.
    const sized = (s: string) => s.replace(/\/full\.avif$/, `/w${PDF_WIDTH}.avif`);
    let raw: Buffer | null = null;
    if (storageKey.endsWith("/full.avif")) raw = await readStored(sized(storageKey), sized(publicUrl));
    raw ??= await readStored(storageKey, publicUrl);
    if (!raw) return null;
    const upright = await sharp(raw).rotate().toBuffer();
    if (!edit) return await sharp(upright).jpeg({ quality: 88 }).toBuffer();

    // The same crop the web shows (DIG-33), from the image's real size, then the frame.
    const size = await readImageSize(upright);
    if (!size) return null;
    const { extract, border } = cropPixels(edit, size);
    let pipeline = sharp(upright).extract(extract);
    if (border) {
      pipeline = pipeline.extend({ top: border.top, right: border.right, bottom: border.bottom, left: border.left, background: border.color });
    }
    return await pipeline.jpeg({ quality: 88 }).toBuffer();
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

  // Each export is CPU-heavy (DIG-28).
  const limited = await limitRequest("pdf", user.id);
  if (limited) return limited;

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

  // No style is ever guessed (owner, 19 Nov; DIG-64).
  const settings = parsePdfSettings(zine.pdfSettings);
  if (!settings) {
    return NextResponse.json(
      { error: "Choose a template and paper size for this zine's PDF first.", code: "STYLE_REQUIRED" },
      { status: 409 }
    );
  }

  const pageContents = zine.pages.map((page) => ({ page, content: parsePageContent(page.content) }));
  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: pageContents.map((p) => p.content.assetId).filter(Boolean) }, ownerId: user.id },
  });
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  const loaded = await mapLimit(pageContents, PDF_IMAGE_CONCURRENCY, async ({ page, content }) => {
      const asset = assetMap.get(content.assetId);
      if (!asset) return null;
      const edit = parsePhotoEdit(asset.edit);
      const image = await loadPageImage(asset.storageKey, asset.publicUrl, edit);
      if (!image) return null;
      return {
        caption: content.caption?.trim() ?? "",
        flipEnabled: page.flipEnabled,
        assetKind: asset.kind,
        imageSrc: { data: image, format: "jpg" as const },
        // An edited photo is already cropped and framed, so it is printed whole.
        imageFit: edit ? ("contain" as const) : ("cover" as const),
        exif: parseExif(asset.exif),
        recipe: parseRecipe(asset.recipe),
      };
  });
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
      path: publicZinePath(user.publicId, zine.slug),
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
