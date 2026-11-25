# Stack

Decided: owner, 18 and 20 Nov 2026.

- Next.js App Router, React, PostgreSQL, Prisma, Auth.js with credentials and Google (`DIG-94`).
- `exifreader` in the browser before upload. A storage interface with a local filesystem driver and S3 presigned PUT.
- `@react-pdf/renderer` for PDFs. `next/image` with `src/lib/image-loader.ts`.
- Image work uses `sharp`, and background jobs use `pg-boss`, inside the app (see 0012).
- Production: Railway, Railway Postgres, Cloudflare R2, Sentry, and Resend (see `docs/operations.md`).
