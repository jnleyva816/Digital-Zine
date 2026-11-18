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

Within the current ticket that means strict TypeScript, real empty, loading, and error states, accessible controls, server-rendered public zine pages with Open Graph metadata, and a check that proves the path you touched (`npm run build`, and a smoke check when the path is user-visible).

Do not add print, payouts, extra templates, or other deferred scope because it would be more impressive. Quality applies to the work that was asked for.

## Run the work like a PM

- One implementation issue in progress at a time. Finish it, or leave it with a precise remaining step.
- When you start an issue, set it to In Progress. Set it to Done only when its acceptance is met and checked.
- Comment on the issue with what changed, how you verified it, and what is left.
- Keep `docs/agent-handoff.md` in sync in the same change: done, not done, ticket table, session log.

## Never leave a session unfinished

Before you stop, including when the user interrupts you or the context is about to end:

1. Update `docs/agent-handoff.md` so the next agent can continue without rereading the whole chat.
2. Update the Linear issue you were on. Name the next file and the next command.
3. Commit and push any work that would otherwise exist only in the working tree. Say in the commit message that it is a checkpoint if the ticket is not done.
4. Update pull request #1. Do not mark it ready for review until DIG-12 is actually done.

A session that ends with a stale handoff is not finished.
