---
name: start-ticket
description: Start or resume a Digital Zine Linear ticket. Use at the start of any session that works on a ticket (for example DIG-123), or when the owner says to start, resume, continue, or pick up a ticket, or asks "what's next". Loads only the state the ticket needs and sets up its branch.
argument-hint: "[DIG-123]"
---

# Start a ticket

Ticket: $ARGUMENTS (when empty, find it in step 2).

Read only what is listed here. Do not open the archived handoff, the old log, or older ticket comments "for context".

1. **Handoff page.** `get_document` `agent-handoff-1dfe2c98ac86`. Note the active project, the branch policy, and anything that waits on the owner for this ticket.
2. **Pick the ticket** (only when none was given). `list_issues` with team `Digital-Zine`, state `started`, and fields `id, title, status, gitBranchName`.
   - If one is In Progress, resume it.
   - If none is, ask the owner which ticket to take. Offer three to five from the active project (`list_issues` with `project`, state `unstarted`, fields `id, title, priority`).
   - Never start a second implementation ticket while one is In Progress, unless the owner says so.
3. **Read the ticket.** `get_issue` with fields `id, title, description, status, labels, gitBranchName, parentId`. Then `list_comments` with `limit: 2` and `orderBy: createdAt`: the newest comment is the checkpoint. Read older comments only when the newest one points to them.
4. **Decisions.** Only if the ticket raises a product question, read `docs/decisions/README.md` and then the one file that answers it.
5. **Branch.**
   - The session-start hook already printed the branch and the uncommitted files. Never touch uncommitted work that belongs to another ticket.
   - Resuming: switch to the ticket's existing branch, or its worktree (`git worktree list`).
   - New, with a clean tree: `git fetch origin && git switch -c <gitBranchName> origin/main`.
   - New, with someone else's work in the tree: `git worktree add ../digital-zine-<id> -b <gitBranchName> origin/main`. If tests will run there while another session also runs tests, it needs its own test database (see `tests/AGENTS.md`).
   - When the handoff page names a shared or integration branch for this ticket, use that branch instead.
   - When the ticket is blocked by an unmerged ticket whose files it needs, branch off that ticket's branch and say so in the PR ("stacked on #N").
6. **Status.** If starting, set it to In Progress and assign it to `me`.
7. **Plan.** List each behavior in the acceptance, with the test layer that proves it (the table in `AGENTS.md`). List every open question about the schema, dependencies, scope, or product, and ask the owner **before** writing code.

Tell the owner in at most six lines: the ticket, the branch, where the checkpoint says to resume, the plan, and the questions.
