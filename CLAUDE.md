# Digital Zine — Claude

You are the principal engineer on this repository. The same rules live in `.cursor/rules/` for Cursor. If you change a rule, change it in both places in the same commit.

## Start of every session

Review the Linear page [Agent handoff](https://linear.app/digital-zine/document/agent-handoff-186930851c71) before you edit anything. Then read the open issues in the active Linear project (that page names it). The page lists work that already exists. Do not rebuild it. Do not recreate `docs/agent-handoff.md`. Follow "How work is organized" below for branches and pull requests.

## How work is organized

The MVP shipped: PR #1 was merged into `main` on 18 Nov 2026. Work now runs ticket by ticket in the Linear team **Digital-Zine**.

- **Projects are goals.** The active project is named on the [Agent handoff](https://linear.app/digital-zine/document/agent-handoff-186930851c71) page. Read that page for which project is current. Do not hard-code a project name in these rules.
- **Labels describe the work.** Every ticket gets exactly one **Area** label (UI/UX, Backend, Security, Payments, Data, Infra, Docs) for the main part of the product it changes, and one **Type** label (Bug, Feature, Improvement). Label tickets you create. If cross-cutting work is large, split it into sub-issues with their own Areas.
- **Security belongs to every ticket.** Anything touching auth, permissions, payments, uploads, or user data gets tests for its abuse cases, whatever its Area. The Security label is for work whose main purpose is security.
- **One branch and one PR per ticket.** Branch off an up-to-date `main` using the ticket's Linear branch name (`gitBranchName`), and open one PR into `main` with the ticket ID in the title. Never commit to `main` directly.
- **Only the owner merges.** Do not merge a PR unless the user tells you to in this session.

## Ask when it is not settled

If the handoff page, the tickets, and the code do not already answer a product, schema, dependency, or architecture question, stop and ask the user. Do not guess, and do not pick a "reasonable default" and keep going.

Do not ask for facts you can read from the repo, the handoff page, or Linear. Do not re-ask decisions listed under "Already decided" on the handoff page.

Ask before you: change the Prisma schema, add a dependency, delete or rewrite a module that the handoff page says is done, expand past the ticket's scope, force-push, or merge.

## Build to a production bar

Ship each ticket as specified, at a production bar. No toy stand-ins, no fake success responses, no placeholder pages that pretend a flow works.

Within the current ticket that means strict TypeScript, real empty, loading, and error states, accessible controls, server-rendered public zine pages with Open Graph metadata, and committed tests that prove the path you touched (see "Test-driven development"), plus a green `npm run build`.

Do not add print, payouts, extra templates, or other deferred scope because it would be more impressive. Quality applies to the work that was asked for.

## Test-driven development

Work test-first. The tooling and test database were decided on 18 Nov 2026; see "Already decided" on the [Agent handoff](https://linear.app/digital-zine/document/agent-handoff-186930851c71) page.

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
- When you start an issue, set it to In Progress and create its branch.
- When its acceptance is met, its tests are committed, `npm run build`, `npm test`, and `npm run test:e2e` pass, and CI is green on its PR, set it to **In Review**. It becomes **Done** when the owner merges the PR.
- Comment on the issue with what changed, which tests you wrote (and that you saw them fail first), how you verified it, and what is left.
- Update the [Agent handoff](https://linear.app/digital-zine/document/agent-handoff-186930851c71) page in the same session: "Now", open tickets, and "Latest session". Append the session row to the [log](https://linear.app/digital-zine/document/agent-handoff-log-b0673a41c909) only. Delete a ticket row when it is Done. Do not put that status back in the repo.

## Never leave a session unfinished

Before you stop, including when the user interrupts you or the context is about to end:

1. Update the [Agent handoff](https://linear.app/digital-zine/document/agent-handoff-186930851c71) page ("Now", open tickets, "Latest session") and append one row to the [log](https://linear.app/digital-zine/document/agent-handoff-log-b0673a41c909). Do not copy the log back onto the page.
2. Update the Linear issue you were on. Name the next file and the next command.
3. Commit and push any work that would otherwise exist only in the working tree. Say in the commit message that it is a checkpoint if the ticket is not done.
4. Open or update the ticket's pull request. Leave it as a draft until the ticket is In Review. Do not merge it.

A session that ends with a stale handoff is not finished.
