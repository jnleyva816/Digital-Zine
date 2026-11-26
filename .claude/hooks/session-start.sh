#!/usr/bin/env bash
# SessionStart (DIG-143). Prints where the session starts, so the agent does
# not spend tool calls finding out, and snapshots the tree for stop-check.sh.
command -v jq >/dev/null || exit 0
input=$(cat)
cwd=$(jq -r '.cwd // empty' <<<"$input"); sid=$(jq -r '.session_id // "none"' <<<"$input")
cd "$cwd" 2>/dev/null && git rev-parse --git-dir >/dev/null 2>&1 || exit 0

branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "detached at $(git rev-parse --short HEAD)")
ticket=$(grep -oiE 'dig-[0-9]+' <<<"$branch" | head -1 | tr '[:lower:]' '[:upper:]')
dirty=$(git status --porcelain)

echo "Branch: $branch${ticket:+ (ticket $ticket)}"
if [ -n "$dirty" ]; then
  echo "Uncommitted files: $(wc -l <<<"$dirty"). Do not touch work that belongs to another ticket."
  head -8 <<<"$dirty"
else
  echo "Working tree: clean"
fi
echo "Start ticket work with /start-ticket${ticket:+ $ticket}. Stop with /close-session."

snap="$(git rev-parse --git-dir)/claude-sessions"; mkdir -p "$snap"
{ git status --porcelain; git diff; } | sha1sum | cut -d' ' -f1 > "$snap/$sid"
exit 0
