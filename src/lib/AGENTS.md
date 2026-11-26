# src/lib: notes

Constraints the code does not make obvious. Extend these modules; do not rewrite them unless a bug blocks the ticket.

## Media and photos
- The worker starts from `src/instrumentation-node.ts`, which `src/instrumentation.ts` imports only when `NEXT_RUNTIME === "nodejs"`. Importing Node-only code (sharp, pg-boss) straight from `instrumentation.ts` breaks `next dev`. pg-boss keeps its tables in the `pgboss` schema.
- `media/variant-urls.ts` is client-safe; `variants.ts` imports sharp. `variantWidthsFor` is the only answer to which copies exist (copies are made only below a photo's own width).
- `photo-edit.ts` `cropRect` is the one crop calculation. The web draws it with `EditedPhoto`; the PDF route crops with sharp through `cropPixels`. The first edit of an old photo records its width and height.
- Limit checks take a per-user `pg_advisory_xact_lock` (`usage.ts`). The limits themselves live in `limits.ts`.

## Recipes
- `fuji-recipe.ts` defines every field with the camera's real options. Nothing is stored until Save. A saved recipe wins over a prefill.
- `fuji-makernote.ts` (`readFujiRecipe`) reads maker notes with no dependency. The upload POST does not send the recipe; the board holds the find in memory ("Review recipe found in photo"), and a reload before Save drops it.
- A linked photo keeps a copy in `MediaAsset.recipe`, which `syncLinkedPhotos` (`recipes.ts`) rewrites on edit, so readers only ever read `MediaAsset.recipe`. Editing a linked photo's own recipe unlinks it. Matching (`recipe-library.ts`) ignores name, ISO, and exposure compensation.

## Public zines
- Build every public address with `publicZinePath(owner, slug)` (`public-zine-path.ts`), where `owner` is `User.publicId`.
- `getPublicZine` reads through `unstable_cache`, tagged `public-zine:<creator>/<slug>` (`publicZineTag`), one-hour max age. Anything that changes what readers see must call `revalidatePublicZines` or `revalidateZinesUsingAssets` (`public-zine-cache.ts`).
- Private zines (DIG-112, decision 0023): any new list of zines (Discover, search, feeds) filters `visibility: "public"`. The viewer gates through `isUnlocked` (`zine-access.ts`); never put a private zine's fields in metadata.
- The media worker revalidates through `globalThis.__incrementalCache`, because `revalidateTag` throws outside a request. That is internal Next API: recheck it on every Next upgrade.

## PDF
- Images come from local storage or an absolute `https://` URL, never the request host. A page whose image fails is left out.
- Templates import drawing elements from `pdf-templates/primitives.ts`, not react-pdf, and use no hooks, because the editor preview draws them as HTML.
- Never use `wrap={false}` on a react-pdf `Page` (it resizes the page). Draw glyphs the bundled fonts lack yourself. Check output with `tests/pdf-text.ts`.

## Auth, sessions, accounts
- Sign-in goes through `authorizeCredentials` (`sign-in.ts`); `auth.ts` maps a block to `code: "rate_limited"`. Google resolves through `resolveGoogleUser` in the `signIn` callback, and the `jwt` callback maps Google's id to ours by `googleId`. A second credentials provider, `email-verification`, spends the link's token. Only a SHA-256 of any token is stored.
- Anything that creates a user who signs in with a password must set `emailVerifiedAt` (the seed, `admin:create`, and the test helpers do).
- Sessions are JWTs. Each records `authAt`; the `jwt` callback runs `checkSessionToken` (`session-token.ts`) on every check and ends a session that began before `User.sessionsValidAfter` or whose account is gone. To sign an account out everywhere, set that column. A new sign-in path must be stamped with `markSignedIn`.
- `deleteAccountCompletely` (`account-deletion.ts`) runs Stripe, then storage (`deletePrefix`), then the row, so a retry always works. The old `deleteAccount` in `cleanup.ts` is for tests and the smoke script only. S3 `deletePrefix` throws on per-file failures.

## Requests and security
- `rate-limit.ts`: `limitRequest(rule, userId)` goes after the 401 check in every write route, presign, and PDF. `clientIp` reads `TRUSTED_PROXY_HOPS` entries from the right of `X-Forwarded-For`.
- `storage/keys.ts`: every route that takes a client storage key calls `isWellFormedStorageKey` (400) and then `isValidStorageKey` (403) before any storage call.
- `csp.ts` `buildCsp`: a new external origin (analytics, fonts, a CDN) must be added here or its page breaks. Schema files that reach the browser import `@/lib/zod-setup` (Zod `jitless`), because Zod's eval probe violates the CSP.
- `structured-data.ts` builds JSON-LD from public fields only; `serializeJsonLd` escapes `<`, `>`, `&`. Every absolute address comes from `site.ts`. Private paths and `AI_TRAINING_CRAWLERS` are in `seo.ts`.

## Board
- `board-pages.ts` `BOARD_ORDER` pages the board (ties broken by id).
- `board-transition.ts`: a new board view must mark each photo with `data-flow` to take part in the animation.
- `pan-zoom.ts` is hand-written; there is no gesture library by choice.
- `brand.ts` `brandMarkSvg` is the mark. `npm run brand:generate` writes the icons; commit them.
