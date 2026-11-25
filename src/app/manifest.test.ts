import { describe, expect, it } from "vitest";
import manifest from "./manifest";

// DIG-105: what a phone reads when someone adds the site to the home screen.
describe("web manifest", () => {
  const m = manifest();

  it("names the app and says how it opens", () => {
    expect(m.name).toBe("Folio: Digital Photo Zines");
    expect(m.short_name).toBe("Folio");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
  });

  it("uses the brand's paper and ink colors", () => {
    expect(m.background_color).toBe("#FDFBF7");
    expect(m.theme_color).toBe("#161412");
  });

  it("lists 192 and 512 px icons, both as plain and as maskable", () => {
    const icons = m.icons ?? [];
    for (const sizes of ["192x192", "512x512"]) {
      expect(icons.some((i) => i.sizes === sizes && i.type === "image/png" && i.purpose === "any"), sizes).toBe(true);
      expect(icons.some((i) => i.sizes === sizes && i.purpose === "maskable"), `${sizes} maskable`).toBe(true);
    }
  });

  it("makes no offline promise: no service worker, no related apps", () => {
    expect(m).not.toHaveProperty("serviceworker");
    expect(m).not.toHaveProperty("related_applications");
  });
});
