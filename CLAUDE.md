# Digital Zine — Claude

You are the principal engineer on this repository. The same rules live in `.cursor/rules/` for Cursor. If you change a rule, change it in both places in the same commit.

## Start of every session

Read `docs/agent-handoff.md` and the [Digital Zine MVP](https://linear.app/digital-zine/project/digital-zine-mvp-3317748153f6) issues before you edit anything. The handoff lists work that already exists. Do not rebuild it. Continue branch `cursor/digital-zine-mvp-8439` and draft pull request https://github.com/jnleyva816/Digital-Zine/pull/1. Do not open a second pull request for this MVP.

## Ask when it is not settled

If the handoff, the tickets, and the code do not already answer a product, schema, dependency, or architecture question, stop and ask the user. Do not guess, and do not pick a "reasonable default" and keep going.

Do not ask for facts you can read from the repo, the handoff, or Linear. Do not re-ask decisions listed under "Already decided" in the handoff.

Ask before you: change the Prisma schema, add a dependency, delete or rewrite a module that the handoff says is done, expand past the MVP, force-push, or merge.

## Build to a production bar

Ship the MVP as specified, at a production bar. No toy stand-ins, no fake success responses, no placeholder pages that pretend a flow works.

Within the current ticket that means strict TypeScript, real empty, loading, and error states, accessible controls, server-rendered public zine pages with Open Graph metadata, and committed tests that prove the path you touched (see "Test-driven development"), plus a green `npm run build`.

Do not add print, payouts, extra templates, or other deferred scope because it would be more impressive. Quality applies to the work that was asked for.

## Test-driven development

Work test-first. The tooling and test database were decided on 18 Nov 2026; see "Already decided" in the handoff.

For each behavior in the ticket's acceptance:

1. **Red.** Write the test first. Run it and see it fail for the expected reason: an assertion fails, not a typo or an import error. Put the failing output, or a one-line summary of it, in your notes for the Linear comment.
2. **Green.** Write the smallest production change that makes it pass.
3. **Refactor.** Clean up with the tests green. Do not add behavior here.

Pick the lowest layer that proves the behavior:

| Layer | Tool | Location | Use for |
| --- | --- | --- | --- |
| Unit | Vitest (node) | `src/**/*.test.ts` next to the code | Pure logic in `src/lib/`, parsers, validators, helpers |
| Component | Vitest + Testing Library (jsdom) | `src/**/*.test.tsx` next to the component | Client component states: empty, loading, error, validation, accessible names |
| API | Vitest (node) against the test database | `tests/api/*.test.ts` | Route handlers: auth (401), ownership (403/404), validation (400), conflicts (409), success |
| End to end | `@playwright/test` against `next start` and the test database | `tests/e2e/*.spec.ts` | User-visible flows across pages, in a real browser |

Rules:

- Every user-visible flow in a ticket gets at least one end-to-end test. Every API route you add or change gets API tests for its auth, validation, and success paths.
- A bug fix starts with a test that reproduces the bug and fails. Then fix it.
- Tests never touch the dev database. They use `DATABASE_URL` from `.env.test` (`digital_zine_test`). Tests that write data create their own user and clean up after themselves, or rely on the reset before each run.
- Query by role and accessible name (`getByRole`, `getByLabel`) before test ids. If a control cannot be found by role and name, fix its accessibility first.
- No sleeps to wait for the app. Wait on a response, a URL, or a visible state.
- Do not skip, `.only`, or weaken an assertion to get to green. If a test is wrong, fix it and say why in the Linear comment.
- Before you set a ticket to Done, run `npm run build`, `npm test`, and `npm run test:e2e`, and all three must pass. CI must be green on the pushed commit.
- A checkpoint commit may contain a failing test only if the commit message says so and names it. Do not push failing tests to a branch without that note.

## Run the work like a PM

- One implementation issue in progress at a time. Finish it, or leave it with a precise remaining step.
- When you start an issue, set it to In Progress. Set it to Done only when its acceptance is met, its tests are committed, and `npm run build`, `npm test`, and `npm run test:e2e` pass.
- Comment on the issue with what changed, which tests you wrote (and that you saw them fail first), how you verified it, and what is left.
- Keep `docs/agent-handoff.md` in sync in the same change: done, not done, ticket table, session log.

## Never leave a session unfinished

Before you stop, including when the user interrupts you or the context is about to end:

1. Update `docs/agent-handoff.md` so the next agent can continue without rereading the whole chat.
2. Update the Linear issue you were on. Name the next file and the next command.
3. Commit and push any work that would otherwise exist only in the working tree. Say in the commit message that it is a checkpoint if the ticket is not done.
4. Update pull request #1. Do not mark it ready for review until DIG-12 is actually done.

A session that ends with a stale handoff is not finished.
