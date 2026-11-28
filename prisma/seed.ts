import bcrypt from "bcryptjs";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { writeLocalObject } from "../src/lib/storage/local";
import { ZINE_TEMPLATE_ID } from "../src/lib/zine/types";
import { getOrCreateDefaultBoard } from "../src/lib/board/boards";
import type { FujiRecipe } from "../src/lib/fuji/fuji-recipe";

const prisma = new PrismaClient();

interface SeedPlateSpec {
  storageKey: string;
  originalName: string;
  kind: "photo" | "recipe";
  palette: {
    bgTop: string;
    bgBottom: string;
    accentA: string;
    accentB: string;
    highlight: string;
    plateLabel: string;
    subjectTitle: string;
    frameCode: string;
  };
  exif: {
    iso: string;
    aperture: string;
    shutterSpeed: string;
    focalLength: string;
    cameraMake: string;
    cameraModel: string;
    lens: string;
    takenAt: string;
    rawExifIfd: {
      IFD0: Record<string, string>;
      IFD2: Record<string, string>;
    };
  };
  /** A Fujifilm film-simulation recipe (DIG-22). */
  recipe?: FujiRecipe;
  caption: string;
  flipEnabled: boolean;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function renderEditorialPlateJpeg(spec: SeedPlateSpec): Promise<Buffer> {
  const { bgTop, bgBottom, accentA, accentB, highlight, plateLabel, subjectTitle, frameCode } =
    spec.palette;

  const svg = `
  <svg width="1200" height="1500" viewBox="0 0 1200 1500" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0.8" y2="1">
        <stop offset="0%" stop-color="${bgTop}" />
        <stop offset="100%" stop-color="${bgBottom}" />
      </linearGradient>
      <radialGradient id="glowA" cx="62%" cy="42%" r="48%">
        <stop offset="0%" stop-color="${accentA}" stop-opacity="0.85" />
        <stop offset="65%" stop-color="${accentB}" stop-opacity="0.32" />
        <stop offset="100%" stop-color="${bgBottom}" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="rim" cx="46%" cy="54%" r="34%">
        <stop offset="0%" stop-color="${highlight}" stop-opacity="0.92" />
        <stop offset="55%" stop-color="${accentA}" stop-opacity="0.55" />
        <stop offset="100%" stop-color="${bgBottom}" stop-opacity="0.05" />
      </radialGradient>
      <linearGradient id="tableLine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.04" />
        <stop offset="50%" stop-color="#ffffff" stop-opacity="0.22" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.04" />
      </linearGradient>
    </defs>

    <rect width="1200" height="1500" fill="url(#bg)" />
    <rect width="1200" height="1500" fill="url(#glowA)" />

    <!-- Architectural studio window shadow bars -->
    <polygon points="0,180 1200,40 1200,220 0,380" fill="#000000" fill-opacity="0.16" />
    <polygon points="0,520 1200,360 1200,490 0,660" fill="#000000" fill-opacity="0.12" />

    <!-- Ceramic vessel / tactile tabletop still-life silhouette -->
    <ellipse cx="600" cy="1030" rx="410" ry="96" fill="#090807" fill-opacity="0.42" />
    <ellipse cx="600" cy="830" rx="330" ry="330" fill="url(#rim)" />
    <circle cx="600" cy="830" r="268" fill="none" stroke="${highlight}" stroke-opacity="0.38" stroke-width="2.5" />
    <circle cx="600" cy="830" r="196" fill="${bgBottom}" fill-opacity="0.34" stroke="#ffffff" stroke-opacity="0.18" stroke-width="1.5" />
    <ellipse cx="545" cy="785" rx="92" ry="64" transform="rotate(-22 545 785)" fill="${highlight}" fill-opacity="0.78" />
    <ellipse cx="662" cy="868" rx="74" ry="52" transform="rotate(18 662 868)" fill="${accentA}" fill-opacity="0.88" />
    <circle cx="615" cy="810" r="24" fill="#FDFBF7" fill-opacity="0.82" />

    <line x1="96" y1="1180" x2="1104" y2="1180" stroke="url(#tableLine)" stroke-width="2" />

    <!-- Subtle 35mm contact-sheet frame markers -->
    <text x="96" y="108" fill="#FDFBF7" fill-opacity="0.68" font-family="monospace" font-size="22" letter-spacing="4">${escapeXml(frameCode)}</text>
    <text x="96" y="1310" fill="#FDFBF7" fill-opacity="0.62" font-family="monospace" font-size="20" letter-spacing="3">${escapeXml(plateLabel)}</text>
    <text x="96" y="1376" fill="#FDFBF7" fill-opacity="0.94" font-family="Georgia, serif" font-size="46">${escapeXml(subjectTitle)}</text>
  </svg>`;

  return sharp(Buffer.from(svg))
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .withExif(spec.exif.rawExifIfd)
    .toBuffer();
}

const fujiExif = (iso: string, aperture: string, exposure: string, shutter: string, focal: string, model: string, lens: string, takenAt: string) => ({
  iso,
  aperture,
  shutterSpeed: shutter,
  focalLength: `${focal}mm`,
  cameraMake: "FUJIFILM",
  cameraModel: model,
  lens,
  takenAt,
  rawExifIfd: {
    IFD0: { Make: "FUJIFILM", Model: model },
    IFD2: {
      ISOSpeedRatings: iso,
      PhotographicSensitivity: iso,
      FNumber: aperture.replace("f/", ""),
      ExposureTime: exposure,
      FocalLength: focal,
      LensModel: lens,
    },
  },
});

const SEED_PLATES: SeedPlateSpec[] = [
  {
    storageKey: "seed/plate-01-harbor-dusk.jpg",
    originalName: "DSCF0412-harbor-dusk.jpg",
    kind: "recipe",
    palette: {
      bgTop: "#2B1810",
      bgBottom: "#120B08",
      accentA: "#D95D24",
      accentB: "#8E2C12",
      highlight: "#F4A259",
      plateLabel: "HARBOR · LAST LIGHT",
      subjectTitle: "Fishing Boats at Golden Hour",
      frameCode: "X-T5 · XF 33MM F1.4 · FRAME 04A",
    },
    exif: fujiExif("400", "f/2.8", "0.004", "1/250s", "33", "X-T5", "XF33mmF1.4 R LM WR", "2026-10-19 16:42:11"),
    recipe: {
      name: "Kodachrome 64",
      filmSimulation: "Classic Chrome",
      dynamicRange: "DR200",
      grain: "Weak, Small",
      colorChrome: "Strong",
      colorChromeFxBlue: "Off",
      whiteBalance: { mode: "Daylight", red: 2, blue: -5 },
      highlight: 0,
      shadow: 0.5,
      color: 2,
      sharpness: 1,
      clarity: 3,
      noiseReduction: -4,
      iso: "Auto up to ISO 6400",
      exposureCompensation: "0 to +2/3",
    },
    caption: "Last light on the harbor: boats tied up and the water going copper.",
    flipEnabled: true,
  },
  {
    storageKey: "seed/plate-02-morning-fog.jpg",
    originalName: "DSCF0488-morning-fog.jpg",
    kind: "photo",
    palette: {
      bgTop: "#1C242B",
      bgBottom: "#0D1115",
      accentA: "#5B7B8C",
      accentB: "#293845",
      highlight: "#D4DFC7",
      plateLabel: "RIDGELINE · 8:14 AM",
      subjectTitle: "Fog Lifting Off the Ridge",
      frameCode: "X100VI · 23MM F2 · FRAME 11A",
    },
    exif: fujiExif("200", "f/5.6", "0.002", "1/500s", "23", "X100VI", "FUJINON 23mm F2", "2026-10-20 08:14:05"),
    caption: "Morning fog lifting off the ridge, shot from the trailhead.",
    flipEnabled: true,
  },
  {
    storageKey: "seed/plate-03-neon-alley.jpg",
    originalName: "DSCF0519-neon-alley.jpg",
    kind: "recipe",
    palette: {
      bgTop: "#331210",
      bgBottom: "#140706",
      accentA: "#C8371E",
      accentB: "#6B160B",
      highlight: "#F2B84B",
      plateLabel: "AFTER RAIN · NIGHT WALK",
      subjectTitle: "Neon Alley After the Rain",
      frameCode: "X-PRO3 · XF 23MM F2 · FRAME 19B",
    },
    exif: fujiExif("3200", "f/2.0", "0.0167", "1/60s", "23", "X-Pro3", "XF23mmF2 R WR", "2026-10-21 21:08:44"),
    recipe: {
      name: "CineStill 800T",
      filmSimulation: "Eterna/Cinema",
      dynamicRange: "DR400",
      grain: "Strong, Large",
      colorChrome: "Off",
      colorChromeFxBlue: "Off",
      whiteBalance: { mode: "Kelvin", kelvin: 3200, red: -6, blue: 4 },
      highlight: 1,
      shadow: 2,
      color: 2,
      sharpness: -2,
      clarity: -3,
      noiseReduction: -4,
      iso: "Auto up to ISO 6400",
      exposureCompensation: "+1/3",
    },
    caption: "Rain still on the pavement, and the signs doing all the lighting.",
    flipEnabled: true,
  },
  {
    storageKey: "seed/plate-04-window-light.jpg",
    originalName: "DSCF0604-window-light.jpg",
    kind: "photo",
    palette: {
      bgTop: "#2A261F",
      bgBottom: "#14120F",
      accentA: "#9C8B6E",
      accentB: "#4A4133",
      highlight: "#EFE6D5",
      plateLabel: "COLOPHON · QUIET PLATE (NO FLIP)",
      subjectTitle: "Window Light on Linen",
      frameCode: "X-E4 · XF 27MM F2.8 · 36END",
    },
    exif: fujiExif("640", "f/2.8", "0.00625", "1/160s", "27", "X-E4", "XF27mmF2.8 R WR", "2026-10-21 20:15:00"),
    caption: "Closing spread. Flip is turned off on this quiet colophon page.",
    flipEnabled: false,
  },
];

async function main() {
  const passwordHash = await bcrypt.hash("zine1234", 10);

  const devUser = await prisma.user.upsert({
    where: { email: "creator@digitalzine.local" },
    update: {
      name: "Maya Lin",
      passwordHash,
      emailVerifiedAt: new Date(),
    },
    create: {
      email: "creator@digitalzine.local",
      name: "Maya Lin",
      passwordHash,
      emailVerifiedAt: new Date(),
      tier: "free",
      subscriptionStatus: "inactive",
    },
  });

  const board = await getOrCreateDefaultBoard(devUser.id, prisma);
  const createdAssets = [];

  for (let i = 0; i < SEED_PLATES.length; i++) {
    const spec = SEED_PLATES[i];
    const jpegBuffer = await renderEditorialPlateJpeg(spec);
    await writeLocalObject(spec.storageKey, jpegBuffer, "image/jpeg");

    const publicUrl = `/api/media/${spec.storageKey}`;
    const { rawExifIfd: _ignored, ...cleanExif } = spec.exif;

    const asset = await prisma.mediaAsset.upsert({
      where: { storageKey: spec.storageKey },
      update: {
        ownerId: devUser.id,
        boardId: board.id,
        publicUrl,
        originalName: spec.originalName,
        mimeType: "image/jpeg",
        kind: spec.kind,
        exif: cleanExif,
        recipe: spec.recipe ?? undefined,
        sortOrder: i,
      },
      create: {
        ownerId: devUser.id,
        boardId: board.id,
        storageKey: spec.storageKey,
        publicUrl,
        originalName: spec.originalName,
        mimeType: "image/jpeg",
        kind: spec.kind,
        exif: cleanExif,
        recipe: spec.recipe ?? undefined,
        sortOrder: i,
      },
    });

    createdAssets.push({ asset, spec });
  }

  const zine = await prisma.zine.upsert({
    where: { ownerId_slug: { ownerId: devUser.id, slug: "golden-hour-field-notes-issue-01" } },
    update: {
      ownerId: devUser.id,
      boardId: board.id,
      title: "Golden Hour Field Notes — Issue 01",
      description:
        "Harbor light, morning fog, and neon after rain, each shot on Fujifilm with the film recipe on the back of the card.",
      published: true,
      publishedAt: new Date("2026-10-22T09:00:00Z"),
    },
    create: {
      ownerId: devUser.id,
      boardId: board.id,
      title: "Golden Hour Field Notes — Issue 01",
      slug: "golden-hour-field-notes-issue-01",
      description:
        "Harbor light, morning fog, and neon after rain, each shot on Fujifilm with the film recipe on the back of the card.",
      published: true,
      publishedAt: new Date("2026-10-22T09:00:00Z"),
    },
  });

  await prisma.zinePage.deleteMany({
    where: { zineId: zine.id },
  });

  for (let i = 0; i < createdAssets.length; i++) {
    const { asset, spec } = createdAssets[i];
    await prisma.zinePage.create({
      data: {
        zineId: zine.id,
        pageNumber: i + 1,
        templateId: ZINE_TEMPLATE_ID,
        content: {
          assetId: asset.id,
          caption: spec.caption,
        },
        flipEnabled: spec.flipEnabled,
      },
    });
  }

  console.log(
    `Seeded user ${devUser.email} (tier=${devUser.tier}), ${createdAssets.length} Vision Board assets, and published zine /z/${devUser.publicId}/${zine.slug}`
  );
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
