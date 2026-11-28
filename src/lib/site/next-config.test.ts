import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

describe("next.config image settings (DIG-46)", () => {
  it("serves every image through our own loader", () => {
    expect(nextConfig.images?.loader).toBe("custom");
    expect(nextConfig.images?.loaderFile).toBe("./src/lib/site/image-loader.ts");
  });

  it("never lets Next's image optimizer fetch from any host", () => {
    // With the custom loader these do nothing; if the loader were ever switched off, a wildcard
    // would let anyone use the server to fetch and resize images from any site.
    const patterns = nextConfig.images?.remotePatterns ?? [];
    expect(patterns.filter((p) => !(p instanceof URL) && (p.hostname === "**" || p.hostname === "*"))).toEqual([]);
  });
});
