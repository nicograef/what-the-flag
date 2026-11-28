# In a recipe, $$ escapes the $ so the shell expands it, not make. A make variable
# holding shell output needs $(shell ...); `VAR := $$(cmd)` stores the literal text.

# Load .env variables (DB credentials etc.) for all targets; `-include` lets `make check` run without it.
-include .env
export

# An explicit -f beats the COMPOSE_FILE a server's .env sets for plain `docker compose`.
COMPOSE_DEV = docker compose -f docker-compose.yml
COMPOSE_PROD = docker compose -f docker-compose.prod.yml

BACKEND_DIR ?= backend
FRONTEND_DIR ?= frontend

# ── Local Development (one terminal per target) ──

# >>> stack: database
.PHONY: db

db:            ## Start database container
	$(COMPOSE_DEV) up postgres
# <<< stack: database

# >>> stack: go
.PHONY: be

be:            ## Start backend on :8080
	cd $(BACKEND_DIR) && go run ./cmd/what-the-flag
# <<< stack: go

# >>> stack: frontend
.PHONY: fe

fe:            ## Start frontend dev server
	cd $(FRONTEND_DIR) && pnpm dev
# <<< stack: frontend

# ── Code Quality ──

# `check` runs the steps of ci.yml's backend and frontend gate and scan jobs, test shuffling included.
# `be-integration` and `e2e` mirror two more CI jobs; upgrade-path, pins and secrets run only in CI.

.PHONY: check

check:         ## Run all checks

# >>> stack: go
# `sqlc diff` fails on stale generated code, as ci.yml's drift check does, but ignores a dirty tree.
.PHONY: be-check
check: be-check

be-check: data-check ## Backend: Go gate (modules, generated code, format, vet, lint, build, tests, vulns)
	cd $(BACKEND_DIR) && go mod verify
	cd $(BACKEND_DIR) && go mod tidy -diff
	cd $(BACKEND_DIR) && go tool sqlc diff
	cd $(BACKEND_DIR) && go tool goimports -l . | (! grep .)
	cd $(BACKEND_DIR) && go vet ./...
	cd $(BACKEND_DIR) && golangci-lint run
	cd $(BACKEND_DIR) && go build ./...
	cd $(BACKEND_DIR) && go test -shuffle=on -race ./...
	cd $(BACKEND_DIR) && go tool govulncheck ./...

.PHONY: be-integration

# TEST_ARGS narrows the run, e.g. `make be-integration TEST_ARGS='-count=1 -v -run=TestMe'`.
be-integration: ## Backend: integration tests against the `make db` database (TEST_ARGS passes go test flags)
	cd $(BACKEND_DIR) && go test -tags=integration -race $(TEST_ARGS) ./...

.PHONY: data data-check

data:          ## Regenerate the country dataset and flags from data/
	cd $(BACKEND_DIR) && go run ./cmd/importdata

data-check:    ## Fail when the generated dataset differs from the importer's output
	cd $(BACKEND_DIR) && go run ./cmd/importdata -check
# <<< stack: go

# >>> stack: frontend
.PHONY: fe-check
check: fe-check

fe-check:      ## Frontend: pnpm gate (install, format, lint, types, tests, build, audit)
	cd $(FRONTEND_DIR) && pnpm install --frozen-lockfile
	cd $(FRONTEND_DIR) && pnpm run format:check
	cd $(FRONTEND_DIR) && pnpm run lint
	cd $(FRONTEND_DIR) && pnpm run typecheck
	cd $(FRONTEND_DIR) && pnpm run test
	cd $(FRONTEND_DIR) && pnpm run build
	cd $(FRONTEND_DIR) && pnpm audit --audit-level high
# <<< stack: frontend

# ── End to End (docker-compose.prod.yml with local TLS) ──

.PHONY: e2e

e2e:           ## Build the production stack, serve it with local TLS and run scripts/smoke.sh against it
	scripts/e2e-stack.sh scripts/smoke.sh

# ── Local Stack (docker-compose.yml — no TLS) ──

.PHONY: up down logs

up:            ## Start all services locally
	$(COMPOSE_DEV) up --build

down:          ## Stop local services
	$(COMPOSE_DEV) down

logs:          ## Follow logs
	$(COMPOSE_DEV) logs -f

# ── Production (docker-compose.prod.yml — HTTPS) ──

# The Compose files carry the project name (`name:`), so every target reaches the same stack.

.PHONY: prod-deploy prod-down prod-logs

prod-deploy:   ## First deploy or update to the pinned tags (cert, backup, downgrade guard, health poll)
	./scripts/prod-init.sh

prod-down:     ## Stop production stack
	$(COMPOSE_PROD) down

prod-logs:     ## Follow production logs
	$(COMPOSE_PROD) logs -f

.PHONY: prod-migrate prod-stats prod-hide

# The `migrate` service's entrypoint holds the database URL, so ARGS replace only `up`.
prod-migrate:  ## Run golang-migrate on the production database (ARGS="version", default up)
	$(COMPOSE_PROD) run --rm migrate $(or $(ARGS),up)

prod-stats:    ## Print the owner statistics of database/stats.sql from production
	$(PSQL_PROD) < database/stats.sql

prod-hide:     ## Hide every run of a production run's player from every leaderboard (RUN=<uuid>)
	$(call hide-run,$(PSQL_PROD))

# ── Release ──

.PHONY: prod-release

# The tag goes only on origin/main's tip with a green CI push run, which release.yml checks again
# before it builds; every gate job runs on a main push, so that run covers the whole tree.
prod-release:  ## Push tag v$(VERSION); .github/workflows/release.yml builds the images (VERSION=X.Y.Z)
	@echo "$(VERSION)" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$$' \
	  || { echo "Error: set VERSION=X.Y.Z (got '$(VERSION)')" >&2; exit 1; }
	@BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$BRANCH" != "main" ]; then echo "Error: must be on main (currently on $$BRANCH)" >&2; exit 1; fi
	@git fetch --quiet origin main
	@SHA=$$(git rev-parse HEAD); \
	if [ "$$SHA" != "$$(git rev-parse origin/main)" ]; then echo "Error: main differs from origin/main; push or pull first" >&2; exit 1; fi; \
	CI=$$(gh run list --workflow ci.yml --branch main --event push --commit "$$SHA" --json conclusion --jq '.[0].conclusion'); \
	if [ "$$CI" != "success" ]; then echo "Error: CI on $$SHA is '$$CI', not success" >&2; exit 1; fi
	git tag -a v$(VERSION) -m "v$(VERSION)" && git push origin v$(VERSION)

# ── Utilities ──

# >>> stack: database
.PHONY: db-shell

db-shell:      ## Open psql shell in running PostgreSQL container
	$(COMPOSE_DEV) exec postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

.PHONY: db-migrate

# The `migrate` service is a one-shot; `run` starts postgres first when `make db` is not running.
db-migrate:    ## Apply pending migrations to the `make db` database
	$(COMPOSE_DEV) run --rm --build migrate

# psql in the `postgres` service of the dev or the production stack; -T reads SQL from stdin.
PSQL_DEV = $(COMPOSE_DEV) exec -T postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB) -v ON_ERROR_STOP=1
PSQL_PROD = $(COMPOSE_PROD) exec -T postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB) -v ON_ERROR_STOP=1

# hide-run sets hidden on every run of run RUN's player through the psql command $(1), and fails on a malformed or unknown id.
# RUN reaches the shell only as the quoted variable "$$RUN" (the top-level `export`), never as recipe text.
define hide-run
@printf '%s' "$$RUN" | tr '\n' ' ' | grep -Eqi '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$$' \
  || { printf "Error: set RUN=<uuid> (got '%s')\n" "$$RUN" >&2; exit 1; }
@echo "UPDATE runs SET hidden = true WHERE player_id = (SELECT player_id FROM runs WHERE id = :'run') RETURNING id;" \
  | $(1) -qtA -v run="$$RUN" | grep . \
  || { printf 'Error: no run %s\n' "$$RUN" >&2; exit 1; }
endef

.PHONY: stats hide

stats:         ## Print the owner statistics of database/stats.sql from the `make db` database
	$(PSQL_DEV) < database/stats.sql

hide:          ## Hide every run of a run's player from every leaderboard (RUN=<uuid>)
	$(call hide-run,$(PSQL_DEV))
# <<< stack: database

# ── Help ──

# Every documented target stands in exactly one CLASS_* list, and `make help` prints the
# lists as its sections. A target in none prints under UNCLASSIFIED.
CLASS_developer := db be fe be-check be-integration data data-check fe-check check e2e up down logs db-shell db-migrate stats hide help
CLASS_production := prod-deploy prod-down prod-logs prod-migrate prod-stats prod-hide prod-release

HELP_WIDTH ?= 96

.PHONY: help

# `$(firstword $(MAKEFILE_LIST))`, not the whole list: `include .env` would put `.env` in it.
help:          ## Show every target, by class (HELP_WIDTH=<n> moves the wrap column)
	@grep -hE '^[a-zA-Z0-9_-]+:.*##' $(firstword $(MAKEFILE_LIST)) \
	  | awk -v width=$(HELP_WIDTH) \
	        -v developer='$(CLASS_developer)' -v production='$(CLASS_production)' \
	        -f scripts/make-help.awk

.DEFAULT_GOAL := help
