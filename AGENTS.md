# AGENTS.md

How to work in this repository. This file points at the sources of truth. It does not repeat their rules.

Linear is the source of truth for **what** to build. This repository is the source of truth for **how**.

Read these, in order, before editing:

1. [Agent handoff](https://linear.app/digital-zine/document/agent-handoff-186930851c71) — current state: decisions, what is already built, the active Linear project, and open tickets. Review this page before editing. The active project is named only there. Session history is the [log](https://linear.app/digital-zine/document/agent-handoff-log-b0673a41c909); do not read it before editing. Do not recreate `docs/agent-handoff.md`.
2. [`CLAUDE.md`](CLAUDE.md) — one ticket, one branch, one pull request; when to ask; the production bar; test-driven development; what to update before you stop.
3. [`.cursor/rules/`](.cursor/rules/) — the same rules, split for Cursor. If you change a rule, change it in `CLAUDE.md` and the matching rule in the same commit.
   - [`review-handoff.mdc`](.cursor/rules/review-handoff.mdc)
   - [`principal-engineer.mdc`](.cursor/rules/principal-engineer.mdc)
   - [`project-management.mdc`](.cursor/rules/project-management.mdc)
   - [`test-driven.mdc`](.cursor/rules/test-driven.mdc)

Do not rebuild anything the handoff lists as already in the tree. Do not merge a pull request unless the owner says so in the session.
