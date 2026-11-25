import type { MetadataRoute } from "next";
import { AI_TRAINING_CRAWLERS, PRIVATE_PATHS } from "@/lib/seo";
import { siteUrl } from "@/lib/site";

/**
 * robots.txt (DIG-106). Search crawlers may read the public site; the signed-in and transactional
 * areas are off limits to everyone; AI-training crawlers are turned away entirely.
 *
 * If Cloudflare's managed robots.txt is on, it adds its own AI-crawler rules ahead of these. They say
 * the same thing, so the two agree rather than one hiding the other.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS] },
      ...AI_TRAINING_CRAWLERS.map((userAgent) => ({ userAgent, disallow: "/" })),
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
