---
name: run-tests
description: How to run Digital Zine tests without flooding the context. Covers which suites to run, the commands, ports, the shared test database, known failures, and when to hand a run to the test-runner subagent. Use before a commit, to check a change, when a test fails, for the red step of TDD, or when the owner asks for a full run.
---

# Run tests

## Which tests

| When | Run |
| --- | --- |
| While coding | Only the test files you are working on |
| Before a commit | `npx vitest run --changed`, `npx tsc --noEmit`, and the e2e specs for the flow you touched |
| Pull request | Nothing extra. CI runs the build and every suite |
| Docs or Markdown only | Nothing |
| Milestone named by the owner, or a change to dependencies, build config, route structure, the Prisma schema, auth, middleware, payments, or shared test helpers | Full run: `npm run build`, then `npm test`, then `npm run test:e2e`, one after another |

## Environment
- There is no global Node. Wrap commands: `nix shell nixpkgs#nodejs_22 -c <command>`.
- Database down: `docker start digital-zine-pg`. If Prisma cannot open `libquery_engine.node`: `nix build --no-link nixpkgs#prisma-engines_6`.

## Commands
- Unit, component, API: `npx vitest run <file> [<file>...]`.
- TypeScript: `npx tsc --noEmit`. Until `DIG-123` lands, one known error at `src/lib/exif-client.test.ts:10` is expected; only new errors count.
- E2E: `npm run test:e2e -- tests/e2e/<spec>.spec.ts --reporter=line`.
  - It builds into `.next-e2e/` first, which is slow.
  - If `next dev` holds port 3417, prefix the command with `E2E_PORT=3418`. The mail sink takes `E2E_PORT + 100`.
  - `E2E_SKIP_BUILD` is for CI: it starts `next start` from `.next`, not `.next-e2e`, so it runs a stale build locally.

## Traps
- **Vitest and Playwright both reset `digital_zine_test` when they start.** Never run them at the same time, and never alongside another session's tests on the same database. Run them one after another.
- `vitest run --changed` runs every test while `.env.test` has uncommitted edits.
- "No test files found" means nothing was tested. It is not a pass.

## Keep output out of the context
- **Any e2e spec, the full Vitest suite, `tsc`, or a build: hand it to the `test-runner` subagent** with the exact commands. It returns only the failures.
- Running it yourself: send the output to a file and read only the summary and the failures, for example `<command> > "$TMPDIR/run.log" 2>&1; tail -30 "$TMPDIR/run.log"`, then `grep -n -A8 "FAIL\|✘\|Error" "$TMPDIR/run.log" | head -80`.

## Red step
- Run only the new test, and check that it fails on the assertion you meant, not on an import error, a typo, or a missing fixture.
- Keep one line of that failure for the ticket comment.

## Reporting
Name each command you ran and its result. Never report a suite as passing unless you ran it or CI did.
