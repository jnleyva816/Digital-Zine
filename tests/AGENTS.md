# tests: notes

## Local machine
- NixOS with no global Node: `nix shell nixpkgs#nodejs_22`.
- Postgres runs in the `digital-zine-pg` Docker container, which has no restart policy; after a reboot run `docker start digital-zine-pg`. The dev database is `digital_zine` at `127.0.0.1:5432`, user `zine`, password `zine`. Tests use `digital_zine_test` from `.env.test`.
- Ports 3000 and 3100 are taken. Smoke-test `next start` on 3417. While `next dev` holds 3417, run e2e with `E2E_PORT=3418`.
- Seeded dev user: `creator@digitalzine.local` / `zine1234`. The owner's dev database has their own data (a renamed "Car Show" zine): do not re-seed it.
- A worktree gets its own test database (for example `digital_zine_dig73_test`), and its `.env.test` is marked skip-worktree.

## Running
- **Vitest resets the test database.** Never run Vitest and Playwright at the same time.
- Playwright builds into `.next-e2e/` so it does not clobber `next dev`; CI sets `E2E_SKIP_BUILD`.
- Full e2e only at milestones. Use `--reporter=line` and send the full output to a file; read only the failures.
- Known until `DIG-123` lands: `npx tsc --noEmit` reports one existing error at `src/lib/exif-client.test.ts:10`, so only new errors count. `vitest run --changed` runs everything while `.env.test` has uncommitted edits. "No test files found" does not count as tested.

## Writing
- API tests that make many requests as one user call `resetRateLimits()` in `beforeEach`. Routes that use `after()` need `settleAfter()` from `tests/api/helpers.ts`. `tests/setup/vitest.setup.ts` mocks `next/cache` and `after`.
- Users who sign in with a password need `emailVerifiedAt` (the helpers set it). Sign-in lands on `/boards/<id>` (`BOARD_URL` in the e2e helpers).
- Playwright sends email to a mail sink on `E2E_PORT + 100` (`tests/e2e/mail-sink.ts`) and sets a fake Google client so the buttons show.
- Find our alerts with `getByRole("alert").filter({ hasText })`, because Next adds its own empty `role="alert"`.
- While a View Transition runs, its overlay takes pointer events for about 0.3 s; wait with `settled()` before gestures.
- Playwright runs with the CSP enforced, and `tests/e2e/security.spec.ts` fails on any violation.
- `tests/api/ci-gates.test.ts` guards the audit job, Dependabot, and CodeQL.
- Check PDF text with `tests/pdf-text.ts`. Fill a large board locally with `scripts/seed-large-board.ts <email> [count]` (local databases only).
- The smoke script writes straight to the database and reads seed photos from disk, so it does not work against production.
