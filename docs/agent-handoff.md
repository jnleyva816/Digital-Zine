# Agent handoff

Living status for anyone working on Digital Zine in Claude or Cursor. Read this file before changing code. Update it before you stop, including when a session is interrupted. If this file and the code disagree, trust the code, then correct this file in the same change.

Last updated: 18 Nov 2026, 5:00 PM America/New_York (Claude Code, local). The MVP is merged (`c70f82a`), and so is DIG-21 (`b3e7e09`). DIG-22 (Fujifilm film recipes) is In Review on its own PR. The active Linear project is [Launch readiness](https://linear.app/digital-zine/project/launch-readiness-f71378a4d6af).

## Do this first

1. Read this file.
2. Read the open Linear issues in the active project, [Launch readiness](https://linear.app/digital-zine/project/launch-readiness-f71378a4d6af). Do not start a second issue while one is already in progress unless the user says to.
3. Branch off an up-to-date `main` using the ticket's Linear branch name, and open one PR per ticket. Never commit to `main`, and never merge unless the user says so. Branch `cursor/digital-zine-mvp-8439` and PR #1 are finished history.
4. Do not rebuild anything listed under "Already in the tree".

## Already decided

Do not reopen these unless the user explicitly changes them.

- Product: private Vision Board, one full-bleed photo template with an optional caption, public flip viewer at `/z/[slug]`. The board is never exported. PDF comes from published template pages.
- Flip is on by default. A creator can turn it off on a single page. Card backs are text and structured fields only (EXIF or a Fujifilm film recipe). No audio or video.
- **"Recipe" means a Fujifilm film-simulation recipe, never a food recipe** (owner, 18 Nov, DIG-22). A recipe is the in-camera settings: film simulation, dynamic range, grain, Color Chrome and FX Blue, white balance with red/blue shift, highlight, shadow, color, sharpness, clarity, noise reduction, ISO, and exposure compensation.
  - Fields use the camera's real options (selects and steps), defined in `src/lib/fuji-recipe.ts`.
  - Each photo has its own recipe, stored in `MediaAsset.recipe` (JSON). There is no schema change and no saved recipe library yet; that's DIG-24.
  - Recipes are not read automatically from the photo's Fujifilm maker notes; that's DIG-23.
  - Old food recipes are dropped. `parseRecipe` returns null for them, and the API rejects them.
- EXIF and recipe text on a published zine are public. No account is required to read them.
- Stack: Next.js App Router, React, PostgreSQL, Prisma, Auth.js credentials (no OAuth required), `exifreader` in the browser before upload, storage interface with a local filesystem driver and an S3 presigned PUT, `@react-pdf/renderer`, `next/image` with `src/lib/image-loader.ts`.
- Stripe is subscriptions only: Free, and Pro at $15/month. PDF export is Pro-only. The board, the one template, and the public viewer stay on Free. Missing `STRIPE_SECRET_KEY` must explain that billing is not configured and must not crash.
- Out of this version: print-on-demand, proof copies, cover QR codes, Stripe Connect, payouts, extra templates, asset garbage collection, audio and video.
- Seeded dev user: `creator@digitalzine.local` / `zine1234`. The seed's sample zine is "Golden Hour Field Notes — Issue 01" at `golden-hour-field-notes-issue-01`, shot on Fujifilm with two film recipes. The owner's dev DB was seeded before DIG-22 and still has the old `sunday-ferments-issue-01` zine, which the owner renamed "Car Show". Don't re-seed the dev DB: it resets the seeded user's name and password.
- Test-driven development (decided 18 Nov): red, green, refactor for each acceptance behavior. Tooling is Vitest, Testing Library, and jsdom for unit, component, and API tests, and `@playwright/test` for end-to-end tests. Tests run against the separate `digital_zine_test` database from `.env.test`, which is reset before each run. Earlier work was backfilled with tests (DIG-14), and GitHub Actions CI runs the build and both suites. A ticket is Done only when `npm run build`, `npm test`, and `npm run test:e2e` pass and CI is green. The rules are in `CLAUDE.md` and `.cursor/rules/test-driven.mdc`.
- Editor (decided 18 Nov, DIG-8): creators can have many zines. `/editor` lists them and has a "Create zine" form; new zines start with up to 8 board photos (existing API behavior). `/editor/[id]` saves explicitly with "Save changes"; edits stay local with an "Unsaved changes" indicator, and leaving warns on full unloads and in-app link clicks. Publishing needs at least one page and saves pending edits in the same request. The public URL (slug) is editable only until the first publish. Deleting a zine requires typing its exact title.
- Public viewer (decided 18 Nov, DIG-9): `/z/[slug]` is one vertical column of `FlipCard`s, not a pager. The byline shows the creator's display name when set and nothing otherwise; the email never appears. Only zines with `published: true` render; anything else is a 404.
- PDF export (decided 18 Nov, DIG-10): owner-only. `GET /api/pdf/[slug]` returns 404 for anyone else's zine, even a Pro user's. The "Download PDF" button is in `/editor/[id]` under "View public page", and only while the zine is published. Free creators see "PDF export is a Pro feature." with an "Upgrade to Pro" link to `/billing`. The PDF never prints an email; with no display name there is no byline.
- Billing (decided 18 Nov, DIG-11):
  - `/billing` opens Stripe's hosted Customer Portal ("Manage subscription") for cancelling, card updates, and invoices.
  - `active`, `trialing`, and `past_due` count as Pro. A failed renewal keeps Pro and shows a warning; the plan drops to Free at `unpaid` or `canceled`.
  - Refund, dispute, and fraud-warning events are out of scope and tracked in DIG-15 (Backlog). Ask the user what each should do before building it.
- Admin (decided 18 Nov, DIG-17):
  - `User.role` (`user` | `admin`, default `user`). The user approved this schema change.
  - Admins get every Pro feature without a subscription. No access to other users' data, and no admin page.
  - `npm run admin:create -- --email <email> [--reset]` prints a random password once.
  - The "View as Free" header switch, stored in the `dz_view_as_free` httpOnly cookie, makes the whole app treat the admin as Free, and a banner shows while it's on.
  - Admins can never start a Stripe checkout.
- Smoke checks (decided 18 Nov, DIG-12): `scripts/smoke.ts` must create its own throwaway user and data and delete them afterwards. The dev database holds the owner's real data; the seeded zine was renamed "Car Show".
- Sales tax (decided 18 Nov, DIG-16): Pro is $15/month plus applicable tax (exclusive). `STRIPE_AUTOMATIC_TAX=true` turns on Stripe Tax at Checkout for an environment. When it's unset, no tax is sent. Stripe-side setup (head office, registrations, product tax code) belongs to the account owner and is described in the README. Never enable it in code unconditionally.
- Screenshots (decided 18 Nov, DIG-12): commit them to `docs/screenshots/` and embed them in the README and PR #1.
- Workflow after the MVP (decided 18 Nov, DIG-21):
  - Every Linear ticket gets one **Area** label (UI/UX, Backend, Security, Payments, Data, Infra, Docs) and one **Type** label (Bug, Feature, Improvement).
  - Projects are goals, not areas.
  - One branch and one PR per ticket, off `main`. The ticket goes to In Review when CI is green on its PR, and to Done when the owner merges.
  - Only the owner merges.
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
- Admin (DIG-17):
  - `src/lib/entitlements.ts` has `effectiveAccess` and `VIEW_AS_FREE_COOKIE`. `getAuthenticatedUser()` now returns:
    - `tier`: the effective tier that every feature check uses
    - `billingTier`: what Stripe says
    - `role` and `viewingAsFree`
  - `POST /api/admin/view-as` sets or clears the cookie. It returns 403 for non-admins.
  - `src/lib/admin-account.ts` has `ensureAdmin`; `scripts/admin-create.ts` is the CLI.
  - `src/components/AdminViewToggle.tsx` has the switch and the banner. `StudioHeader` takes `role` and `viewingAsFree`.
  - `/billing` shows "Your plan: Admin", or the Free page with checkout disabled when previewing.
- Fujifilm recipes (DIG-22):
  - `src/lib/fuji-recipe.ts`: the camera option lists, `fujiRecipeSchema` (strict zod, shared by `POST /api/assets`, `PATCH /api/assets/[id]`, and `parseRecipe`), `formatSigned`, and `recipeRows` (label/value pairs in camera-menu order). The card back and the PDF both use `recipeRows`.
  - `src/components/board/RecipeEditor.tsx`: "Add a film recipe" dialog. The Kelvin field appears only for Kelvin white balance. Exposure compensation can be a range ("0 to +2/3").
  - `FlipCard` shows "Fujifilm Film Recipe" with a definition list, and its toggle is named "flip to film recipe". The PDF reverse is "Card Reverse · Fujifilm Film Recipe".
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
| [DIG-5](https://linear.app/digital-zine/issue/DIG-5/ship-the-digital-zine-mvp) | Done | Parent. Closed when PR #1 merged (`c70f82a`). |
| [DIG-6](https://linear.app/digital-zine/issue/DIG-6/scaffold-nextjs-postgres-storage-and-auth) | Done | Sign-in page, README, green `npm run build`, curl smoke check of credentials sign-in. |
| [DIG-7](https://linear.app/digital-zine/issue/DIG-7/vision-board-upload-exif-recipes-and-reorder) | Done | `/board` with upload, EXIF badges, recipe editor, drag/keyboard reorder, guarded delete. Browser smoke check passed. |
| [DIG-8](https://linear.app/digital-zine/issue/DIG-8/editor-one-template-ordered-pages-and-publish) | Done | `/editor` list and `/editor/[id]`: captions, per-page flip, reorder, add or remove pages, explicit save, publish and unpublish, slug lock, typed-title delete. Built test-first. |
| [DIG-9](https://linear.app/digital-zine/issue/DIG-9/public-flip-viewer-with-open-graph-previews) | Done | SSR `/z/[slug]` with Open Graph and Twitter tags, a canonical URL, byline, phone layout, and an accessible flip. 12 viewer e2e tests. |
| [DIG-10](https://linear.app/digital-zine/issue/DIG-10/pdf-export-from-the-published-template) | Done | Owner-only route hardened and tested against Postgres; "Download PDF" in the editor, with an upgrade prompt for Free creators. |
| [DIG-11](https://linear.app/digital-zine/issue/DIG-11/stripe-pro-subscription-at-dollar15month) | Done | `/billing` with Checkout, Customer Portal, failed-payment warning, and not-configured state. Webhook hardened and tested with signed events. |
| [DIG-16](https://linear.app/digital-zine/issue/DIG-16/collect-sales-tax-on-pro-with-stripe-tax) | Done | Stripe Tax at Checkout behind `STRIPE_AUTOMATIC_TAX`, exclusive pricing, README setup guide. Registrations are the account owner's job. |
| [DIG-17](https://linear.app/digital-zine/issue/DIG-17/admin-role-with-full-access-and-a-view-as-free-toggle) | Done | Admin role, `admin:create`, "View as Free" header switch and banner. |
| [DIG-12](https://linear.app/digital-zine/issue/DIG-12/verify-the-build-smoke-checks-screenshots-and-pr) | Done | Smoke checks 11/11 against a production build on local Postgres; screenshots in `docs/screenshots/`; README updated; PR #1 description rewritten, marked ready, and merged. |
| [DIG-13](https://linear.app/digital-zine/issue/DIG-13/agent-handoff-and-principal-engineer-rules) | Done | Handoff and Claude/Cursor rules landed in `1b5f334`. |
| [DIG-14](https://linear.app/digital-zine/issue/DIG-14/test-harness-tdd-rules-backfilled-tests-and-ci) | Done | Harness, TDD rules, 64 Vitest + 13 Playwright tests, CI green on PR #1. |

### Launch readiness (active)

| Issue | Area | State | Remaining work |
| --- | --- | --- | --- |
| [DIG-22](https://linear.app/digital-zine/issue/DIG-22/recipes-are-fujifilm-film-simulation-recipes-not-food-recipes) | UI/UX | In Review | Fujifilm film recipes replace food recipes everywhere. Waiting for the owner to merge its PR. |
| [DIG-21](https://linear.app/digital-zine/issue/DIG-21/update-agent-rules-and-handoff-for-post-mvp-work) | Docs | Done | Merged in `b3e7e09`. |
| [DIG-18](https://linear.app/digital-zine/issue/DIG-18/verify-billing-end-to-end-in-a-stripe-sandbox) | Payments | Backlog | Real Stripe sandbox round trip. Needs sandbox keys from the owner in a local `.env`. |
| [DIG-19](https://linear.app/digital-zine/issue/DIG-19/switch-production-schema-changes-to-prisma-migrations) | Data | Backlog | Baseline Prisma migration and `migrate deploy`. Whether the test reset keeps `db push` is not decided; ask. |
| [DIG-20](https://linear.app/digital-zine/issue/DIG-20/deploy-to-production-with-secrets-storage-and-monitoring) | Infra | Backlog | Production deploy. Hosting, database, storage, domain, and monitoring are not decided; ask. |
| [DIG-15](https://linear.app/digital-zine/issue/DIG-15/handle-stripe-refund-dispute-and-fraud-warning-events) | Payments | Backlog | Refund, dispute, and fraud-warning webhooks. The product response is not decided; ask first. |

Not in a project yet: [DIG-23](https://linear.app/digital-zine/issue/DIG-23/fill-in-fujifilm-recipes-from-the-photos-maker-notes) (fill in recipes from Fujifilm maker notes; parser vs. dependency not decided) and [DIG-24](https://linear.app/digital-zine/issue/DIG-24/saved-reusable-fujifilm-recipes) (saved recipe library; schema change).

Next: once the owner merges DIG-22, ask which Launch readiness ticket to start. DIG-19 (migrations) and DIG-20 (deploy) block real users. DIG-18 needs Stripe sandbox keys.

To re-verify a running server: `SMOKE_BASE_URL=<url> npm run smoke`. It creates and deletes its own `@smoke.digitalzine.local` user and rewrites `docs/screenshots/`.

## Session log

Append a row when you stop. Do not delete earlier rows.

| When (America/New_York) | Tool | What changed | Left unfinished |
| --- | --- | --- | --- |
| 18 Nov 2026, 9:10 AM | Cursor cloud agent | Pushed foundation commit `698c7bb` and opened draft PR #1. Filed DIG-5 through DIG-12. | All pages, README, build, smoke checks, screenshots. |
| 18 Nov 2026, 9:15 AM | Cursor cloud agent | Added this handoff plus `CLAUDE.md` and `.cursor/rules/` in `1b5f334`. DIG-13 is Done. | Same product work as above. |
| 18 Nov 2026, 5:00 PM | Claude Code (local) | The owner merged DIG-21 and clarified that "recipe" means a Fujifilm film-simulation recipe. Built DIG-22 test-first: new `fuji-recipe.ts` (11 unit tests), a rewritten recipe editor (8 component tests), the card back (2 tests) and PDF, API validation (3 new tests), the board e2e flow, and re-themed seed and smoke data. The dev DB had no recipes to drop. Smoke 11/11; screenshots regenerated. | Owner merges the DIG-22 PR. |
| 18 Nov 2026, 4:00 PM | Claude Code (local) | The owner merged PR #1 (`c70f82a`); CI green on `main`. Closed DIG-5 and completed the MVP project. Set up Linear Area labels and labelled DIG-6 to DIG-17. Created the Launch readiness project with DIG-15, DIG-18, DIG-19, DIG-20, and DIG-21. Updated `CLAUDE.md`, `.cursor/rules/`, and this handoff for one branch and PR per ticket. | Owner merges the DIG-21 PR; then pick a Launch readiness ticket. |
| 18 Nov 2026, 3:30 PM | Claude Code (local) | DIG-12: rewrote `scripts/smoke.ts` to create and delete its own creator. 11/11 checks passed against a production build on the dev DB (port 3430). Captured 5 screenshots, which the README now embeds. Fixed a hang: lazy off-screen images never decode, so the screenshot wait now covers only visible images. Fixed a flaky admin e2e test (about 1 in 100 runs): `router.refresh()` after the view switch could reuse a prefetch that started before the cookie was set. The switch now does a full reload and stays disabled until hydrated. 150/150 e2e across 3 repeats. | Review PR #1. |
| 18 Nov 2026, 2:50 PM | Claude Code (local) | Paused DIG-12 at the user's request and built DIG-17, the admin role, test-first: 3 entitlement unit tests, 10 admin API tests, 1 checkout test, 6 component tests, 3 e2e tests. Schema: `User.role`. Ran `prisma db push` on the dev DB, which only added the column. | Create the user's admin account, then DIG-12. |
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
