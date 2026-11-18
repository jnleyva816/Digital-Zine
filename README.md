# Digital Zine

Creators collect photos on a private Vision Board, sequence them into a full-bleed photo zine, and publish it at `/z/[slug]`. On the public page, each card flips over to show its EXIF data or a recipe. Pro subscribers ($15/month) can export a published zine as a PDF.

Stack: Next.js 15 App Router, React 19, PostgreSQL with Prisma 6, Auth.js credentials, `@react-pdf/renderer`, and Stripe subscriptions.

> Build status: the MVP is in progress on `cursor/digital-zine-mvp-8439`. `docs/agent-handoff.md` lists which pages exist and which are still open.

## Requirements

- Node.js 22 and npm
- PostgreSQL 15 or newer

## Run it locally

1. Install dependencies.

   ```sh
   npm ci
   ```

2. Copy the environment file. `.env` is gitignored; never commit it.

   ```sh
   cp .env.example .env
   ```

3. Start PostgreSQL. The default `DATABASE_URL` expects database `digital_zine`, user `zine`, password `zine` on `127.0.0.1:5432`. With Docker:

   ```sh
   docker run -d --name digital-zine-pg \
     -e POSTGRES_USER=zine -e POSTGRES_PASSWORD=zine -e POSTGRES_DB=digital_zine \
     -p 127.0.0.1:5432:5432 -v digital-zine-pg:/var/lib/postgresql/data postgres:17
   ```

4. Create the tables and seed sample data.

   ```sh
   npm run db:setup
   ```

   The seed creates a Free-tier user, four Vision Board photos with real EXIF, and a published sample zine at `/z/sunday-ferments-issue-01`.

5. Start the dev server and sign in at http://localhost:3000/signin.

   ```sh
   npm run dev
   ```

   | Seeded account | |
   | --- | --- |
   | Email | `creator@digitalzine.local` |
   | Password | `zine1234` |

   Outside production builds, the sign-in form prefills this account. Production builds never show it.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` followed by `next build` |
| `npm start` | Serves the production build |
| `npm run db:push` | Applies `prisma/schema.prisma` to the database |
| `npm run db:seed` | Reseeds the sample user, assets, and zine |
| `npm run db:setup` | `db:push` followed by `db:seed` |

## Environment variables

Every variable lives in `.env.example`. Only the first group is required.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | Auth.js signing secret. In production, generate one with `openssl rand -base64 32`. |
| `AUTH_TRUST_HOST` | Yes | `true` when running behind a proxy or on localhost |
| `NEXT_PUBLIC_APP_URL` | Yes | Canonical public URL, used for Open Graph links and Stripe redirects |
| `LOCAL_STORAGE_DIR` | No | Upload directory for the local storage driver. Default: `.data/uploads` |
| `AWS_S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | No | When all four are set, uploads go straight to S3 through presigned PUT URLs |
| `AWS_S3_ENDPOINT` | No | Endpoint for S3-compatible stores such as R2 or MinIO |
| `AWS_S3_PUBLIC_URL` | No | Public base URL for reading objects |
| `NEXT_PUBLIC_IMAGE_CDN_URL` | No | Image CDN prefix. See below. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID` | No | Pro subscription billing. If these are unset, billing reports that it is not configured and the rest of the app keeps working. |

## Storage

`src/lib/storage/` picks the driver at request time:

- **Local** (default). Browsers upload with `PUT /api/uploads/local/[...key]` to `LOCAL_STORAGE_DIR`, and files are read from `GET /api/media/[...key]`.
- **S3**. `POST /api/uploads/presign` returns a presigned PUT URL, and the browser uploads directly to the bucket.

The browser reads EXIF with `exifreader` before it uploads.

## Swapping in an image CDN

`next/image` uses the custom loader in `src/lib/image-loader.ts`.

- With `NEXT_PUBLIC_IMAGE_CDN_URL` unset, images load from their own URL with `?w=` and `&q=` hints appended.
- With it set, the loader requests `<CDN>?url=<encoded src>&w=<width>&q=<quality>`. This fits image proxies that take a source URL, such as an Imgix web-proxy source or a CloudFront image handler.

The loader is the only file to change if your CDN expects a different URL shape. Because the variable is `NEXT_PUBLIC_`, it is inlined at build time, so rebuild after you change it.

## NixOS

Prisma has no prebuilt engines for NixOS. Use the matching `prisma-engines_6` package from nixpkgs (6.19.3, the same version as the lockfile) and point Prisma at it:

```sh
E=$(nix build --no-link --print-out-paths nixpkgs#prisma-engines_6)
export PRISMA_QUERY_ENGINE_LIBRARY=$E/lib/libquery_engine.node
export PRISMA_SCHEMA_ENGINE_BINARY=$E/bin/schema-engine
export PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
nix shell nixpkgs#nodejs_22 nixpkgs#openssl -c npm run build
```
