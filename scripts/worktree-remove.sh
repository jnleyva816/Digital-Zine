#!/usr/bin/env bash
# Removes a ticket's worktree and drops its own test database (DIG-144):
#   scripts/worktree-remove.sh <dig-123 | path>
# Refuses when the worktree has uncommitted work, or commits that are neither
# pushed nor merged into origin/main. Keeps the branch. Never drops a database
# that is not a per-worktree test database (digital_zine_<x>_test, not the
# shared digital_zine_test). Env: PG_CMD overrides the psql command.
set -euo pipefail
arg=${1:?usage: scripts/worktree-remove.sh <dig-123 | path>}
common=$(cd "$(git rev-parse --git-common-dir)" && pwd)
main_root=$(dirname "$common")
if [ -d "$arg" ]; then wt=$(cd "$arg" && pwd)
else wt="$(dirname "$main_root")/$(basename "$main_root")-$(tr '[:upper:]' '[:lower:]' <<<"$arg")"; fi
git worktree list --porcelain | grep -qx "worktree $wt" || { echo "Not a worktree of this repository: $wt" >&2; exit 1; }
[ "$wt" != "$main_root" ] || { echo "Refusing to remove the main checkout." >&2; exit 1; }

psql_cmd() {
  if [ -n "${PG_CMD:-}" ]; then "$PG_CMD" "$@"
  else docker exec -i "${PG_CONTAINER:-digital-zine-pg}" psql -U zine -d postgres -v ON_ERROR_STOP=1 "$@"; fi
}

# Which database does this worktree use? The local file first, then an old-style edited .env.test.
db=$(grep -hoE 'digital_zine_[a-z0-9_]+' "$wt/.env.test.local" 2>/dev/null | head -1 || true)
[ -n "$db" ] || db=$(grep -hoE 'digital_zine_[a-z0-9_]+' "$wt/.env.test" 2>/dev/null | head -1 || true)

# Old-style worktrees symlinked node_modules and edited .env.test (sometimes marked skip-worktree).
[ -L "$wt/node_modules" ] && rm "$wt/node_modules"
git -C "$wt" update-index --no-skip-worktree .env.test 2>/dev/null || true
changes=$(git -C "$wt" status --porcelain | grep -vE '^ M \.env\.test$' || true)
if [ -n "$changes" ]; then
  echo "Refusing: $wt has uncommitted work:" >&2; echo "$changes" | head -10 >&2; exit 1
fi
head=$(git -C "$wt" rev-parse HEAD)
if ! git merge-base --is-ancestor "$head" origin/main 2>/dev/null; then
  if [ -z "$(git branch -r --contains "$head" 2>/dev/null)" ]; then
    echo "Refusing: $wt has commits that are not pushed and not merged into origin/main." >&2; exit 1
  fi
fi

git worktree remove --force "$wt"
if [[ $db =~ ^digital_zine_[a-z0-9]+_test$ && $db != digital_zine_test ]]; then
  psql_cmd -c "DROP DATABASE IF EXISTS $db" >/dev/null && echo "Dropped database $db"
fi
echo "Removed $wt (the branch is kept)."
