# Agent workflow and context

Decided: owner, 25 Nov 2026, DIG-141; replaces DIG-31.

- Ticket state lives on the ticket: its status and its newest comment, written in the template in `AGENTS.md`. There is no session log; history is ticket comments plus project status updates at milestones.
- The Linear Agent handoff page holds only the active project, the branch policy, and what waits on the owner. It stays under 6,000 characters and is changed by patch only.
- Decisions live here, one file each. Code constraints live in folder `AGENTS.md` files. Production setup lives in `docs/operations.md`.
- `AGENTS.md` is the only copy of the rules. `CLAUDE.md` files import it, and Cursor reads it. `.cursor/rules/` is gone.
- Session start, session close, and test runs are skills (`start-ticket`, `close-session`, `run-tests`), and long test runs go to the `test-runner` subagent on a small model (`DIG-142`).
- Next phases: hooks (`DIG-143`) and parallel worktrees (`DIG-144`).
