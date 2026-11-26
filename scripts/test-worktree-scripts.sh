#!/usr/bin/env bash
# Tests scripts/worktree-new.sh and scripts/worktree-remove.sh against a
# throwaway repository, with the database and npm faked (DIG-144). Needs bash
# and git. Runs in CI and locally:  bash scripts/test-worktree-scripts.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok()  { pass=$((pass+1)); }
bad() { fail=$((fail+1)); echo "FAIL $*"; }

# A main checkout with a remote, like the real one.
git init -q --bare "$T/origin.git"
main="$T/digital-zine"; git clone -q "$T/origin.git" "$main" 2>/dev/null; cd "$main"
git config user.email t@t && git config user.name t && git switch -qc main
mkdir scripts && cp "$ROOT"/scripts/worktree-*.sh scripts/
printf '.env*.local\nnode_modules\n' > .gitignore
echo 'DATABASE_URL="postgresql://zine:zine@127.0.0.1:5432/digital_zine_test?schema=public"' > .env.test
git add -A && git commit -qm init && git push -q origin main

export PG_CMD="$T/fake-psql"; : > "$T/sql.log"
cat > "$PG_CMD" <<FAKE
#!/usr/bin/env bash
echo "\$*" >> "$T/sql.log"
FAKE
chmod +x "$PG_CMD"
export WORKTREE_NO_INSTALL=1 PORT_IN_USE_CMD=false

new() { (cd "$main" && scripts/worktree-new.sh "$@") >"$T/out" 2>&1; echo $?; }
rmw() { (cd "$main" && scripts/worktree-remove.sh "$@") >"$T/out" 2>&1; echo $?; }
envval() { grep -E "^$2=" "$1/.env.test.local" | cut -d= -f2- | tr -d '"'; }

# --- create ---
[ "$(new joshleyva816/dig-144-parallel-tickets)" = 0 ] && ok || bad "creates a worktree: $(cat "$T/out")"
wt="$T/digital-zine-dig-144"
[ "$(git -C "$wt" symbolic-ref --short HEAD 2>/dev/null)" = joshleyva816/dig-144-parallel-tickets ] && ok || bad "worktree is on the ticket branch"
[[ "$(envval "$wt" DATABASE_URL)" == */digital_zine_dig144_test\?schema=public ]] && ok || bad "own test database in .env.test.local"
p1=$(envval "$wt" E2E_PORT)
[ "$p1" -ge 4101 ] && [ "$p1" -le 4199 ] && ok || bad "e2e port in 4101-4199 (got $p1)"
[ "$(envval "$wt" NEXT_PUBLIC_APP_URL)" = "http://localhost:$p1" ] && ok || bad "app URL follows the port"
grep -q "CREATE DATABASE digital_zine_dig144_test" "$T/sql.log" && ok || bad "creates the database"
[ -z "$(git -C "$wt" status --porcelain)" ] && ok || bad ".env.test.local is ignored, so the tree stays clean"

# --- a second worktree gets another port ---
[ "$(new joshleyva816/dig-145-other)" = 0 ] && ok || bad "creates a second worktree"
p2=$(envval "$T/digital-zine-dig-145" E2E_PORT)
[ -n "$p2" ] && [ "$p2" != "$p1" ] && ok || bad "second worktree gets a different port ($p1 / $p2)"

# --- refusals ---
[ "$(new joshleyva816/dig-144-parallel-tickets)" != 0 ] && ok || bad "refuses a worktree that already exists"
[ "$(new main)" != 0 ] && ok || bad "refuses a branch with no ticket ID"

# --- remove ---
echo dirty > "$T/digital-zine-dig-145/x.txt"
[ "$(rmw dig-145)" != 0 ] && ok || bad "refuses to remove a worktree with uncommitted work"
[ -d "$T/digital-zine-dig-145" ] && ok || bad "keeps it"
rm "$T/digital-zine-dig-145/x.txt"
(cd "$T/digital-zine-dig-145" && echo y > y.txt && git add y.txt && git commit -qm "DIG-145: y")
[ "$(rmw dig-145)" != 0 ] && ok || bad "refuses to remove a worktree whose commits are neither pushed nor merged"
(cd "$T/digital-zine-dig-145" && git push -q -u origin HEAD 2>/dev/null)
: > "$T/sql.log"
[ "$(rmw dig-145)" = 0 ] && ok || bad "removes a pushed worktree: $(cat "$T/out")"
[ ! -d "$T/digital-zine-dig-145" ] && ok || bad "the folder is gone"
grep -q "DROP DATABASE IF EXISTS digital_zine_dig145_test" "$T/sql.log" && ok || bad "drops its database"
git -C "$main" rev-parse -q --verify refs/heads/joshleyva816/dig-145-other >/dev/null && ok || bad "keeps the branch"

# Old-style worktree: committed .env.test edited in place, node_modules symlinked.
sed -i 's/digital_zine_test/digital_zine_dig144_test/' "$wt/.env.test"; ln -s /nonexistent "$wt/node_modules"
: > "$T/sql.log"
[ "$(rmw dig-144)" = 0 ] && ok || bad "removes an old-style worktree whose only change is .env.test: $(cat "$T/out")"
grep -q "DROP DATABASE IF EXISTS digital_zine_dig144_test" "$T/sql.log" && ok || bad "drops the old-style database"
[ "$(rmw dig-999)" != 0 ] && ok || bad "fails on an unknown worktree"

# Never drops a database that is not a per-worktree test database.
mkdir -p "$T/digital-zine-dig-146" && git -C "$main" worktree add -q "$T/digital-zine-dig-146" -b joshleyva816/dig-146-x main
printf 'DATABASE_URL="postgresql://zine:zine@127.0.0.1:5432/digital_zine_test"\n' > "$T/digital-zine-dig-146/.env.test.local"
: > "$T/sql.log"
rmw dig-146 >/dev/null
! grep -q "DROP" "$T/sql.log" && ok || bad "never drops the shared digital_zine_test"

echo "Worktree scripts: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
