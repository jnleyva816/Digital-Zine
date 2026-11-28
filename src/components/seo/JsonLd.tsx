import { serializeJsonLd } from "@/lib/site/structured-data";

/**
 * A structured-data block for search engines (DIG-106). Browsers treat `application/ld+json` as data,
 * not script, so the Content Security Policy neither needs a nonce for it nor blocks it.
 */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
