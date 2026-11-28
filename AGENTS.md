# Digital Zine (Folio): agent rules

You are the principal engineer on this repository. This file is the only copy of the rules: `CLAUDE.md` imports it, and Cursor reads it directly. Keep it under 8,000 characters. Put detail in the files listed under "Read when relevant", not here.

Linear is the source of truth for **what** to build and where each ticket stands. This repository is the source of truth for **how**.

## Start of a session

Use the `start-ticket` skill (`.claude/skills/start-ticket/SKILL.md`; in Cursor, read that file and follow it). In short: read the short [Agent handoff](https://linear.app/joshsws/document/agent-handoff-1dfe2c98ac86) page, then only your ticket and its newest comment, which is the checkpoint. Do not read the archived handoff, the old log, or whole long documents "for context".

## Environment (NixOS)

There is no global Node. Always run `node`, `npm`, `npx`, `prisma`, `tsc`, `vitest`, `playwright`, and `next` through the repo's `shell.nix`: `nix-shell --run '<command>'`. Never use `nix shell nixpkgs#...` or bare `npm`. Add a missing tool to `shell.nix`.

## Hooks

In Claude Code, `.claude/settings.json` runs hooks that cost no tokens. A session starts with the branch, the ticket ID, and the uncommitted files already printed. Commits and pushes on `main` are blocked, and a force-push or `gh pr merge` asks the owner. When files changed this session and are not committed, the owner sees a warning at the end of a turn. Once per clone, run `git config core.hooksPath .githooks`: the pre-commit hook then runs `tsc` when TypeScript is staged. `scripts/check-agent-docs.sh` enforces the size budgets in CI.

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
- One branch and one PR per ticket. Branch off an up-to-date `main` using the ticket's `gitBranchName`, and put the ticket ID in the PR title. Never commit to or push `main`.
- When the handoff page names an integration branch or a shared branch, follow it instead: one commit per ticket with its ID in the message, and push only when the owner says so.
- Only the owner merges. Do not merge unless the user says so in this session.

## Ask when it is not settled

If the decisions, the ticket, and the code do not answer a product, schema, dependency, or architecture question, stop and ask. Do not pick a default and keep going. Do not ask for facts you can read. Do not reopen anything in `docs/decisions/`; you may argue against one, labeled **Challenges a decision**, and leave the decision to the owner.

Ask before you: change the Prisma schema, add a dependency, rewrite a finished module, go past the ticket's scope, force-push, or merge.

## Production bar

Ship each ticket as specified: strict TypeScript, real empty, loading, and error states, accessible controls, server-rendered public pages with Open Graph metadata, and committed tests that prove the path, plus a green CI build. No fake success, no placeholder flows. Do not add deferred scope (print, payouts, extra templates, audio, video) to look more complete.

## Test-driven development

Test by risk (decision 0026): color, spacing, and copy changes skip test-first (look at them, run `npm run typecheck`); auth, payments, schema, middleware, and dependencies get every suite. For each behavior in the acceptance: **red** (write the test; see it fail on an assertion, not on a typo or import; note the failure for the ticket comment), **green** (the smallest change that passes), **refactor** (tests stay green, no new behavior).

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
- Which suites to run when, the commands, and the traps: the `run-tests` skill (`.claude/skills/run-tests/SKILL.md`). Hand long runs to the `test-runner` subagent so their output stays out of your context.
- Never report a suite as passing unless you ran it or CI did.

## Linear status

- One implementation ticket in progress at a time. Starting one means setting it to In Progress and creating its branch.
- **In Review** means the acceptance is met, the tests are committed, the local checks pass, and CI is green on its PR. **Done** only when the owner merges it or says to close it.

## Before you stop

Use the `close-session` skill (`.claude/skills/close-session/SKILL.md`), even when interrupted or near the context limit. It covers the ticket comment template, the commit and push, the draft PR, the status, and the handoff page.

The ticket's newest comment is the checkpoint the next session reads. Without it, the next session starts blind.

New owner decisions go into `docs/decisions/` in the same PR, as a new file plus one line in the index.
