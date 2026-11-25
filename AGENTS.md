# Digital Zine (Folio): agent rules

You are the principal engineer on this repository. This file is the only copy of the rules: `CLAUDE.md` imports it, and Cursor reads it directly. Keep it under 8,000 characters. Put detail in the files listed under "Read when relevant", not here.

Linear is the source of truth for **what** to build and where each ticket stands. This repository is the source of truth for **how**.

## Start of a session

1. Read the [Agent handoff](https://linear.app/joshsws/document/agent-handoff-1dfe2c98ac86) page. It is short: the active project, the branch policy, and what waits on the owner.
2. List the open tickets: `list_issues` with team Digital-Zine, state `started`, and only the fields you need. Read your ticket and its newest comment, which is the checkpoint.
3. Do not read the archived handoff, the old log, or whole long documents "for context". Fetch what the ticket needs.

## Read when relevant

| When you touch | Read first |
| --- | --- |
| A product or behavior question | `docs/decisions/README.md`, then the one decision file |
| `src/lib/` | `src/lib/AGENTS.md` |
| `src/app/` routes, pages, API | `src/app/AGENTS.md` |
| `src/components/` | `src/components/AGENTS.md` |
| `prisma/`, migrations | `prisma/AGENTS.md` |
| Tests, local setup, ports | `tests/AGENTS.md` |
| Production, deploy, Stripe, R2, DNS | `docs/operations.md` |

Claude Code loads a folder's `CLAUDE.md`, which imports its `AGENTS.md`, when you read files in that folder.

## How work is organized

- Work runs ticket by ticket in the Linear team **Digital-Zine**. Projects are goals. The active project is named on the handoff page only.
- Every ticket has exactly one **Area** label (UI/UX, Backend, Security, Payments, Data, Infra, Docs) and one **Type** label (Bug, Feature, Improvement). Label the tickets you create. Split large cross-cutting work into sub-issues.
- Security belongs to every ticket: anything touching auth, permissions, payments, uploads, or user data gets tests for its abuse cases. The Security label is for work whose main purpose is security.
- One branch and one PR per ticket. Branch off an up-to-date `main` using the ticket's `gitBranchName`, and put the ticket ID in the PR title. Never commit to `main`.
- When the handoff page names an integration branch or a shared branch, follow it instead: one commit per ticket with its ID in the message, and push only when the owner says so.
- Only the owner merges. Do not merge unless the user says so in this session.

## Ask when it is not settled

If the decisions, the ticket, and the code do not answer a product, schema, dependency, or architecture question, stop and ask. Do not pick a default and keep going. Do not ask for facts you can read. Do not reopen anything in `docs/decisions/`; you may argue against one, labeled **Challenges a decision**, and leave the decision to the owner.

Ask before you: change the Prisma schema, add a dependency, rewrite a finished module, go past the ticket's scope, force-push, or merge.

## Production bar

Ship each ticket as specified: strict TypeScript, real empty, loading, and error states, accessible controls, server-rendered public pages with Open Graph metadata, and committed tests that prove the path, plus a green CI build. No fake success, no placeholder flows. Do not add deferred scope (print, payouts, extra templates, audio, video) to look more complete.

## Test-driven development

For each behavior in the acceptance: **red** (write the test; see it fail on an assertion, not on a typo or import; note the failure for the ticket comment), **green** (the smallest change that passes), **refactor** (tests stay green, no new behavior).

| Layer | Tool | Location | Use for |
| --- | --- | --- | --- |
| Unit | Vitest (node) | `src/**/*.test.ts` | Pure logic, parsers, validators |
| Component | Vitest + Testing Library (jsdom) | `src/**/*.test.tsx` | Empty, loading, error, validation states, accessible names |
| API | Vitest against the test database | `tests/api/*.test.ts` | 401, 403/404, 400, 409, success |
| End to end | Playwright against `next start` | `tests/e2e/*.spec.ts` | User flows across pages |

- E2E is required when a ticket changes sign-up or sign-in, upload, publishing, the public viewer, billing, or deletion. Elsewhere, use the lowest layer that proves the behavior. Every API route you add or change gets auth, validation, and success tests.
- A bug fix starts with a failing test that reproduces it.
- Tests use only `digital_zine_test` from `.env.test`, never the dev database.
- Query by role and accessible name. If you cannot, fix the control's accessibility first.
- No sleeps. No `.skip`, `.only`, or weakened assertions to reach green.
- Before a commit: `npx vitest run --changed`, `npx tsc --noEmit`, and the e2e specs for the flow you touched. CI runs everything on the PR; do not repeat it locally.
- Run everything locally only at a milestone the owner names, or for changes to dependencies, build config, route structure, the Prisma schema, auth, middleware, payments, or shared test helpers.
- Docs-only changes: no local tests.
- Never report a suite as passing unless you ran it or CI did. Commands, ports, and traps are in `tests/AGENTS.md`.

## Linear status

- One implementation ticket in progress at a time. Starting one means setting it to In Progress and creating its branch.
- **In Review** means the acceptance is met, the tests are committed, the local checks pass, and CI is green on its PR. **Done** only when the owner merges it or says to close it.

## Before you stop

Do this even when you are interrupted or the context is about to end.

1. **Ticket comment**, in this shape. It is the checkpoint the next session reads, so write it for a reader with no context:

   ```
   **Status:** In Progress | In Review, and why
   **Changed:** what was built, with the main files
   **Tests:** which you wrote, seen red then green; which suites you ran
   **Decisions to check:** choices the owner should confirm (or "none")
   **Next:** the file to open, then the exact command
   ```

   One comment per session. Put ticket IDs in backticks (`DIG-123`), or Linear expands each into a long link.
2. **Commit** work that only exists in the working tree; mark it a checkpoint if the ticket is not done. Push, unless the handoff page says not to.
3. **PR**: open or update it as a draft until the ticket is In Review. Do not merge.
4. **Handoff page**: patch it only if the active project, the branch policy, or what waits on the owner changed. Never resend the whole page. Never add session history to it.
5. **Milestones only** (a project goal met, a deploy, a merge into `main`): post a project status update on the active project of three to six lines.

New owner decisions go into `docs/decisions/` in the same PR, as a new file plus one line in the index.
