import { afterEach, describe, expect, it, vi } from "vitest";
import zineImageLoader from "./image-loader";
import { withSourceWidth } from "@/lib/media/variant-urls";

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

  it("loads the smallest processed copy wide enough, instead of the full-resolution one (DIG-26)", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGE_CDN_URL", "");
    expect(zineImageLoader({ src: "/api/media/users/u/x/full.avif", width: 640 })).toBe(
      "/api/media/users/u/x/w960.avif?w=640&q=82"
    );
    expect(zineImageLoader({ src: "https://b.s3.example/users/u/x/full.avif", width: 3840 })).toBe(
      "https://b.s3.example/users/u/x/full.avif?w=3840&q=82"
    );
  });

  // DIG-110: the page tells the loader how wide the photo is, so it never asks for a copy that was never made.
  it("falls back to the full copy instead of a width the photo is too small to have", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGE_CDN_URL", "");
    // A 750 px photo has only a 480 px copy. 640 px of screen is more than that.
    expect(zineImageLoader({ src: withSourceWidth("/api/media/users/u/x/full.avif", 750), width: 640 })).toBe(
      "/api/media/users/u/x/full.avif?w=640&q=82"
    );
    // A 1104 px photo has no 1600 px copy.
    expect(zineImageLoader({ src: withSourceWidth("https://b.s3.example/u/x/full.avif", 1104), width: 1200 })).toBe(
      "https://b.s3.example/u/x/full.avif?w=1200&q=82"
    );
    expect(zineImageLoader({ src: withSourceWidth("https://b.s3.example/u/x/full.avif", 1104), width: 900 })).toBe(
      "https://b.s3.example/u/x/w960.avif?w=900&q=82"
    );
  });

  it("never sends the width tag to the server or the CDN", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGE_CDN_URL", "");
    expect(zineImageLoader({ src: withSourceWidth("/api/media/u/x/full.avif", 750), width: 320 })).not.toContain("#");
    vi.stubEnv("NEXT_PUBLIC_IMAGE_CDN_URL", "https://cdn.example.com/img");
    const url = zineImageLoader({ src: withSourceWidth("/api/media/u/x/full.avif", 750), width: 320, quality: 75 });
    expect(url).toBe("https://cdn.example.com/img?url=%2Fapi%2Fmedia%2Fu%2Fx%2Fw480.avif&w=320&q=75");
  });

  it("sends the chosen processed copy through the CDN when one is configured (DIG-26)", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGE_CDN_URL", "https://cdn.example.com/img");
    expect(zineImageLoader({ src: "/api/media/u/x/full.avif", width: 400, quality: 75 })).toBe(
      "https://cdn.example.com/img?url=%2Fapi%2Fmedia%2Fu%2Fx%2Fw480.avif&w=400&q=75"
    );
  });
});
