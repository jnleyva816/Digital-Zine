---
name: close-session
description: Wrap up a Digital Zine work session. Covers the Linear checkpoint comment, the commit and push, the draft PR, the ticket status, and the handoff page only when it needs a change. Use before stopping, when the owner says to wrap up, stop, or pause, after an interruption, or when the context is close to its limit.
---

# Close the session

Work from what you already know. Do not re-run test suites to write the summary.

1. **Facts.** Run `git status --short` and `git log --oneline origin/main..HEAD`. Recall which test commands ran this session and their results.
2. **Commit** anything that exists only in the working tree, on the ticket's branch.
   - Message: `DIG-123: <what changed>`. If the ticket is not done, add `(checkpoint)`. If a committed test fails, name it in the message.
   - If the pre-commit `tsc` check fails, fix the error. Use `--no-verify` only for a checkpoint commit whose message names the failure.
   - End the message with the attribution lines this environment gives.
   - Push, unless the handoff page says this branch is not pushed.
3. **PR.**
   - No PR yet: `gh pr create --draft`, with the ticket ID in the title and the body from `.github/PULL_REQUEST_TEMPLATE.md`.
   - PR exists: update its body if the scope changed.
   - It stays a draft until the ticket is In Review. Never merge.
4. **Status.**
   - In Review only when the acceptance is met, the tests are committed, the local checks passed, and `gh pr checks` is green.
   - Otherwise, leave it In Progress.
   - Never set Done. Only the owner's merge or the owner's word does that.
5. **Ticket comment.** `save_comment` in exactly this shape:

   ```
   **Status:** In Progress | In Review, and why
   **Changed:** what was built, with the main files
   **Tests:** which you wrote, seen red then green; which commands you ran and their results
   **Decisions to check:** choices the owner should confirm, or "none"
   **Next:** the file to open, then the exact command
   ```

   - One comment per session. If you already posted one this session, update it (`save_comment` with its `id`) instead of adding another.
   - At most about 15 lines. Facts only: write "seen red" only if you saw it.
   - Put ticket IDs in backticks (`DIG-123`). Bare IDs expand into long links.
6. **Handoff page.** Change it only if the active project, the branch policy, or what waits on the owner changed.
   - `get_document` `agent-handoff-1dfe2c98ac86`, then `save_document` with `patch`. Never resend the whole page.
   - Remove lines that are done. Never add session history. Keep the page under 6,000 characters.
7. **Decisions.** If the owner decided something new this session, add `docs/decisions/NNNN-<slug>.md` and one line to its index, in this PR.
8. **Milestone update.** Post one only when a project goal is met, after a deploy, or after a merge into `main`.
   - `save_status_update` with `type: project`, the active project, and a health value.
   - Three to six lines.
9. **Worktree.** When the ticket is merged and its folder came from `scripts/worktree-new.sh`, offer to remove it with `scripts/worktree-remove.sh dig-123`. Ask first.
10. **Tell the owner,** in at most five lines: the ticket state, the PR link, the next step, and anything waiting on them.
