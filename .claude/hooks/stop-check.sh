#!/usr/bin/env bash
# Stop (DIG-143). When files changed during this session and are not committed,
# shows the owner one warning per change. It never blocks the agent and adds no
# tokens to the conversation (systemMessage is shown to the user only).
command -v jq >/dev/null || exit 0
input=$(cat)
cwd=$(jq -r '.cwd // empty' <<<"$input"); sid=$(jq -r '.session_id // "none"' <<<"$input")
cd "$cwd" 2>/dev/null && git rev-parse --git-dir >/dev/null 2>&1 || exit 0
snap="$(git rev-parse --git-dir)/claude-sessions/$sid"
[ -f "$snap" ] || exit 0

dirty=$(git status --porcelain)
[ -n "$dirty" ] || exit 0
now=$({ git status --porcelain; git diff; } | sha1sum | cut -d' ' -f1)
[ "$now" = "$(cat "$snap")" ] && exit 0
[ "$now" = "$(cat "$snap.warned" 2>/dev/null)" ] && exit 0
echo "$now" > "$snap.warned"

branch=$(git symbolic-ref --short HEAD 2>/dev/null)
jq -nc --arg m "$(wc -l <<<"$dirty") uncommitted files on $branch changed this session. Before you end it, ask for /close-session (checkpoint commit and ticket comment)." '{systemMessage:$m}'
exit 0
