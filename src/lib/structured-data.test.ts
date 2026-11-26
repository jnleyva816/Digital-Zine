import { describe, expect, it } from "vitest";
import { landingJsonLd, serializeJsonLd, zineJsonLd } from "./structured-data";
import type { PublicZine } from "./public-zine";

// DIG-106: what search engines read about a zine and about the product. Public data only.
const SITE = "https://folio-digital-zine.app";

function zine(overrides: Partial<PublicZine> = {}): PublicZine {
  return {
    owner: "010ecb05",
    slug: "cars",
    title: "Brine & Light",
    description: "Three plates from the pickling shelf.",
    ownerName: "Mara Ito",
    ownerHandle: null,
    publishedAt: "2026-11-02T12:00:00.000Z",
    pages: [
      {
        pageNumber: 1,
        name: null,
        imageUrl: "/api/media/users/u1/a/full.avif",
        shareImageUrl: "/api/media/users/u1/a/og.jpg",
        blurDataUrl: null,
        edit: null,
        dims: null,
        caption: "Persimmons over coals",
        flipEnabled: true,
        kind: "photo",
        exif: null,
        recipe: null,
      },
    ],
    ...overrides,
  };
}

describe("zineJsonLd", () => {
  it("describes the zine as an image gallery at its public address", () => {
    expect(zineJsonLd(zine(), SITE)).toEqual({
      "@context": "https://schema.org",
      "@type": "ImageGallery",
      name: "Brine & Light",
      description: "Three plates from the pickling shelf.",
      url: `${SITE}/z/010ecb05/cars`,
      datePublished: "2026-11-02T12:00:00.000Z",
      author: { "@type": "Person", name: "Mara Ito" },
      image: `${SITE}/api/media/users/u1/a/og.jpg`,
    });
  });

  it("uses the same fallback description as the share card when the creator wrote none", () => {
    const data = zineJsonLd(zine({ description: null }), SITE);
    expect(data.description).toBe("A digital zine by Mara Ito · 1 page");
  });

  it("leaves out the author, the date, and the image when there are none", () => {
    const data = zineJsonLd(zine({ ownerName: null, publishedAt: null, pages: [] }), SITE);
    expect(data).not.toHaveProperty("author");
    expect(data).not.toHaveProperty("datePublished");
    expect(data).not.toHaveProperty("image");
  });

  it("encodes an address that is not path-safe, as the page does", () => {
    expect(zineJsonLd(zine({ slug: "a b/c" }), SITE).url).toBe(`${SITE}/z/010ecb05/a%20b%2Fc`);
  });

  it("keeps a photo served from another origin as it is", () => {
    const base = zine();
    const data = zineJsonLd(
      zine({ pages: [{ ...base.pages[0], shareImageUrl: "https://cdn.example.com/u1/og.jpg" }] }),
      SITE
    );
    expect(data.image).toBe("https://cdn.example.com/u1/og.jpg");
  });

  it("carries no private data: no email, no internal IDs, no EXIF, no camera settings", () => {
    const base = zine();
    const withPrivate = zine({
      pages: [
        {
          ...base.pages[0],
          exif: { iso: 200, make: "FUJIFILM", gps: { latitude: 1, longitude: 2 } } as never,
          recipe: { filmSimulation: "Classic Chrome" } as never,
        },
      ],
    });
    const json = JSON.stringify(zineJsonLd(withPrivate, SITE));
    expect(json).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
    expect(json).not.toMatch(/email|exif|gps|latitude|FUJIFILM|Classic Chrome|ownerId/i);
  });
});

describe("landingJsonLd", () => {
  const data = landingJsonLd(SITE);
  const nodes = data["@graph"];

  it("is one graph holding a WebSite and an Organization", () => {
    expect(data["@context"]).toBe("https://schema.org");
    expect(nodes.map((n) => n["@type"]).sort()).toEqual(["Organization", "WebSite"]);
  });

  it("names the site and links the organization's logo", () => {
    const site = nodes.find((n) => n["@type"] === "WebSite")!;
    const org = nodes.find((n) => n["@type"] === "Organization")!;
    expect(site).toMatchObject({ name: "Folio", url: `${SITE}/` });
    expect(org).toMatchObject({ name: "Folio", url: `${SITE}/`, logo: `${SITE}/icon-512.png` });
  });

  it("claims no site search, since there is none", () => {
    expect(JSON.stringify(data)).not.toMatch(/SearchAction/);
  });
});

describe("serializeJsonLd", () => {
  it("round-trips to the same data", () => {
    const data = zineJsonLd(zine(), SITE);
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });

  it("cannot be broken out of its script tag by a creator's title", () => {
    const hostile = zine({ title: '</script><script>alert("x")</script> <!-- & \u2028' });
    const out = serializeJsonLd(zineJsonLd(hostile, SITE));
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<!--");
    expect(out).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(out).name).toBe(hostile.title);
  });
});
