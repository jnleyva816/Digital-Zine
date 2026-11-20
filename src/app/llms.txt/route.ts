import { siteUrl } from "@/lib/site";

/**
 * /llms.txt (DIG-106), following https://llmstxt.org: a title, a one-paragraph summary, and sections
 * of described links, so an assistant answering a question about Folio can find the right pages.
 *
 * It describes the product only. Creators' zines are not listed, and it says plainly that the site
 * is not available for AI training (robots.txt turns the training crawlers away).
 */
export async function GET() {
  const site = siteUrl();
  const body = [
    "# Folio",
    "",
    "> Folio is a web app for photographers. Collect photos on a private board, sequence them into a full-bleed photo zine, and publish a flip-through zine whose cards show each photo's camera EXIF or Fujifilm film recipe on the back.",
    "",
    "Folio is free to start, with a paid Pro tier that adds more boards and zines and PDF export. Photos stay on a private board until the creator publishes a zine, and a zine can be unpublished at any time.",
    "",
    "## What Folio is",
    "",
    `- [Home](${site}/): What Folio does, in a short tour with a sample flip card.`,
    "",
    "## How it works",
    "",
    `- [How it works](${site}/#how-it-works): Three steps: collect photos on a private board, sequence them one per page, then publish a link readers can flip through.`,
    "",
    "## Pricing",
    "",
    `- [Pricing](${site}/#pricing): The Free and Pro tiers and what each includes.`,
    "",
    "## Legal",
    "",
    `- [Terms](${site}/terms): The terms for using Folio.`,
    `- [Privacy policy](${site}/privacy): What Folio collects, why, and who handles it.`,
    "",
    "## AI training",
    "",
    `Folio's content, including creators' photographs and zines, is not available for AI training, and the training crawlers named in ${site}/robots.txt are disallowed. Assistants answering a person's question about Folio are welcome to use this file.`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
