/**
 * What crawlers may and may not read (DIG-106). Search engines are welcome; AI training is not.
 */

/** Signed-in and transactional areas. Nothing here is for a search result. */
export const PRIVATE_PATHS = [
  "/api/",
  "/board",
  "/boards",
  "/editor",
  "/billing",
  "/recipes",
  "/signin",
  "/signup",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
] as const;

/**
 * Crawlers that collect pages to train or feed AI models. Each is named, because a crawler that has
 * its own group ignores the `*` one. Search crawlers (Googlebot, Bingbot, Applebot) and link-preview
 * fetchers (facebookexternalhit, Twitterbot, Slackbot) are not here: they must keep working.
 * `Google-Extended` and `Applebot-Extended` are the opt-outs from Google's and Apple's AI training;
 * they do not affect search.
 */
export const AI_TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "Applebot-Extended",
  "Bytespider",
  "PerplexityBot",
  "Amazonbot",
  "cohere-ai",
  "Meta-ExternalAgent",
  "Diffbot",
  "FacebookBot",
  "ImagesiftBot",
  "Omgilibot",
  "Timpibot",
] as const;
