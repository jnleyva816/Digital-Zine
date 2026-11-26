#!/usr/bin/env bash
# Creates a worktree for one ticket, with its own test database and e2e port,
# so several agents can work at once (DIG-144). Run it from any checkout:
#   scripts/worktree-new.sh <gitBranchName> [base, default origin/main]
# It writes the gitignored .env.test.local, never the committed .env.test.
# Env: WORKTREE_NO_INSTALL=1 skips npm ci. PG_CMD overrides the psql command.
set -euo pipefail
branch=${1:?usage: scripts/worktree-new.sh <gitBranchName> [base]}
base=${2:-origin/main}
ticket=$(grep -oiE 'dig-[0-9]+' <<<"$branch" | head -1 | tr '[:upper:]' '[:lower:]') || true
[ -n "$ticket" ] || { echo "No ticket ID (dig-123) in branch name: $branch" >&2; exit 1; }

common=$(cd "$(git rev-parse --git-common-dir)" && pwd)
main_root=$(dirname "$common")
wt="$(dirname "$main_root")/$(basename "$main_root")-$ticket"
db="digital_zine_${ticket//-/}_test"
[ -e "$wt" ] && { echo "Already exists: $wt" >&2; exit 1; }

psql_cmd() {
  if [ -n "${PG_CMD:-}" ]; then "$PG_CMD" "$@"
  else docker exec -i "${PG_CONTAINER:-digital-zine-pg}" psql -U zine -d postgres -v ON_ERROR_STOP=1 "$@"; fi
}
port_in_use() {
  if [ -n "${PORT_IN_USE_CMD:-}" ]; then "$PORT_IN_USE_CMD" "$1"
  else ss -ltn 2>/dev/null | grep -qE "[:.]$1([[:space:]]|$)"; fi
}

# E2E ports 4101-4199; the mail sink takes port + 100 (4201-4299). Skip ports
# that another worktree claims or something is listening on.
taken=$(git worktree list --porcelain | sed -n 's/^worktree //p' | while read -r d; do
  grep -hE '^E2E_PORT=' "$d/.env.test.local" 2>/dev/null | cut -d= -f2 | tr -d '"' || true; done)
port=""
for p in $(seq 4101 4199); do
  grep -qx "$p" <<<"$taken" && continue
  port_in_use "$p" && continue
  port_in_use $((p + 100)) && continue
  port=$p; break
done
[ -n "$port" ] || { echo "No free e2e port in 4101-4199" >&2; exit 1; }

git fetch -q origin 2>/dev/null || true
if git show-ref -q --verify "refs/heads/$branch"; then git worktree add -q "$wt" "$branch"
elif git show-ref -q --verify "refs/remotes/origin/$branch"; then git worktree add -q "$wt" -b "$branch" --track "origin/$branch"
else git worktree add -q "$wt" -b "$branch" "$base"; fi

psql_cmd -c "CREATE DATABASE $db" >/dev/null 2>&1 || echo "Note: could not create $db (it may already exist)."

cat > "$wt/.env.test.local" <<ENV
# Written by scripts/worktree-new.sh for $ticket. Gitignored. Overrides .env.test.
DATABASE_URL="postgresql://zine:zine@127.0.0.1:5432/$db?schema=public"
E2E_PORT="$port"
NEXT_PUBLIC_APP_URL="http://localhost:$port"
ENV

if [ -z "${WORKTREE_NO_INSTALL:-}" ]; then
  # npm ci does not run prisma generate; without it the tests cannot create a PrismaClient.
  echo "Installing dependencies (npm ci, prisma generate)..."
  install='npm ci --no-audit --no-fund >/dev/null && npx prisma generate >/dev/null'
  # shellcheck source=/dev/null
  . "$wt/scripts/nix-env.sh"
  if command -v npm >/dev/null; then (cd "$wt" && sh -c "$install")
  else (cd "$wt" && nix shell nixpkgs#nodejs_22 nixpkgs#openssl -c sh -c "$install"); fi
fi

echo "Worktree: $wt"
echo "Branch:   $branch"
echo "Test DB:  $db (reset by the first test run)"
echo "E2E port: $port (mail sink $((port + 100)))"
