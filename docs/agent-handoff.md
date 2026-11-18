# Agent handoff

Living status for anyone working on Digital Zine in Claude or Cursor. Read this file before changing code. Update it before you stop, including when a session is interrupted. If this file and the code disagree, trust the code, then correct this file in the same change.

Last updated: 18 Nov 2026, 2:00 PM America/New_York (Claude Code, local). DIG-6 done in `4ed05b3`, DIG-7 in `e8f826f`. DIG-14 (test harness) done in `c66d05e`. DIG-8 (editor) done in `842b384`; CI green (run 44332418693). DIG-9 (public viewer) done in `d172e95`; CI green on `111dc78` (run 44335684998). DIG-10 (PDF export) done in `5f931b9`; CI green (run 44339460602). DIG-11 (billing) done in `08dbc9e`; CI green (run 44341471872). DIG-16 (Stripe Tax) built test-first; see the ticket table. Foundation checkpoint: `698c7bb`.

## Do this first

1. Read this file.
2. Read the open Linear issues in [Digital Zine MVP](https://linear.app/digital-zine/project/digital-zine-mvp-3317748153f6). Do not start a second issue while one is already in progress unless the user says to.
3. Work on branch `cursor/digital-zine-mvp-8439`. The draft pull request is https://github.com/jnleyva816/Digital-Zine/pull/1. Do not open a second pull request for the same MVP.
4. Do not rebuild anything listed under "Already in the tree".

## Already decided

Do not reopen these unless the user explicitly changes them.

- Product: private Vision Board, one full-bleed photo template with an optional caption, public flip viewer at `/z/[slug]`. The board is never exported. PDF comes from published template pages.
- Flip is on by default. A creator can turn it off on a single page. Card backs are text and structured fields only (EXIF or recipe). No audio or video.
- EXIF and recipe text on a published zine are public. No account is required to read them.
- Stack: Next.js App Router, React, PostgreSQL, Prisma, Auth.js credentials (no OAuth required), `exifreader` in the browser before upload, storage interface with a local filesystem driver and an S3 presigned PUT, `@react-pdf/renderer`, `next/image` with `src/lib/image-loader.ts`.
- Stripe is subscriptions only: Free, and Pro at $15/month. PDF export is Pro-only. The board, the one template, and the public viewer stay on Free. Missing `STRIPE_SECRET_KEY` must explain that billing is not configured and must not crash.
- Out of this version: print-on-demand, proof copies, cover QR codes, Stripe Connect, payouts, extra templates, asset garbage collection, audio and video.
- Seeded dev user: `creator@digitalzine.local` / `zine1234`. Sample slug in the local database: `sunday-ferments-issue-01`.
- Test-driven development (decided 18 Nov): red, green, refactor for each acceptance behavior. Tooling is Vitest, Testing Library, and jsdom for unit, component, and API tests, and `@playwright/test` for end-to-end tests. Tests run against the separate `digital_zine_test` database from `.env.test`, which is reset before each run. Earlier work was backfilled with tests (DIG-14), and GitHub Actions CI runs the build and both suites. A ticket is Done only when `npm run build`, `npm test`, and `npm run test:e2e` pass and CI is green. The rules are in `CLAUDE.md` and `.cursor/rules/test-driven.mdc`.
- Editor (decided 18 Nov, DIG-8): creators can have many zines. `/editor` lists them and has a "Create zine" form; new zines start with up to 8 board photos (existing API behavior). `/editor/[id]` saves explicitly with "Save changes"; edits stay local with an "Unsaved changes" indicator, and leaving warns on full unloads and in-app link clicks. Publishing needs at least one page and saves pending edits in the same request. The public URL (slug) is editable only until the first publish. Deleting a zine requires typing its exact title.
- Public viewer (decided 18 Nov, DIG-9): `/z/[slug]` is one vertical column of `FlipCard`s, not a pager. The byline shows the creator's display name when set and nothing otherwise; the email never appears. Only zines with `published: true` render; anything else is a 404.
- PDF export (decided 18 Nov, DIG-10): owner-only. `GET /api/pdf/[slug]` returns 404 for anyone else's zine, even a Pro user's. The "Download PDF" button is in `/editor/[id]` under "View public page", and only while the zine is published. Free creators see "PDF export is a Pro feature." with an "Upgrade to Pro" link to `/billing`. The PDF never prints an email; with no display name there is no byline.
- Billing (decided 18 Nov, DIG-11):
  - `/billing` opens Stripe's hosted Customer Portal ("Manage subscription") for cancelling, card updates, and invoices.
  - `active`, `trialing`, and `past_due` count as Pro. A failed renewal keeps Pro and shows a warning; the plan drops to Free at `unpaid` or `canceled`.
  - Refund, dispute, and fraud-warning events are out of scope and tracked in DIG-15 (Backlog). Ask the user what each should do before building it.
- Sales tax (decided 18 Nov, DIG-16): Pro is $15/month plus applicable tax (exclusive). `STRIPE_AUTOMATIC_TAX=true` turns on Stripe Tax at Checkout for an environment. When it's unset, no tax is sent. Stripe-side setup (head office, registrations, product tax code) belongs to the account owner and is described in the README. Never enable it in code unconditionally.
- Screenshots (decided 18 Nov, DIG-12): commit them to `docs/screenshots/` and embed them in the README and PR #1.
- `publishedAt` means *first* published (decided 18 Nov, DIG-8): unpublishing flips only `published` and keeps `publishedAt`, which is what locks the slug. `PATCH /api/zines/[id]` returns 409 for a slug change once `publishedAt` is set, and 400 when publishing would leave zero pages.
- Deleting a Vision Board photo (decided 18 Nov): allowed, with an inline confirm, but `DELETE /api/assets/[id]` returns 409 and names the zine when any of the user's zine pages uses the asset. Stored bytes are not deleted (asset garbage collection is out of scope).
- `/` (decided 18 Nov): no landing page. Signed in → `/board`, signed out → `/signin`.
- Local Postgres: database `digital_zine` at `127.0.0.1:5432`, user `zine`, password `zine`. Copy `.env.example` to `.env`. Never commit `.env`.
- Local machine (owner's NixOS box, decided 18 Nov): no global Node. Run tools through `nix shell nixpkgs#nodejs_22` and point Prisma at `nixpkgs#prisma-engines_6` (6.19.3). README "NixOS" section has the exact env vars. Postgres runs in the Docker container `digital-zine-pg` (`postgres:17`, volume `digital-zine-pg`). Ports 3000 and 3100 are taken by other services on this machine; smoke-test `next start` on a free port such as 3417.

## Already in the tree

Do not rewrite these unless a bug in them blocks the next ticket. Extend them.

- Prisma models `User`, `MediaAsset`, `Zine`, `ZinePage` in `prisma/schema.prisma`. Seed in `prisma/seed.ts` writes JPEGs with real EXIF.
- Auth.js credentials in `src/lib/auth.ts` and `src/app/api/auth/[...nextauth]/route.ts`.
- Storage: `src/lib/storage/` (local + S3). Presign `POST /api/uploads/presign`. Local bytes `PUT /api/uploads/local/[...key]`. Public reads `GET /api/media/[...key]`.
- Assets: `src/app/api/assets/route.ts`, `src/app/api/assets/[id]/route.ts`, `src/app/api/assets/reorder/route.ts`.
- Zines: `src/app/api/zines/route.ts`, `src/app/api/zines/[id]/route.ts`. Template id is `full-bleed-photo`.
- PDF (DIG-10): `src/lib/pdf-zine.tsx` and `GET /api/pdf/[slug]`. The route returns 401 signed out, 403 for Free, and 404 unless the caller owns the published zine. It uses only the owner's assets. Images are read from local storage by key, or fetched only from absolute `https://` public URLs (S3), never from the request host. A page whose image can't be loaded is left out and the rest are renumbered. The response sets `Cache-Control: private, no-store`. `src/components/editor/PdfExport.tsx` downloads the file through a blob link. The editor's leave warning ignores `a[download]`. E2E photos from `createUserWithPhotos` are now real files copied from the seed images under each user's own storage key; `deleteUser` removes them.
- Billing (DIG-11):
  - `src/lib/billing.ts`: `tierForStatus`, `describeSubscription`, `appOrigin` (return URLs come only from `NEXT_PUBLIC_APP_URL`, never from the request host).
  - `POST /api/billing/checkout`: 401 signed out, 503 `configured: false` without keys or app URL, 409 if already Pro. It reuses the stored customer, or creates one with an idempotency key.
  - `POST /api/billing/portal`: 401, 503, 409 when there is no customer, otherwise a Customer Portal URL.
  - `POST /api/billing/webhook`: verifies the signature. It handles checkout completion (only when `payment_status` is paid), `customer.subscription.*`, and `invoice.paid` / `invoice.payment_failed`. For each, it re-reads the subscription from Stripe and finds the user only by `stripeCustomerId`, never by metadata. Processing errors return 500 so Stripe retries.
  - `/billing` page: `src/app/billing/{layout,page,loading,error}.tsx` and `src/components/billing/BillingPanel.tsx`. After checkout it refreshes every 3s, up to 10 times, until the webhook marks the user Pro.
  - Tax (DIG-16): `automaticTaxEnabled()` in `src/lib/billing.ts`. When it's on, checkout adds `automatic_tax`, `billing_address_collection: "required"`, and `customer_update: { address: "auto", name: "auto" }`. The inline price always sets `tax_behavior: "exclusive"`.
  - API tests mock `getStripeClient` but use the real SDK's `webhooks` with `generateTestHeaderString`. E2E runs without keys, so it covers the not-configured path and the plan states.
- Sign-in page `src/app/signin/page.tsx` (SSR, noindex, signed-in users redirect to `/board`). `SignInForm` only accepts same-origin relative `callbackUrl`s and shows the seeded account only when `NODE_ENV !== "production"`.
- README: setup, env vars, storage, CDN loader swap, NixOS notes.
- `/` redirect in `src/app/page.tsx`.
- Vision Board `/board` (DIG-7): `src/app/board/{layout,page,loading,error}.tsx` and `src/components/board/{VisionBoard,RecipeEditor,types}.ts(x)`. The auth gate is in `layout.tsx` so signed-out visitors get a real 307; it sits outside the `loading.tsx` Suspense boundary on purpose. Uploads run one at a time: EXIF is read in the browser (lazy-loaded `exifreader`), then presign, PUT, and `POST /api/assets`. EXIF badges; recipe editor in a native `<dialog>`; reorder by drag and drop or arrow buttons, announced in a live region; delete with an inline confirm.
- `StudioHeader`: nav labels are screen-reader-only below `sm` so the header fits at 390px.
- Test harness (DIG-14): `vitest.config.mts`, `playwright.config.ts`, `.env.test`, `scripts/test-db.ts` (guarded reset; refuses non-`_test` databases; truncates rather than `--force-reset`), `tests/setup/`, `tests/api/` (assets, uploads), `tests/e2e/` (auth, board), and unit/component tests next to the code. Helpers extracted for testing: `src/lib/safe-callback-url.ts`, `src/components/board/board-utils.ts`. CI is in `.github/workflows/ci.yml`. It runs on pull requests and on pushes to `main`.
- Editor (DIG-8): `src/app/editor/layout.tsx` (auth gate), `src/app/editor/not-found.tsx`, `src/app/editor/(list)/{page,loading,error}.tsx`, `src/app/editor/[id]/{layout,page,loading,error}.tsx`. The `[id]/layout.tsx` checks ownership outside the loading boundary so foreign or missing zines return a real 404. Components are in `src/components/editor/`: `ZineEditor`, `NewZineForm`, `DeleteZineDialog`, `EditorSkeleton`, `EditorError`, plus `editor-state.ts` (pure draft logic, unit-tested).
- When Playwright builds the app itself, it builds into `.next-e2e/` (`NEXT_DIST_DIR` in `next.config.mjs`), so test runs do not break a running `next dev`. CI builds into `.next` and sets `E2E_SKIP_BUILD`.
- Totals: 95 Vitest tests and 22 Playwright tests. (DIG-14 alone had 64 and 13.) Mutation-checked: removing the in-use delete guard, or allowing `//` callback URLs, turns the matching tests red.
- UI pieces only, not pages: `src/components/FlipCard.tsx`, `src/app/layout.tsx`, `src/app/globals.css`.
- Client EXIF: `src/lib/exif-client.ts`.

- Public viewer (DIG-9): `src/app/z/[slug]/{page,not-found,error}.tsx` and `src/lib/public-zine.ts` (`getPublicZine`, cached per request so `generateMetadata` and the page share one query; `shareDescription`). There is deliberately no `loading.tsx` there: a Suspense boundary would turn 404s into streamed 200s and stream metadata out of `<head>` for share crawlers. The e2e tests catch both. `FlipCard` is now a toggle button with `aria-pressed` and an accessible name of the form "Page N: flip to camera details" or "... to recipe". The face that is turned away is `aria-hidden`.

## Not built yet

- Deploy setup for Stripe (portal on, webhook events, price ID) is in the README's "Billing (Stripe)" section. Sales tax is not collected.
- On this NixOS machine, run e2e with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=$(nix build --no-link --print-out-paths nixpkgs#chromium)/bin/chromium` (see the README's NixOS section).
- Pull request #1 is a draft checkpoint, not a finished review.
- CI caches `node_modules` (keyed on the lockfile; a hit skips `npm ci`) and `.next/cache` plus `tsconfig.tsbuildinfo`. It installs only Playwright's headless Chromium shell, without `--with-deps` (the runner already has the libraries; add the flag back if Chromium fails to launch) and uses `postgres:17-alpine`. Commit the handoff together with the code it describes, so a docs-only follow-up doesn't trigger a second full CI run.

## Tickets

| Issue | State at last update | Remaining work |
| --- | --- | --- |
| [DIG-5](https://linear.app/digital-zine/issue/DIG-5/ship-the-digital-zine-mvp) | In Progress | Parent. Close only when DIG-6 through DIG-12 are done. |
| [DIG-6](https://linear.app/digital-zine/issue/DIG-6/scaffold-nextjs-postgres-storage-and-auth) | Done | Sign-in page, README, green `npm run build`, curl smoke check of credentials sign-in. |
| [DIG-7](https://linear.app/digital-zine/issue/DIG-7/vision-board-upload-exif-recipes-and-reorder) | Done | `/board` with upload, EXIF badges, recipe editor, drag/keyboard reorder, guarded delete. Browser smoke check passed. |
| [DIG-8](https://linear.app/digital-zine/issue/DIG-8/editor-one-template-ordered-pages-and-publish) | Done | `/editor` list and `/editor/[id]`: captions, per-page flip, reorder, add or remove pages, explicit save, publish and unpublish, slug lock, typed-title delete. Built test-first. |
| [DIG-9](https://linear.app/digital-zine/issue/DIG-9/public-flip-viewer-with-open-graph-previews) | Done | SSR `/z/[slug]` with Open Graph and Twitter tags, a canonical URL, byline, phone layout, and an accessible flip. 12 viewer e2e tests. |
| [DIG-10](https://linear.app/digital-zine/issue/DIG-10/pdf-export-from-the-published-template) | Done (pending CI) | Owner-only route hardened and tested against Postgres; "Download PDF" in the editor, with an upgrade prompt for Free creators. |
| [DIG-11](https://linear.app/digital-zine/issue/DIG-11/stripe-pro-subscription-at-dollar15month) | Done | `/billing` with Checkout, Customer Portal, failed-payment warning, and not-configured state. Webhook hardened and tested with signed events. |
| [DIG-15](https://linear.app/digital-zine/issue/DIG-15/handle-stripe-refund-dispute-and-fraud-warning-events) | Backlog | Refund, dispute, and fraud-warning webhooks. Product response not decided; ask first. |
| [DIG-16](https://linear.app/digital-zine/issue/DIG-16/collect-sales-tax-on-pro-with-stripe-tax) | Done (pending CI) | Stripe Tax at Checkout behind `STRIPE_AUTOMATIC_TAX`, exclusive pricing, README setup guide. Registrations are the account owner's job. |
| [DIG-12](https://linear.app/digital-zine/issue/DIG-12/verify-the-build-smoke-checks-screenshots-and-pr) | Todo | Build, smoke checks, screenshots, mark PR #1 ready. |
| [DIG-13](https://linear.app/digital-zine/issue/DIG-13/agent-handoff-and-principal-engineer-rules) | Done | Handoff and Claude/Cursor rules landed in `1b5f334`. |
| [DIG-14](https://linear.app/digital-zine/issue/DIG-14/test-harness-tdd-rules-backfilled-tests-and-ci) | Done | Harness, TDD rules, 64 Vitest + 13 Playwright tests, CI green on PR #1. |

Next ticket to resume: DIG-12, final verification. It gates marking PR #1 ready.
- `npm run build`, `npm test`, and `npm run test:e2e` pass, and CI is green.
- The README covers env vars, local Postgres, the seeded user, and how to run. Check this; it mostly does already.
- Smoke check against local Postgres (dev DB, `next dev` on 3420): sign-in, board, editor, public flip viewer, PDF gate, and the Stripe unconfigured path.
- Screenshots of the Vision Board, editor, and public flip viewer go in `docs/screenshots/` (decided), embedded in the README and PR #1.
- Rewrite the PR #1 description: what is in, and what is deferred (print, payouts, extra templates, asset garbage collection, audio and video, DIG-15). Mark it ready for review only after all of the above. Do not merge.

## Session log

Append a row when you stop. Do not delete earlier rows.

| When (America/New_York) | Tool | What changed | Left unfinished |
| --- | --- | --- | --- |
| 18 Nov 2026, 9:10 AM | Cursor cloud agent | Pushed foundation commit `698c7bb` and opened draft PR #1. Filed DIG-5 through DIG-12. | All pages, README, build, smoke checks, screenshots. |
| 18 Nov 2026, 9:15 AM | Cursor cloud agent | Added this handoff plus `CLAUDE.md` and `.cursor/rules/` in `1b5f334`. DIG-13 is Done. | Same product work as above. |
| 18 Nov 2026, 2:20 PM | Claude Code (local) | DIG-16: Stripe Tax at Checkout behind `STRIPE_AUTOMATIC_TAX`, with exclusive pricing and a "plus applicable tax" label. 5 new tests (unit, API, component), all seen red first. The README has a Stripe Tax setup guide. | DIG-12. |
| 18 Nov 2026, 2:00 PM | Claude Code (local) | Built DIG-11, billing, test-first: 33 billing unit and API tests, 10 `BillingPanel` component tests, 8 billing e2e tests. Added the Customer Portal route and `/billing`. Webhook: re-reads subscriptions, maps users only by customer, gates on payment, keeps Pro while `past_due`, returns 500 for retries. Checkout: 409 for Pro, idempotent customer creation, no Host-derived URLs. Filed DIG-15. README now has a Billing section. | DIG-12 next. |
| 18 Nov 2026, 1:10 PM | Claude Code (local) | CI speedups: `node_modules` and Next build caches, headless-shell Chromium without `--with-deps`, alpine Postgres; a typical run is about 1:34. Built DIG-10, PDF export, test-first: 10 API tests, 5 `PdfExport` component tests, 5 PDF e2e tests. Fixes: export is owner-only, no email in the PDF, no fetching from the request host, missing images no longer crash the export, and the leave warning no longer blocks downloads. | DIG-11 next. |
| 18 Nov 2026, 12:20 PM | Claude Code (local) | Built DIG-9, the public viewer, test-first: 12 viewer e2e tests (OG tags, share crawlers, 404s, signed-out reading, flip by click/Enter/Space, phone width), `FlipCard` component tests, and `shareDescription` unit tests. Mutation-checked the crawler and 404 tests by adding a `loading.tsx`. | DIG-10 next. |
| 18 Nov 2026, 11:30 AM | Claude Code (local) | DIG-14 closed after CI went green. Built DIG-8, the editor, test-first: zine API rules (non-empty publish, slug lock, first-publish `publishedAt`), `editor-state` unit tests, 9 editor e2e tests, and the pages. Playwright now builds into `.next-e2e/`. | DIG-9 next. |
| 18 Nov 2026, 10:50 AM | Claude Code (local) | Adopted TDD at the user's request: added rules in `CLAUDE.md` and `.cursor/rules/`, the Vitest and Playwright harness, the guarded test-database reset, 64 Vitest and 13 Playwright tests backfilled for DIG-6 and DIG-7, and CI. Named the board grid for accessibility. | DIG-8. |
| 18 Nov 2026, 10:20 AM | Claude Code (local) | Built `/board` (DIG-7) and the `/` redirect. Added the in-use guard to asset delete. Fixed `StudioHeader` overflow on phones. Build is green, and a 20-check headless Chromium smoke check passed. DIG-7 is Done. | DIG-8 onward. |
| 18 Nov 2026, 9:35 AM | Claude Code (local) | Set up the local env (Docker Postgres, Nix Node, NixOS Prisma engines). Added `/signin`, hardened `SignInForm`, wrote the README. First green `npm run build`. DIG-6 is Done. | DIG-7 onward. |

## Before you stop

Even if the session is interrupted, do these before you end. A dirty tree and a stale ticket count as unfinished.

1. Update "Already in the tree", "Not built yet", the ticket table, and the session log in this file.
2. Move the Linear issue you touched. Say what changed, how you checked it, and the exact next step. Leave it In Progress if it is not actually done.
3. Commit on `cursor/digital-zine-mvp-8439`, push, and update pull request #1. Do not open a new pull request.
4. If you did not finish, name the next file to edit and the command to run. "Continue later" is not a status.
