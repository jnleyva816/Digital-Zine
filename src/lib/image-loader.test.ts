import { afterEach, describe, expect, it, vi } from "vitest";
import zineImageLoader from "./image-loader";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("zineImageLoader", () => {
  it("appends width and quality hints when no CDN is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGE_CDN_URL", "");
    expect(zineImageLoader({ src: "/api/media/a.jpg", width: 640 })).toBe("/api/media/a.jpg?w=640&q=82");
    expect(zineImageLoader({ src: "/api/media/a.jpg?v=2", width: 320, quality: 60 })).toBe(
      "/api/media/a.jpg?v=2&w=320&q=60"
    );
  });

  it("routes through the CDN with an encoded source URL", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGE_CDN_URL", "https://cdn.example.com/img/");
    expect(zineImageLoader({ src: "/api/media/a b.jpg", width: 640, quality: 75 })).toBe(
      "https://cdn.example.com/img?url=%2Fapi%2Fmedia%2Fa%20b.jpg&w=640&q=75"
    );
  });
});
