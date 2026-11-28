import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/site/brand";

/** Lets a phone add the site to its home screen. No service worker, so it makes no promise about offline use (DIG-105). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Folio: Digital Photo Zines",
    short_name: "Folio",
    description: "Collect your photographs on a private board and publish flip-through photo zines.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: BRAND.paper,
    theme_color: BRAND.ink,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
