# Agent handoff

Living status for anyone working on Digital Zine in Claude or Cursor. Read this file before changing code. Update it before you stop, including when a session is interrupted. If this file and the code disagree, trust the code, then correct this file in the same change.

Last updated: 18 Nov 2026, 10:50 AM America/New_York (Claude Code, local). DIG-6 done in `4ed05b3`, DIG-7 in `e8f826f`. DIG-14 (test harness) done in `c66d05e`; CI green (run 44327991976). Foundation checkpoint: `698c7bb`.

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
- PDF: `src/lib/pdf-zine.tsx`, `GET /api/pdf/[slug]` (401 unsigned, 403 unless `tier` is `pro`). Not exercised end to end.
- Stripe: `src/lib/stripe.ts`, `POST /api/billing/checkout`, `POST /api/billing/webhook`. No billing page.
- Sign-in page `src/app/signin/page.tsx` (SSR, noindex, signed-in users redirect to `/board`). `SignInForm` only accepts same-origin relative `callbackUrl`s and shows the seeded account only when `NODE_ENV !== "production"`.
- README: setup, env vars, storage, CDN loader swap, NixOS notes.
- `/` redirect in `src/app/page.tsx`.
- Vision Board `/board` (DIG-7): `src/app/board/{layout,page,loading,error}.tsx` and `src/components/board/{VisionBoard,RecipeEditor,types}.ts(x)`. The auth gate is in `layout.tsx` so signed-out visitors get a real 307; it sits outside the `loading.tsx` Suspense boundary on purpose. Uploads run one at a time: EXIF is read in the browser (lazy-loaded `exifreader`), then presign, PUT, and `POST /api/assets`. EXIF badges; recipe editor in a native `<dialog>`; reorder by drag and drop or arrow buttons, announced in a live region; delete with an inline confirm.
- `StudioHeader`: nav labels are screen-reader-only below `sm` so the header fits at 390px.
- Test harness (DIG-14): `vitest.config.mts`, `playwright.config.ts`, `.env.test`, `scripts/test-db.ts` (guarded reset; refuses non-`_test` databases; truncates rather than `--force-reset`), `tests/setup/`, `tests/api/` (assets, uploads), `tests/e2e/` (auth, board), and unit/component tests next to the code. Helpers extracted for testing: `src/lib/safe-callback-url.ts`, `src/components/board/board-utils.ts`. CI is in `.github/workflows/ci.yml`. It runs on pull requests and on pushes to `main`.
- Totals: 64 Vitest tests and 13 Playwright tests. Mutation-checked: removing the in-use delete guard, or allowing `//` callback URLs, turns the matching tests red.
- UI pieces only, not pages: `src/components/FlipCard.tsx`, `src/app/layout.tsx`, `src/app/globals.css`.
- Client EXIF: `src/lib/exif-client.ts`.

## Not built yet

- Pages: `/editor`, `/editor/[id]`, `/z/[slug]`, `/billing`. Until they exist, `StudioHeader` link prefetches return 404 on `/board`. That is expected and stops once those pages land.
- On this NixOS machine, run e2e with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=$(nix build --no-link --print-out-paths nixpkgs#chromium)/bin/chromium` (see the README's NixOS section).
- Pull request #1 is a draft checkpoint, not a finished review.

## Tickets

| Issue | State at last update | Remaining work |
| --- | --- | --- |
| [DIG-5](https://linear.app/digital-zine/issue/DIG-5/ship-the-digital-zine-mvp) | In Progress | Parent. Close only when DIG-6 through DIG-12 are done. |
| [DIG-6](https://linear.app/digital-zine/issue/DIG-6/scaffold-nextjs-postgres-storage-and-auth) | Done | Sign-in page, README, green `npm run build`, curl smoke check of credentials sign-in. |
| [DIG-7](https://linear.app/digital-zine/issue/DIG-7/vision-board-upload-exif-recipes-and-reorder) | Done | `/board` with upload, EXIF badges, recipe editor, drag/keyboard reorder, guarded delete. Browser smoke check passed. |
| [DIG-8](https://linear.app/digital-zine/issue/DIG-8/editor-one-template-ordered-pages-and-publish) | In Progress | APIs exist. Build the editor: map assets, captions, per-page flip, publish and unpublish. |
| [DIG-9](https://linear.app/digital-zine/issue/DIG-9/public-flip-viewer-with-open-graph-previews) | Todo | `FlipCard` exists. Build SSR `/z/[slug]` with Open Graph title, description, and image. |
| [DIG-10](https://linear.app/digital-zine/issue/DIG-10/pdf-export-from-the-published-template) | In Progress | Route exists. Prove it against Postgres and add the download control for Pro. |
| [DIG-11](https://linear.app/digital-zine/issue/DIG-11/stripe-pro-subscription-at-dollar15month) | In Progress | Routes exist. Build `/billing`. Missing Stripe keys must stay non-fatal. |
| [DIG-12](https://linear.app/digital-zine/issue/DIG-12/verify-the-build-smoke-checks-screenshots-and-pr) | Todo | Build, smoke checks, screenshots, mark PR #1 ready. |
| [DIG-13](https://linear.app/digital-zine/issue/DIG-13/agent-handoff-and-principal-engineer-rules) | Done | Handoff and Claude/Cursor rules landed in `1b5f334`. |
| [DIG-14](https://linear.app/digital-zine/issue/DIG-14/test-harness-tdd-rules-backfilled-tests-and-ci) | Done | Harness, TDD rules, 64 Vitest + 13 Playwright tests, CI green on PR #1. |

Next ticket to resume: DIG-8, the editor, test-first. Check CI with `gh run list --branch cursor/digital-zine-mvp-8439` (match full SHAs; short SHAs do not resolve). Start by writing write `tests/api/zines.test.ts` and `tests/e2e/editor.spec.ts` before any editor UI. Read `src/app/api/zines/route.ts` and `src/app/api/zines/[id]/route.ts` first, then add `src/app/editor/` with a `layout.tsx` auth gate like `src/app/board/layout.tsx`. Reuse `BoardAsset`/`toBoardAsset` from `src/components/board/types.ts` for the asset picker. Done means `npm run build`, `npm test`, and `npm run test:e2e` pass and CI is green.

## Session log

Append a row when you stop. Do not delete earlier rows.

| When (America/New_York) | Tool | What changed | Left unfinished |
| --- | --- | --- | --- |
| 18 Nov 2026, 9:10 AM | Cursor cloud agent | Pushed foundation commit `698c7bb` and opened draft PR #1. Filed DIG-5 through DIG-12. | All pages, README, build, smoke checks, screenshots. |
| 18 Nov 2026, 9:15 AM | Cursor cloud agent | Added this handoff plus `CLAUDE.md` and `.cursor/rules/` in `1b5f334`. DIG-13 is Done. | Same product work as above. |
| 18 Nov 2026, 10:50 AM | Claude Code (local) | Adopted TDD at the user's request: added rules in `CLAUDE.md` and `.cursor/rules/`, the Vitest and Playwright harness, the guarded test-database reset, 64 Vitest and 13 Playwright tests backfilled for DIG-6 and DIG-7, and CI. Named the board grid for accessibility. | DIG-8. |
| 18 Nov 2026, 10:20 AM | Claude Code (local) | Built `/board` (DIG-7) and the `/` redirect. Added the in-use guard to asset delete. Fixed `StudioHeader` overflow on phones. Build is green, and a 20-check headless Chromium smoke check passed. DIG-7 is Done. | DIG-8 onward. |
| 18 Nov 2026, 9:35 AM | Claude Code (local) | Set up the local env (Docker Postgres, Nix Node, NixOS Prisma engines). Added `/signin`, hardened `SignInForm`, wrote the README. First green `npm run build`. DIG-6 is Done. | DIG-7 onward. |

## Before you stop

Even if the session is interrupted, do these before you end. A dirty tree and a stale ticket count as unfinished.

1. Update "Already in the tree", "Not built yet", the ticket table, and the session log in this file.
2. Move the Linear issue you touched. Say what changed, how you checked it, and the exact next step. Leave it In Progress if it is not actually done.
3. Commit on `cursor/digital-zine-mvp-8439`, push, and update pull request #1. Do not open a new pull request.
4. If you did not finish, name the next file to edit and the command to run. "Continue later" is not a status.
