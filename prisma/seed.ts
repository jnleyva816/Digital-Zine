import bcrypt from "bcryptjs";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { writeLocalObject } from "../src/lib/storage/local";
import { ZINE_TEMPLATE_ID } from "../src/lib/types";

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
  recipe?: {
    title: string;
    servings: string;
    prepTime: string;
    ingredients: string[];
    method: string[];
  };
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

const SEED_PLATES: SeedPlateSpec[] = [
  {
    storageKey: "seed/plate-01-charred-persimmon.jpg",
    originalName: "DSC_0412-charred-persimmon.jpg",
    kind: "recipe",
    palette: {
      bgTop: "#2B1810",
      bgBottom: "#120B08",
      accentA: "#D95D24",
      accentB: "#8E2C12",
      highlight: "#F4A259",
      plateLabel: "TEST KITCHEN · AUTUMN TABLE",
      subjectTitle: "Charred Persimmon & Cultured Butter Toast",
      frameCode: "KODAK PORTRA 400 · FRAME 04A",
    },
    exif: {
      iso: "400",
      aperture: "f/2.8",
      shutterSpeed: "1/250s",
      focalLength: "50mm",
      cameraMake: "Fujifilm",
      cameraModel: "GFX 50S II",
      lens: "GF 50mm f/3.5 R LM WR",
      takenAt: "2026-10-19 16:42:11",
      rawExifIfd: {
        IFD0: { Make: "Fujifilm", Model: "GFX 50S II" },
        IFD2: {
          ISOSpeedRatings: "400",
          PhotographicSensitivity: "400",
          FNumber: "2.8",
          ExposureTime: "0.004",
          FocalLength: "50",
          LensModel: "GF 50mm f/3.5 R LM WR",
        },
      },
    },
    recipe: {
      title: "Charred Persimmon & Brown-Butter Brioche",
      servings: "2 plates",
      prepTime: "18 mins",
      ingredients: [
        "2 ripe Fuyu persimmons, cut into thick 1cm wedges",
        "2 thick slices country sourdough or toasted brioche",
        "60g salted cultured butter, whipped to room temp",
        "1 tbsp wildflower honey + 1 tsp toasted fennel seeds",
        "Flaky sea salt & cracked Tellicherry black pepper",
      ],
      method: [
        "Heat a dry cast-iron skillet until smoking hot; sear persimmon wedges 90 seconds per side until blistered at the edges.",
        "Toast the bread in foaming brown butter until deep mahogany and crisp.",
        "Swipe generous ribbons of cold cultured butter across warm toast and shingle the charred persimmons on top.",
        "Warm honey briefly with crushed fennel seeds, spoon over fruit, and finish with flaky salt.",
      ],
    },
    caption:
      "Late-afternoon sun across cast iron: blistered Fuyu persimmons over cold cultured butter.",
    flipEnabled: true,
  },
  {
    storageKey: "seed/plate-02-morning-cellar.jpg",
    originalName: "L1004882-morning-cellar.jpg",
    kind: "photo",
    palette: {
      bgTop: "#1C242B",
      bgBottom: "#0D1115",
      accentA: "#5B7B8C",
      accentB: "#293845",
      highlight: "#D4DFC7",
      plateLabel: "NORTH WINDOW · STONEWARE CROCKS",
      subjectTitle: "Six-Week White Miso & Koji Jar Study",
      frameCode: "LEICA M11 · SUMMILUX 35 · 11A",
    },
    exif: {
      iso: "200",
      aperture: "f/2.0",
      shutterSpeed: "1/500s",
      focalLength: "35mm",
      cameraMake: "Leica",
      cameraModel: "LEICA M11",
      lens: "APO-Summicron-M 35mm f/2 ASPH",
      takenAt: "2026-10-20 08:14:05",
      rawExifIfd: {
        IFD0: { Make: "Leica", Model: "LEICA M11" },
        IFD2: {
          ISOSpeedRatings: "200",
          PhotographicSensitivity: "200",
          FNumber: "2.0",
          ExposureTime: "0.002",
          FocalLength: "35",
          LensModel: "APO-Summicron-M 35mm f/2 ASPH",
        },
      },
    },
    caption:
      "Stoneware fermentation crocks lined along the north studio sill at 8:14 AM.",
    flipEnabled: true,
  },
  {
    storageKey: "seed/plate-03-smoked-chili-oil.jpg",
    originalName: "DSC_0519-smoked-chili-crisp.jpg",
    kind: "recipe",
    palette: {
      bgTop: "#331210",
      bgBottom: "#140706",
      accentA: "#C8371E",
      accentB: "#6B160B",
      highlight: "#F2B84B",
      plateLabel: "PANTRY STAPLE · SMALL BATCH",
      subjectTitle: "Smoked Urfa & Black Cardamom Chili Crisp",
      frameCode: "RICOH GR IIIx · 40MM EQUIV · 19B",
    },
    exif: {
      iso: "800",
      aperture: "f/4.0",
      shutterSpeed: "1/125s",
      focalLength: "40mm",
      cameraMake: "Ricoh",
      cameraModel: "GR IIIx",
      lens: "GR Lens 26.1mm f/2.8",
      takenAt: "2026-10-21 19:08:44",
      rawExifIfd: {
        IFD0: { Make: "Ricoh", Model: "GR IIIx" },
        IFD2: {
          ISOSpeedRatings: "800",
          PhotographicSensitivity: "800",
          FNumber: "4.0",
          ExposureTime: "0.008",
          FocalLength: "40",
          LensModel: "GR Lens 26.1mm f/2.8",
        },
      },
    },
    recipe: {
      title: "Smoked Urfa & Black Cardamom Chili Crisp",
      servings: "1 pint jar",
      prepTime: "25 mins",
      ingredients: [
        "220ml neutral cold-pressed rapeseed or peanut oil",
        "3 shallots & 6 cloves garlic, sliced paper-thin on a mandoline",
        "3 tbsp Turkish Urfa biber flakes + 2 tbsp Gochugaru",
        "2 bruised black cardamom pods & 1 star anise",
        "1 tbsp toasted white sesame seeds, 1 tsp soy sauce, pinch cane sugar",
      ],
      method: [
        "Combine shallots, garlic, cardamom pods, and star anise with cold oil in a saucepan; bring gently to 155C until golden and crisp.",
        "Strain crisped aromatics immediately, reserving them on a wire rack while chili flakes wait in a heatproof stoneware bowl.",
        "Pour hot spiced oil over Urfa biber, Gochugaru, and sesame seeds so they sizzle without scorching.",
        "Once cooled to lukewarm, fold crisped shallots and garlic back in with soy sauce and sugar.",
      ],
    },
    caption:
      "Infusing smoky Urfa biber and toasted sesame at 155C before folding back crisp shallots.",
    flipEnabled: true,
  },
  {
    storageKey: "seed/plate-04-closing-linen.jpg",
    originalName: "DSC_0604-closing-linen.jpg",
    kind: "photo",
    palette: {
      bgTop: "#2A261F",
      bgBottom: "#14120F",
      accentA: "#9C8B6E",
      accentB: "#4A4133",
      highlight: "#EFE6D5",
      plateLabel: "COLOPHON · QUIET PLATE (NO FLIP)",
      subjectTitle: "Washed Linen & Cedar Tea Tray at Dusk",
      frameCode: "NIKON Zf · NIKKOR 40MM · 36END",
    },
    exif: {
      iso: "640",
      aperture: "f/2.2",
      shutterSpeed: "1/160s",
      focalLength: "40mm",
      cameraMake: "Nikon",
      cameraModel: "NIKON Zf",
      lens: "NIKKOR Z 40mm f/2",
      takenAt: "2026-10-21 20:15:00",
      rawExifIfd: {
        IFD0: { Make: "Nikon", Model: "NIKON Zf" },
        IFD2: {
          ISOSpeedRatings: "640",
          PhotographicSensitivity: "640",
          FNumber: "2.2",
          ExposureTime: "0.00625",
          FocalLength: "40",
          LensModel: "NIKKOR Z 40mm f/2",
        },
      },
    },
    caption:
      "Closing spread — flip intentionally disabled on this quiet colophon plate.",
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
    },
    create: {
      email: "creator@digitalzine.local",
      name: "Maya Lin",
      passwordHash,
      tier: "free",
      subscriptionStatus: "inactive",
    },
  });

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
    where: { slug: "sunday-ferments-issue-01" },
    update: {
      ownerId: devUser.id,
      title: "Sunday Ferments — Issue 01",
      description:
        "Field notes, medium-format exposures, and late-autumn pantry recipes drafted from the studio kitchen.",
      published: true,
      publishedAt: new Date("2026-10-22T09:00:00Z"),
    },
    create: {
      ownerId: devUser.id,
      title: "Sunday Ferments — Issue 01",
      slug: "sunday-ferments-issue-01",
      description:
        "Field notes, medium-format exposures, and late-autumn pantry recipes drafted from the studio kitchen.",
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
    `Seeded user ${devUser.email} (tier=${devUser.tier}), ${createdAssets.length} Vision Board assets, and published zine /z/${zine.slug}`
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
