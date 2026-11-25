# Operations

How production is set up. Read it when a ticket touches deploys, environment variables, Stripe, storage, email, DNS, or monitoring. What is still open lives on the Agent handoff page and in `DIG-18` and `DIG-20`.

## Hosting
- Railway project `digital-zine`: service `web` plus Railway Postgres. Media is in the Cloudflare R2 bucket `digital-zine-media`. The domain is `https://folio-digital-zine.app` (Cloudflare DNS to Railway); the Railway address also works.
- Railway does not let new services use `railway.json`, so the pre-deploy command (`npm run db:deploy`), the health check (`/api/health`), and the restart policy are set on the service itself.
- A redeploy of an existing build skips the pre-deploy command, and so skips migrations. A new build runs it. Pushes to `main` have not always started a build; reconnecting the source (`connect-service-source`) did.
- After a deploy, check `/api/health`, the start-up logs, and that the migrations applied. `/api/health` does not prove the tables exist.
- The app is a long-running container, not serverless: the media worker and the page cache run inside it.

## Environment variables (set in Railway)
- `AUTH_URL` and `NEXT_PUBLIC_APP_URL` must be the public domain. Without `AUTH_URL`, Auth.js sends Google `https://localhost:8080/...` and every Google sign-in fails with `redirect_uri_mismatch`.
- `TRUSTED_PROXY_HOPS=2` (Cloudflare plus Railway). The app has not confirmed that count; if every visitor seems to share one rate-limit bucket, recheck it.
- `CSP_MODE=enforce`. Without it the CSP is report-only.
- Sentry: `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` are set. Source maps also need `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`.
- Email: Resend, called over `fetch`, with `EMAIL_FROM` on the verified domain.
- Stripe: `STRIPE_SECRET_KEY` (restricted), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`. Tax only when `STRIPE_AUTOMATIC_TAX=true`.

## Stripe
- Production currently uses the Stripe sandbox (test mode). Going live means a new live product, price, webhook, and restricted key.
- The webhook must be subscribed to the subscription events, plus `charge.refunded`, `charge.dispute.created`, and `radar.early_fraud_warning.created` (`DIG-15`).
- Before any write with the Stripe tools, check `list_available_accounts_or_orgs` and `livemode`: they have reached the live account by default before.

## R2 uploads (CORS)
- The bucket's CORS rule must list every origin that uploads from a browser: the domain and the Railway address. If the domain changes, update it in Cloudflare (R2, the bucket, Settings, CORS Policy), or every upload fails: the presign succeeds, the browser's PUT to R2 gets a 403 preflight, and no `/api/assets` request follows.
- To check, send an OPTIONS request with `Origin`, `Access-Control-Request-Method: PUT`, and `Access-Control-Request-Headers: content-type` to the bucket's public URL.

## Google sign-in
- The Google app is in Testing mode, so only listed test users can sign in. Publish it before real creators arrive.

## CI and dependencies
- CI runs the build, every test suite, `npm run db:check-migrations`, CodeQL, and `npm audit --omit=dev --audit-level=high` (also weekly).
- `package.json` `overrides` pin `postcss` under Next, and `deepmerge-ts` and `effect` under `@prisma/config`, to avoid Next 16 and Prisma 7 for advisories that only touch build tooling. Drop an override once its parent catches up.
- Dependabot ignores the majors we have deferred (`DIG-124`).
- GitHub secret scanning, push protection, and Dependabot alerts are on.
- Library notes: sharp 0.35 exports types by name (`import sharp, { type Sharp }`). Zod 4 replaced `required_error`, `invalid_type_error`, and `errorMap` with `error`.

## Search
- Cloudflare adds no rules of its own to `/robots.txt`. Submitting the sitemap in Google Search Console is a step only the owner can do.
