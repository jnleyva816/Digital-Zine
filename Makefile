# Local development shortcuts. `make help` lists them.
#
# Works from the main checkout and from a worktree made by scripts/worktree-new.sh: a worktree
# borrows the main checkout's .env and uploads folder, so it runs against the same dev database
# and photos. On NixOS every Node command runs inside `nix shell` with the Prisma engines
# (scripts/nix-env.sh); elsewhere it runs as is.

SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

# The dev server port. 3000 and 3100 are taken on the owner's machine (tests/AGENTS.md).
PORT ?= 3417
# The main checkout, also from inside a worktree.
MAIN_DIR := $(shell dirname "$$(git rev-parse --path-format=absolute --git-common-dir)")
RUN_DIR := .data
PID_FILE := $(RUN_DIR)/dev-server.pid
LOG_FILE := $(RUN_DIR)/dev-server.log

ifneq ($(wildcard /etc/NIXOS),)
NODE = source scripts/nix-env.sh && nix shell nixpkgs\#nodejs_22 nixpkgs\#openssl -c
else
NODE =
endif

# Addresses the app builds (billing returns, share links) follow the port actually used, and a
# worktree stores uploads where the main checkout does.
DEV_ENV = NEXT_PUBLIC_APP_URL=http://localhost:$(PORT) LOCAL_STORAGE_DIR=$(MAIN_DIR)/.data/uploads

.PHONY: help
help: ## List the commands
	@grep -hE '^[a-z][a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-14s %s\n", $$1, $$2}'

# ---------------------------------------------------------------------------------------------
# Dev server

.env:
	@if [ -f "$(MAIN_DIR)/.env" ] && [ "$(MAIN_DIR)" != "$(CURDIR)" ]; then \
	  ln -s "$(MAIN_DIR)/.env" .env && echo "Linked .env from $(MAIN_DIR)"; \
	else echo "No .env. Copy .env.example to .env and fill it in (README)." >&2; exit 1; fi

.PHONY: dev
dev: .env pg-start ## Run the dev server in this terminal (PORT=3417)
	$(NODE) env $(DEV_ENV) npx next dev -p $(PORT)

.PHONY: dev-start
dev-start: .env pg-start ## Start the dev server in the background; logs in .data/dev-server.log
	@mkdir -p $(RUN_DIR)
	@if [ -f $(PID_FILE) ] && kill -0 "$$(cat $(PID_FILE))" 2>/dev/null; then \
	  echo "Already running (pid $$(cat $(PID_FILE))) on http://localhost:$(PORT)"; exit 0; fi
	@if ss -ltn | grep -q ":$(PORT) "; then echo "Port $(PORT) is in use. Try make dev-start PORT=3420" >&2; exit 1; fi
	@setsid bash -c '$(NODE) env $(DEV_ENV) npx next dev -p $(PORT)' > $(LOG_FILE) 2>&1 < /dev/null & echo $$! > $(PID_FILE)
	@echo "Starting on http://localhost:$(PORT) (pid $$(cat $(PID_FILE)))"
	@for i in $$(seq 1 120); do \
	  if curl -fs -o /dev/null http://localhost:$(PORT)/api/health; then echo "Ready: http://localhost:$(PORT)"; exit 0; fi; \
	  if ! kill -0 "$$(cat $(PID_FILE))" 2>/dev/null; then echo "The server stopped. Last lines of $(LOG_FILE):" >&2; tail -20 $(LOG_FILE) >&2; exit 1; fi; \
	  sleep 1; done; echo "Not ready after 2 minutes; see make dev-logs" >&2; exit 1

.PHONY: dev-stop
dev-stop: ## Stop the background dev server
	@if [ -f $(PID_FILE) ] && kill -0 "$$(cat $(PID_FILE))" 2>/dev/null; then \
	  kill -- -"$$(cat $(PID_FILE))" 2>/dev/null || kill "$$(cat $(PID_FILE))"; rm -f $(PID_FILE); echo "Stopped"; \
	else rm -f $(PID_FILE); echo "Not running"; fi

.PHONY: dev-restart
dev-restart: dev-stop dev-start ## Restart the background dev server

.PHONY: dev-logs
dev-logs: ## Follow the background dev server's log
	@tail -n 50 -f $(LOG_FILE)

.PHONY: dev-status
dev-status: ## Whether the dev server is running and answering
	@if [ -f $(PID_FILE) ] && kill -0 "$$(cat $(PID_FILE))" 2>/dev/null; then echo "Running (pid $$(cat $(PID_FILE)))"; else echo "Not running"; fi
	@curl -fs -o /dev/null -w "GET /api/health: %{http_code}\n" http://localhost:$(PORT)/api/health || echo "GET /api/health: no answer"

.PHONY: update
update: ## Pull this branch, install, generate the client, migrate the dev database, restart
	git pull --ff-only
	@if ! cmp -s package-lock.json node_modules/.package-lock.json; then $(NODE) npm ci; else echo "Dependencies unchanged"; fi
	$(NODE) npx prisma generate
	$(MAKE) db-migrate
	@if [ -f $(PID_FILE) ] && kill -0 "$$(cat $(PID_FILE))" 2>/dev/null; then $(MAKE) dev-restart; fi

# ---------------------------------------------------------------------------------------------
# Database (the dev database in .env; tests use their own, see tests/AGENTS.md)

.PHONY: pg-start
pg-start: ## Start the local Postgres container if it is stopped
	@if command -v docker >/dev/null && docker inspect digital-zine-pg >/dev/null 2>&1; then \
	  docker start digital-zine-pg >/dev/null; \
	  for i in $$(seq 1 30); do docker exec digital-zine-pg pg_isready -q && exit 0; sleep 1; done; \
	  echo "Postgres did not start" >&2; exit 1; fi

.PHONY: db-status
db-status: .env pg-start ## Which migrations the dev database has not applied
	$(NODE) npx prisma migrate status

.PHONY: db-migrate
db-migrate: .env pg-start ## Apply pending migrations to the dev database (never resets it)
	$(NODE) npx prisma migrate deploy
	$(NODE) npx prisma generate

.PHONY: db-new
db-new: ## Write a migration from schema changes since main: make db-new NAME=add_thing
	@if [ -z "$(NAME)" ]; then echo "Usage: make db-new NAME=short_name" >&2; exit 1; fi
	@dir=prisma/migrations/$$(date -u +%Y%m%d%H%M%S)_$(NAME); mkdir -p $$dir; \
	git show origin/main:prisma/schema.prisma > $(RUN_DIR)/schema-main.prisma; \
	$(NODE) npx prisma migrate diff --from-schema-datamodel $(RUN_DIR)/schema-main.prisma \
	  --to-schema-datamodel prisma/schema.prisma --script > $$dir/migration.sql; \
	if [ ! -s $$dir/migration.sql ] || ! grep -q '[A-Z]' $$dir/migration.sql; then rm -r $$dir; echo "No schema changes since main"; \
	else echo "Wrote $$dir/migration.sql. Read it, then make db-migrate and make db-check"; fi

.PHONY: db-check
db-check: ## Prove the migrations match the schema (what CI runs)
	$(NODE) npm run db:check-migrations

.PHONY: db-studio
db-studio: .env pg-start ## Open Prisma Studio on the dev database
	$(NODE) npx prisma studio

# ---------------------------------------------------------------------------------------------
# Checks

.PHONY: typecheck
typecheck: ## Type-check (known errors: .githooks/tsc-known-errors.txt)
	$(NODE) npx tsc --noEmit

.PHONY: test
test: ## Unit, component, and API tests (resets the test database)
	$(NODE) npm test
