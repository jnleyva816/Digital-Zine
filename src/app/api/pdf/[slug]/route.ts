import { NextResponse } from "next/server";
import sharp from "sharp";
import { getAuthenticatedUser } from "@/lib/auth";
import { renderMiniZinePdfBuffer, renderZinePdfBuffer, type PdfRenderedPageItem } from "@/lib/pdf-zine";
import { readImageSize } from "@/lib/media/variants";
import { duotone } from "@/lib/media/duotone";
import { MINI_PHOTO_MINIMUM, miniPalette, pickMiniPages } from "@/lib/mini-zine";
import { PALETTES, parsePdfSettings } from "@/lib/pdf-settings";
import { publicZinePath } from "@/lib/public-zine-path";
import { absoluteUrl } from "@/lib/site";
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

const proRequired = () =>
  NextResponse.json(
    {
      error: "PDF export is a Pro feature ($15/month). Upgrade in Billing to download your published zines.",
      code: "PRO_REQUIRED",
    },
    { status: 403 }
  );

/** `?format=` picks the booklet (Pro) or the one-sheet mini zine (free; DIG-73). Without it, the zine's saved format. */
export async function GET(req: Request, context: { params: Promise<{ slug: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to export PDF editions.", code: "AUTH_REQUIRED" },
      { status: 401 }
    );
  }

  const asked = new URL(req.url).searchParams.get("format");
  if (asked !== null && asked !== "booklet" && asked !== "mini") {
    return NextResponse.json({ error: "Choose the booklet or the mini zine." }, { status: 400 });
  }
  if (asked === "booklet" && user.tier !== "pro") return proRequired();

  // Each export is CPU-heavy (DIG-28).
  const limited = await limitRequest("pdf", user.id);
  if (limited) return limited;

  const { slug } = await context.params;
  // Owner-only: someone else's zine is indistinguishable from a missing one.
  const zine = await prisma.zine.findFirst({
    where: { slug, published: true, ownerId: user.id },
    include: {
      owner: { select: { name: true, publicId: true } },
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
  const mini = (asked ?? settings?.format) === "mini";
  if (!mini && user.tier !== "pro") return proRequired();
  if (!settings) {
    return NextResponse.json(
      { error: "Choose a template and paper size for this zine's PDF first.", code: "STYLE_REQUIRED" },
      { status: 409 }
    );
  }

  const allPages = zine.pages.map((page) => ({ page, content: parsePageContent(page.content) }));
  const pageContents = mini ? pickMiniPages(allPages, (p) => p.content.assetId, settings.miniPhotos) : allPages;
  // The chosen cover photo, which a mini zine may not have inside (DIG-126). It must be on one of the zine's pages.
  const { cover } = settings;
  const usesPhoto = cover.photo !== null && (cover.style === "full" || cover.style === "template");
  const coverContent = usesPhoto ? allPages.find((p) => p.content.assetId === cover.photo) : undefined;
  const extra = coverContent && !pageContents.includes(coverContent) ? [coverContent] : [];
  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: [...pageContents, ...extra].map((p) => p.content.assetId).filter(Boolean) }, ownerId: user.id },
  });
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  // Riso prints every photo in the palette's two inks (DIG-69).
  const { text: ink1, accent: ink2, page: paper } = mini ? miniPalette(settings) : PALETTES[settings.palette];
  const ink = (image: Buffer) => (settings.template === "riso" ? duotone(image, { ink1, ink2, paper }) : image);

  const loaded = await mapLimit([...pageContents, ...extra], PDF_IMAGE_CONCURRENCY, async ({ page, content }) => {
      const asset = assetMap.get(content.assetId);
      if (!asset) return null;
      const edit = parsePhotoEdit(asset.edit);
      const image = await loadPageImage(asset.storageKey, asset.publicUrl, edit);
      if (!image) return null;
      return {
        name: asset.name?.trim() || null,
        caption: content.caption?.trim() ?? "",
        imageSrc: { data: await ink(image), format: "jpg" as const },
        // An edited photo is already cropped and framed, so it is printed whole.
        imageFit: edit ? ("contain" as const) : ("cover" as const),
        // A card that does not flip has no back, on screen or on paper.
        exif: page.flipEnabled ? parseExif(asset.exif) : null,
        recipe: page.flipEnabled ? parseRecipe(asset.recipe) : null,
      };
  });
  // Number the pages that made it, so the PDF never shows gaps.
  const inside = loaded.slice(0, pageContents.length);
  const pages: PdfRenderedPageItem[] = inside
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p, i) => ({ ...p, pageNumber: i + 1 }));
  const found = coverContent && loaded[extra.length ? pageContents.length : pageContents.indexOf(coverContent)];
  // As numbered inside, where it is there too; a cover photo that cannot be read gives way to the first.
  const coverPhoto = found ? (pages.find((p) => p.imageSrc === found.imageSrc) ?? { ...found, pageNumber: 0 }) : null;

  if (mini && pages.length < MINI_PHOTO_MINIMUM) {
    return NextResponse.json(
      { error: `A mini zine needs at least ${MINI_PHOTO_MINIMUM} photos. Add more pages or choose more photos.`, code: "MINI_PHOTOS_REQUIRED" },
      { status: 409 }
    );
  }

  let pdf: Buffer;
  try {
    const payload = {
      title: zine.title,
      description: zine.description,
      authorName: zine.owner.name?.trim() || null,
      publishedAt: (zine.publishedAt ?? zine.updatedAt).toISOString(),
      pages,
      coverPhoto,
      settings,
    };
    pdf = mini
      ? await renderMiniZinePdfBuffer({ ...payload, publicUrl: absoluteUrl(publicZinePath(zine.owner.publicId, zine.slug)) })
      : await renderZinePdfBuffer(payload);
  } catch (error) {
    console.error(`PDF export failed for zine ${zine.id}`, error);
    return NextResponse.json({ error: "The PDF could not be generated. Try again in a moment." }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${zine.slug}${mini ? "-mini" : ""}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
