#!/usr/bin/env bash
# Keeps the agent rules small and wired up (DIG-143). Runs in CI and locally:
#   bash scripts/check-agent-docs.sh
# A failure names the file and the budget. Trim the file, or move detail to a
# file that loads only when needed (see AGENTS.md, "Read when relevant").
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0
err() { echo "FAIL $*"; fail=1; }

budget() { # budget <max chars> <files...>
  local max=$1; shift
  for f in "$@"; do
    [ -f "$f" ] || continue
    local n; n=$(wc -c < "$f")
    [ "$n" -le "$max" ] || err "$f is $n characters; the budget is $max"
  done
}

shopt -s nullglob
budget 8000 AGENTS.md
budget 6000 src/*/AGENTS.md prisma/AGENTS.md tests/AGENTS.md docs/operations.md
budget 4000 .claude/skills/*/SKILL.md
budget 3000 .claude/agents/*.md
budget 3000 docs/decisions/[0-9]*.md
budget 5000 docs/decisions/README.md

# Every AGENTS.md has a CLAUDE.md beside it that only imports it.
while IFS= read -r a; do
  c="$(dirname "$a")/CLAUDE.md"
  [ "$(cat "$c" 2>/dev/null)" = "@AGENTS.md" ] || err "$c must contain exactly @AGENTS.md"
done < <(git ls-files --cached --others --exclude-standard -- 'AGENTS.md' '*/AGENTS.md')

# Every decision file is in the index, and every index link exists.
for d in docs/decisions/[0-9]*.md; do
  grep -q "($(basename "$d"))" docs/decisions/README.md || err "$d is missing from docs/decisions/README.md"
done
for l in $(grep -oE '\([0-9]{4}-[a-z0-9-]+\.md\)' docs/decisions/README.md | tr -d '()'); do
  [ -f "docs/decisions/$l" ] || err "docs/decisions/README.md links to missing $l"
done

# The hooks are configured, and each hook script exists and is executable.
s=.claude/settings.json
if ! jq -e . "$s" >/dev/null 2>&1; then
  err "$s is missing or is not valid JSON"
else
  for ev in SessionStart PreToolUse Stop; do
    jq -e --arg ev "$ev" '.hooks[$ev] | length > 0' "$s" >/dev/null || err "$s has no $ev hook"
  done
  for cmd in $(jq -r '.. | objects | select(has("command")) | .command' "$s" | grep -oE '\.claude/hooks/[a-z-]+\.sh'); do
    [ -x "$cmd" ] || err "$cmd is referenced in $s but is missing or not executable"
  done
fi
[ -x .githooks/pre-commit ] || err ".githooks/pre-commit is missing or not executable"

[ "$fail" -eq 0 ] && echo "Agent docs: OK"
exit "$fail"
