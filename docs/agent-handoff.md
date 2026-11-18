# Agent handoff

Living status for anyone working on Digital Zine in Claude or Cursor. Read this file before changing code. Update it before you stop, including when a session is interrupted. If this file and the code disagree, trust the code, then correct this file in the same change.

Last updated: 18 Nov 2026, 9:16 AM America/New_York. Branch head includes `3463549`. Foundation checkpoint before the handoff: `698c7bb`.

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
- Local Postgres used for the checkpoint: database `digital_zine` at `127.0.0.1:5432`, user `zine`. Copy `.env.example` to `.env`. Never commit `.env`.

## Already in the tree

Do not rewrite these unless a bug in them blocks the next ticket. Extend them.

- Prisma models `User`, `MediaAsset`, `Zine`, `ZinePage` in `prisma/schema.prisma`. Seed in `prisma/seed.ts` writes JPEGs with real EXIF.
- Auth.js credentials in `src/lib/auth.ts` and `src/app/api/auth/[...nextauth]/route.ts`.
- Storage: `src/lib/storage/` (local + S3). Presign `POST /api/uploads/presign`. Local bytes `PUT /api/uploads/local/[...key]`. Public reads `GET /api/media/[...key]`.
- Assets: `src/app/api/assets/route.ts`, `src/app/api/assets/[id]/route.ts`, `src/app/api/assets/reorder/route.ts`.
- Zines: `src/app/api/zines/route.ts`, `src/app/api/zines/[id]/route.ts`. Template id is `full-bleed-photo`.
- PDF: `src/lib/pdf-zine.tsx`, `GET /api/pdf/[slug]` (401 unsigned, 403 unless `tier` is `pro`). Not exercised end to end.
- Stripe: `src/lib/stripe.ts`, `POST /api/billing/checkout`, `POST /api/billing/webhook`. No billing page.
- UI pieces only, not pages: `src/components/FlipCard.tsx`, `src/components/SignInForm.tsx`, `src/components/StudioHeader.tsx`, `src/app/layout.tsx`, `src/app/globals.css`.
- Client EXIF: `src/lib/exif-client.ts`.

## Not built yet

- Pages: `/`, `/signin`, `/board`, `/editor`, `/editor/[id]`, `/z/[slug]`, `/billing`.
- README is still the one-line stub. It still needs env vars, local Postgres, the seeded user, how to run, and the CDN loader swap.
- `npm run build` has not been run on this branch.
- No smoke checks. No screenshots.
- Pull request #1 is a draft checkpoint, not a finished review.

## Tickets

| Issue | State at last update | Remaining work |
| --- | --- | --- |
| [DIG-5](https://linear.app/digital-zine/issue/DIG-5/ship-the-digital-zine-mvp) | In Progress | Parent. Close only when DIG-6 through DIG-12 are done. |
| [DIG-6](https://linear.app/digital-zine/issue/DIG-6/scaffold-nextjs-postgres-storage-and-auth) | In Progress | Sign-in page, README, and a green `npm run build` are still open. Do not rescaffold. |
| [DIG-7](https://linear.app/digital-zine/issue/DIG-7/vision-board-upload-exif-recipes-and-reorder) | In Progress | APIs exist. Build `/board`: upload, EXIF badges, recipe editor, reorder. |
| [DIG-8](https://linear.app/digital-zine/issue/DIG-8/editor-one-template-ordered-pages-and-publish) | In Progress | APIs exist. Build the editor: map assets, captions, per-page flip, publish and unpublish. |
| [DIG-9](https://linear.app/digital-zine/issue/DIG-9/public-flip-viewer-with-open-graph-previews) | Todo | `FlipCard` exists. Build SSR `/z/[slug]` with Open Graph title, description, and image. |
| [DIG-10](https://linear.app/digital-zine/issue/DIG-10/pdf-export-from-the-published-template) | In Progress | Route exists. Prove it against Postgres and add the download control for Pro. |
| [DIG-11](https://linear.app/digital-zine/issue/DIG-11/stripe-pro-subscription-at-dollar15month) | In Progress | Routes exist. Build `/billing`. Missing Stripe keys must stay non-fatal. |
| [DIG-12](https://linear.app/digital-zine/issue/DIG-12/verify-the-build-smoke-checks-screenshots-and-pr) | Todo | Build, smoke checks, screenshots, mark PR #1 ready. |
| [DIG-13](https://linear.app/digital-zine/issue/DIG-13/agent-handoff-and-principal-engineer-rules) | Done | Handoff and Claude/Cursor rules landed in `1b5f334`. |

Next ticket to resume: finish the missing pages, starting with sign-in and `/board` (DIG-6 and DIG-7). Do not jump to PDF screenshots before those pages exist.

## Session log

Append a row when you stop. Do not delete earlier rows.

| When (America/New_York) | Tool | What changed | Left unfinished |
| --- | --- | --- | --- |
| 18 Nov 2026, 9:10 AM | Cursor cloud agent | Pushed foundation commit `698c7bb` and opened draft PR #1. Filed DIG-5 through DIG-12. | All pages, README, build, smoke checks, screenshots. |
| 18 Nov 2026, 9:15 AM | Cursor cloud agent | Added this handoff plus `CLAUDE.md` and `.cursor/rules/` in `1b5f334`. DIG-13 is Done. | Same product work as above. |

## Before you stop

Even if the session is interrupted, do these before you end. A dirty tree and a stale ticket count as unfinished.

1. Update "Already in the tree", "Not built yet", the ticket table, and the session log in this file.
2. Move the Linear issue you touched. Say what changed, how you checked it, and the exact next step. Leave it In Progress if it is not actually done.
3. Commit on `cursor/digital-zine-mvp-8439`, push, and update pull request #1. Do not open a new pull request.
4. If you did not finish, name the next file to edit and the command to run. "Continue later" is not a status.
