# src/app: notes

## Routing
- The public zine is `z/[owner]/[slug]/page.tsx`; the old `/z/<slug>` redirect is `z/[owner]/page.tsx`. Next requires every dynamic segment at one level to share a name. The build passes when they don't, but the server will not start, and only the e2e run catches it.
- The public viewer has no `loading.tsx`: a Suspense boundary turns its 404s into streamed 200s.
- After a route moves, `npm run build` can fail on stale generated types. Delete `.next`, `.next-e2e`, and `.next-smoke`.

## Rendering and headers
- The root layout awaits `headers()` so every page renders per request; a prerendered page cannot carry the CSP nonce.
- `src/middleware.ts` runs on everything except `_next/static` and `_next/image`. It applies `checkSameOrigin` to POST, PUT, PATCH, and DELETE (the Stripe webhook and `/api/csp-report` are exempt), then sets the security headers and the CSP.
- `metadata.icons` in the layout lists every icon, because naming one drops the file-based ones. The share image is `opengraph-image.tsx`; `twitter-image.tsx` re-exports it.
- `robots.ts` and `sitemap.ts` (force-dynamic, published zines only); `/llms.txt` is a route.

## API routes
- Every write route, presign, and PDF: the 401 check first, then `limitRequest`. Scope ownership in the query's `where`, not after the read.
- Routes that take a storage key check it with `src/lib/storage/keys.ts` first. The local PUT never decodes segments itself.
- Anything that changes what readers see revalidates the public zine (`src/lib/public-zine-cache.ts`).
- `GET /api/pdf/[slug]` is owner-only (404 for anyone else) and sends `Cache-Control: private, no-store`.
- `GET /api/assets?boardId=&limit=&cursor=` pages the board, and `?ids=` serves the processing poll. Reorder treats the sent ids as the loaded prefix and renumbers the whole board in one SQL statement.
- `DELETE /api/assets/[id]` returns 409 while a zine page uses the photo.
- `POST /api/password/forgot` answers before it looks the address up and does the rest in `after()`, so the response time never reveals who has an account. Keep it that way.
- `POST /api/account/delete` needs the typed email plus the password or a sign-in from the last five minutes (`getAuthenticatedUser().signedInAt`).
- Billing return URLs come only from `NEXT_PUBLIC_APP_URL`. The Stripe webhook finds the user only by `stripeCustomerId`.
- `/api/health` returns 200 only when the database answers; it does not prove the tables exist.
