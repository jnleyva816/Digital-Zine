import React from "react";
import {
  Document,
  Image as PdfImage,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { ExifData, RecipeData } from "@/lib/types";

export interface PdfRenderedPageItem {
  pageNumber: number;
  caption: string;
  flipEnabled: boolean;
  assetKind: "photo" | "recipe";
  imageSrc: { data: Buffer; format: "jpg" | "png" } | string;
  exif: ExifData | null;
  recipe: RecipeData | null;
}

export interface PdfZinePayload {
  title: string;
  description: string | null;
  authorName: string;
  slug: string;
  publishedAt: string;
  pages: PdfRenderedPageItem[];
}

const styles = StyleSheet.create({
  coverPage: {
    backgroundColor: "#161412",
    color: "#FDFBF7",
    padding: 54,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  kicker: {
    fontSize: 9,
    letterSpacing: 2.5,
    textTransform: "uppercase",
    color: "#D94E28",
    marginBottom: 14,
  },
  coverTitle: {
    fontSize: 34,
    fontFamily: "Times-Roman",
    lineHeight: 1.2,
    marginBottom: 16,
  },
  coverDescription: {
    fontSize: 12,
    color: "#DDD0B6",
    lineHeight: 1.55,
    maxWidth: 400,
  },
  coverFooter: {
    borderTopWidth: 1,
    borderTopColor: "#3D3730",
    paddingTop: 16,
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 9,
    color: "#DDD0B6",
  },
  platePage: {
    backgroundColor: "#FDFBF7",
    color: "#161412",
    padding: 36,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  pageHeader: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    fontSize: 8.5,
    color: "#6E655B",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  imageFrame: {
    width: "100%",
    height: 430,
    backgroundColor: "#161412",
    overflow: "hidden",
    marginBottom: 14,
  },
  plateImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  caption: {
    fontSize: 11.5,
    fontFamily: "Times-Italic",
    color: "#26221E",
    lineHeight: 1.45,
    marginBottom: 12,
  },
  reverseBox: {
    borderTopWidth: 1,
    borderTopColor: "#DDD0B6",
    paddingTop: 12,
    marginTop: "auto",
  },
  reverseHeading: {
    fontSize: 8,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: "#D94E28",
    marginBottom: 6,
  },
  exifGrid: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  exifCell: {
    marginRight: 18,
    marginBottom: 4,
  },
  exifLabel: {
    fontSize: 7.5,
    color: "#6E655B",
    textTransform: "uppercase",
  },
  exifValue: {
    fontSize: 9.5,
    color: "#161412",
    fontFamily: "Courier",
  },
  recipeTitle: {
    fontSize: 12,
    fontFamily: "Times-Bold",
    marginBottom: 6,
    color: "#161412",
  },
  recipeColumns: {
    display: "flex",
    flexDirection: "row",
    gap: 16,
  },
  recipeColLeft: {
    width: "42%",
  },
  recipeColRight: {
    width: "58%",
  },
  subLabel: {
    fontSize: 7.5,
    textTransform: "uppercase",
    color: "#6E655B",
    marginBottom: 4,
    letterSpacing: 1,
  },
  listItem: {
    fontSize: 8.5,
    color: "#26221E",
    lineHeight: 1.4,
    marginBottom: 2.5,
  },
});

function ZinePdfDocument({ zine }: { zine: PdfZinePayload }) {
  return (
    <Document
      title={zine.title}
      author={zine.authorName}
      subject={zine.description ?? "Digital Zine Edition"}
    >
      <Page size="A4" style={styles.coverPage}>
        <View>
          <Text style={styles.kicker}>Digital Zine · Published Edition</Text>
          <Text style={styles.coverTitle}>{zine.title}</Text>
          {zine.description ? (
            <Text style={styles.coverDescription}>{zine.description}</Text>
          ) : null}
        </View>
        <View style={styles.coverFooter}>
          <Text>By {zine.authorName}</Text>
          <Text>
            {zine.pages.length} {zine.pages.length === 1 ? "Plate" : "Plates"} · /z/
            {zine.slug}
          </Text>
          <Text>{zine.publishedAt}</Text>
        </View>
      </Page>

      {zine.pages.map((p) => {
        const showRecipe =
          p.flipEnabled &&
          (p.assetKind === "recipe" || (!p.exif && Boolean(p.recipe))) &&
          p.recipe;
        const showExif = p.flipEnabled && !showRecipe && p.exif;

        return (
          <Page key={p.pageNumber} size="A4" style={styles.platePage}>
            <View>
              <View style={styles.pageHeader}>
                <Text>{zine.title}</Text>
                <Text>
                  Page {String(p.pageNumber).padStart(2, "0")} /{" "}
                  {String(zine.pages.length).padStart(2, "0")}
                </Text>
              </View>

              <View style={styles.imageFrame}>
                <PdfImage src={p.imageSrc} style={styles.plateImage} />
              </View>

              {p.caption ? <Text style={styles.caption}>{p.caption}</Text> : null}
            </View>

            {showRecipe && p.recipe ? (
              <View style={styles.reverseBox}>
                <Text style={styles.reverseHeading}>
                  Card Reverse · Recipe Notes
                </Text>
                {p.recipe.title ? (
                  <Text style={styles.recipeTitle}>{p.recipe.title}</Text>
                ) : null}
                <View style={styles.recipeColumns}>
                  <View style={styles.recipeColLeft}>
                    <Text style={styles.subLabel}>Ingredients</Text>
                    {(p.recipe.ingredients ?? []).slice(0, 8).map((ing, i) => (
                      <Text key={i} style={styles.listItem}>
                        • {ing}
                      </Text>
                    ))}
                  </View>
                  <View style={styles.recipeColRight}>
                    <Text style={styles.subLabel}>Method</Text>
                    {(p.recipe.method ?? []).slice(0, 6).map((step, i) => (
                      <Text key={i} style={styles.listItem}>
                        {i + 1}. {step}
                      </Text>
                    ))}
                  </View>
                </View>
              </View>
            ) : null}

            {showExif && p.exif ? (
              <View style={styles.reverseBox}>
                <Text style={styles.reverseHeading}>
                  Card Reverse · Camera EXIF
                </Text>
                <View style={styles.exifGrid}>
                  {p.exif.iso ? (
                    <View style={styles.exifCell}>
                      <Text style={styles.exifLabel}>ISO</Text>
                      <Text style={styles.exifValue}>{String(p.exif.iso)}</Text>
                    </View>
                  ) : null}
                  {p.exif.aperture ? (
                    <View style={styles.exifCell}>
                      <Text style={styles.exifLabel}>Aperture</Text>
                      <Text style={styles.exifValue}>{p.exif.aperture}</Text>
                    </View>
                  ) : null}
                  {p.exif.shutterSpeed ? (
                    <View style={styles.exifCell}>
                      <Text style={styles.exifLabel}>Shutter</Text>
                      <Text style={styles.exifValue}>{p.exif.shutterSpeed}</Text>
                    </View>
                  ) : null}
                  {p.exif.focalLength ? (
                    <View style={styles.exifCell}>
                      <Text style={styles.exifLabel}>Focal Length</Text>
                      <Text style={styles.exifValue}>{p.exif.focalLength}</Text>
                    </View>
                  ) : null}
                  {p.exif.cameraModel ? (
                    <View style={styles.exifCell}>
                      <Text style={styles.exifLabel}>Camera</Text>
                      <Text style={styles.exifValue}>
                        {[p.exif.cameraMake, p.exif.cameraModel]
                          .filter(Boolean)
                          .join(" ")}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
          </Page>
        );
      })}
    </Document>
  );
}

export async function renderZinePdfBuffer(
  payload: PdfZinePayload
): Promise<Buffer> {
  return renderToBuffer(<ZinePdfDocument zine={payload} />);
}
