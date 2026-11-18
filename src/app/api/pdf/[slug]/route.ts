import { NextResponse } from "next/server";
import sharp from "sharp";
import { getAuthenticatedUser } from "@/lib/auth";
import { renderZinePdfBuffer, type PdfRenderedPageItem } from "@/lib/pdf-zine";
import { prisma } from "@/lib/prisma";
import { readLocalObject } from "@/lib/storage/local";
import { parseExif, parsePageContent, parseRecipe } from "@/lib/types";

export const runtime = "nodejs";

async function resolvePdfImageSource(
  storageKey: string,
  publicUrl: string,
  requestOrigin: string
): Promise<{ data: Buffer; format: "jpg" | "png" } | string> {
  const local = await readLocalObject(storageKey);
  if (local) {
    const jpegBytes = await sharp(local.bytes)
      .jpeg({ quality: 88 })
      .toBuffer();
    return { data: jpegBytes, format: "jpg" };
  }

  const absoluteUrl = publicUrl.startsWith("http")
    ? publicUrl
    : `${requestOrigin}${publicUrl}`;
  const res = await fetch(absoluteUrl);
  if (res.ok) {
    const raw = Buffer.from(await res.arrayBuffer());
    const jpegBytes = await sharp(raw).jpeg({ quality: 88 }).toBuffer();
    return { data: jpegBytes, format: "jpg" };
  }
  return absoluteUrl;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json(
      {
        error: "Sign in with a Pro account ($15/month) to export PDF editions.",
        code: "AUTH_REQUIRED",
      },
      { status: 401 }
    );
  }

  if (user.tier !== "pro") {
    return NextResponse.json(
      {
        error:
          "PDF export is gated to the Pro plan ($15/month). Upgrade in Billing to download published zine PDFs.",
        code: "PRO_REQUIRED",
      },
      { status: 403 }
    );
  }

  const { slug } = await context.params;
  const zine = await prisma.zine.findFirst({
    where: {
      slug,
      published: true,
    },
    include: {
      owner: {
        select: { name: true, email: true },
      },
      pages: {
        orderBy: { pageNumber: "asc" },
      },
    },
  });

  if (!zine) {
    return NextResponse.json(
      { error: "Published zine not found. Publish the zine before exporting PDF." },
      { status: 404 }
    );
  }

  const pageContents = zine.pages.map((p) => ({
    page: p,
    content: parsePageContent(p.content),
  }));
  const assetIds = [
    ...new Set(pageContents.map((item) => item.content.assetId).filter(Boolean)),
  ];

  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: assetIds } },
  });
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  const origin = new URL(req.url).origin;
  const renderedPages: PdfRenderedPageItem[] = [];

  for (const { page, content } of pageContents) {
    const asset = assetMap.get(content.assetId);
    if (!asset) continue;

    const imageSrc = await resolvePdfImageSource(
      asset.storageKey,
      asset.publicUrl,
      origin
    );

    renderedPages.push({
      pageNumber: page.pageNumber,
      caption: content.caption ?? "",
      flipEnabled: page.flipEnabled,
      assetKind: asset.kind,
      imageSrc,
      exif: parseExif(asset.exif),
      recipe: parseRecipe(asset.recipe),
    });
  }

  const pdfBuffer = await renderZinePdfBuffer({
    title: zine.title,
    description: zine.description,
    authorName: zine.owner.name ?? zine.owner.email,
    slug: zine.slug,
    publishedAt: (zine.publishedAt ?? zine.updatedAt)
      .toISOString()
      .slice(0, 10),
    pages: renderedPages,
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${zine.slug}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
