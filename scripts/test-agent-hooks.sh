#!/usr/bin/env bash
# Tests the Claude Code hooks and the git pre-commit hook against a throwaway
# repository (DIG-143). Needs bash, git, and jq. Runs in CI and locally:
#   bash scripts/test-agent-hooks.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
H="$ROOT/.claude/hooks"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok()  { pass=$((pass+1)); }
bad() { fail=$((fail+1)); echo "FAIL $*"; }

repo="$T/repo"; mkdir -p "$repo"; cd "$repo"
git init -q -b main && git config user.email t@t && git config user.name t
echo a > a.txt && git add a.txt && git commit -qm init

bash_input() { jq -nc --arg c "$1" --arg d "${2:-$repo}" '{session_id:"s1",cwd:$d,hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:$c}}'; }
guard() { bash_input "$1" "${2:-$repo}" | "$H/guard-git.sh" >"$T/out" 2>"$T/err"; echo $?; }
expect_code() { # expect_code <want> <got> <label>
  [ "$2" = "$1" ] && ok || bad "$3: exit $2, wanted $1 ($(cat "$T/err" "$T/out" 2>/dev/null | head -2))"
}
expect_ask() {
  local code; code=$(guard "$1")
  { [ "$code" = 0 ] && jq -e '.hookSpecificOutput.permissionDecision == "ask"' "$T/out" >/dev/null 2>&1; } && ok || bad "should ask: $1"
}
expect_silent() {
  local code; code=$(guard "$1")
  { [ "$code" = 0 ] && [ ! -s "$T/out" ]; } && ok || bad "should allow silently: $1 (exit $code)"
}

# --- guard-git: on main ---
expect_code 2 "$(guard 'git commit -m x')" "commit on main"
expect_code 2 "$(guard 'git add -A && git commit -qm x')" "commit after add on main"
expect_code 2 "$(guard "git -C $repo commit -m x" "$T")" "git -C into a repo on main"
expect_code 2 "$(guard "cd $repo && git commit -m x" "$T")" "cd into a repo on main"
expect_code 2 "$(guard 'git push')" "push while on main"

# --- guard-git: on a ticket branch ---
git switch -qc joshleyva816/dig-142-skills
expect_silent 'git commit -m "DIG-142: x"'
expect_silent 'git push -u origin HEAD'
expect_silent 'git status'
expect_silent 'ls -la'
expect_silent 'git log --oneline main..HEAD'
expect_code 2 "$(guard 'git push origin main')" "push to main by name"
expect_code 2 "$(guard 'git push origin HEAD:main')" "push HEAD:main"
expect_ask 'git push --force'
expect_ask 'git push -f origin joshleyva816/dig-142-skills'
expect_ask 'git push --force-with-lease'
expect_ask 'git push origin +joshleyva816/dig-142-skills'
expect_ask 'gh pr merge 78 --squash'

# --- session-start ---
echo b > b.txt
jq -nc --arg d "$repo" '{session_id:"s1",cwd:$d,hook_event_name:"SessionStart",source:"startup"}' | "$H/session-start.sh" >"$T/ss" 2>&1
grep -q "joshleyva816/dig-142-skills" "$T/ss" && ok || bad "session-start shows the branch"
grep -q "DIG-142" "$T/ss" && ok || bad "session-start shows the ticket ID"
grep -q "b.txt" "$T/ss" && ok || bad "session-start lists uncommitted files"
[ "$(wc -l < "$T/ss")" -le 15 ] && ok || bad "session-start stays under 15 lines"

# --- stop-check ---
stop() { : >"$T/out"; jq -nc --arg d "$repo" '{session_id:"s1",cwd:$d,hook_event_name:"Stop",stop_hook_active:false}' | "$H/stop-check.sh" >"$T/st" 2>"$T/err"; echo $?; }
expect_code 0 "$(stop)" "stop exits 0"
[ ! -s "$T/st" ] && ok || bad "stop is silent when nothing changed since session start"
echo c > c.txt
expect_code 0 "$(stop)" "stop exits 0 after a change"
jq -e '.systemMessage | test("uncommitted")' "$T/st" >/dev/null 2>&1 && ok || bad "stop warns about work changed this session"
stop >/dev/null; [ ! -s "$T/st" ] && ok || bad "stop warns once per change, not every turn"
git add -A && git commit -qm "DIG-142: c"
expect_code 0 "$(stop)" "stop exits 0 when clean"
[ ! -s "$T/st" ] && ok || bad "stop is silent when everything is committed"

# --- .githooks/pre-commit (tsc is faked) ---
pc() { : >"$T/out"; (cd "$repo" && TSC_CMD="$1" "$ROOT/.githooks/pre-commit" >"$T/pc" 2>"$T/err"); echo $?; }
# A fixture list, so this test does not depend on what the real list holds (it may be empty).
mkdir -p "$repo/.githooks" && printf 'src/lib/exif-client.test.ts(10,\n' > "$repo/.githooks/tsc-known-errors.txt"
echo 'x' > notes.md && git add notes.md
expect_code 0 "$(pc 'false')" "pre-commit skips tsc when no TypeScript is staged"
echo 'export {}' > a.ts && git add a.ts
expect_code 0 "$(pc "printf 'src/lib/exif-client.test.ts(10,5): error TS2322: known\n'")" "pre-commit ignores the known tsc error"
expect_code 1 "$(pc "printf 'src/lib/x.ts(3,1): error TS2304: new\n'")" "pre-commit blocks a new tsc error"
grep -q "src/lib/x.ts" "$T/pc" && ok || bad "pre-commit prints the new error"

echo "Agent hooks: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
