#!/usr/bin/env bash
# PreToolUse(Bash) guard (DIG-143). Denies commits and pushes on main. Asks the
# owner before a force-push or a merge. Best effort: GitHub branch protection is
# the real guard for main. Fails open if jq is missing.
command -v jq >/dev/null || exit 0
input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")
case "$cmd" in *git*|*gh\ *) ;; *) exit 0 ;; esac

# Work out which repository the command runs in: git -C <dir>, a leading cd <dir> &&, or cwd.
dir=$cwd
if [[ $cmd =~ git[[:space:]]+-C[[:space:]]+([^[:space:]\;\&\|]+) ]]; then dir=${BASH_REMATCH[1]}
elif [[ $cmd =~ ^[[:space:]]*cd[[:space:]]+([^[:space:]\;\&\|]+)[[:space:]]*\&\& ]]; then dir=${BASH_REMATCH[1]}
fi
dir=${dir/#\~/$HOME}; [[ $dir = /* ]] || dir="$cwd/$dir"
branch=$(git -C "$dir" symbolic-ref --short HEAD 2>/dev/null)

deny() { echo "Blocked by .claude/hooks/guard-git.sh: $1" >&2; exit 2; }
ask() {
  jq -nc --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
  exit 0
}

git_sub='git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+'
on_main=0; [[ $branch = main || $branch = master ]] && on_main=1

if [[ $cmd =~ ${git_sub}commit([[:space:]]|$) ]] && [ $on_main = 1 ]; then
  deny "never commit on main. Switch to the ticket's branch (gitBranchName) first."
fi

push=$(grep -oE "${git_sub}push[^;&|]*" <<<"$cmd" | head -1)
if [ -n "$push" ]; then
  [ $on_main = 1 ] && deny "never push from main. Work on the ticket's branch."
  [[ $push =~ ([[:space:]]|:)(main|master)([[:space:]]|$) ]] && deny "never push to main. Only the owner merges into main through a PR."
  [[ $push =~ (--force|[[:space:]]-f([[:space:]]|$)|[[:space:]]\+[^[:space:]]) ]] && ask "Force-push: the rules say ask the owner first."
fi
[[ $cmd =~ gh[[:space:]]+pr[[:space:]]+merge ]] && ask "Merging: only the owner merges, and only when they say so in this session."
exit 0
