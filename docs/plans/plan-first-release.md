# Plan: First release

> Source PRD: docs/prds/prd-rebuild.md (Operations: practice rounds only in the first release)

## Goal

Make `v0.1.0` taggable once practice rounds land. The real images run behind the real edge with local TLS, and a smoke script proves them.
Migrations apply on deploy through a one-shot service, and every image carries its licences.

## Architectural decisions

| Topic | Decision |
| --- | --- |
| Who migrates | One-shot Compose service `migrate` in `docker-compose.prod.yml`. `backend.depends_on.migrate` is `service_completed_successfully`. `make prod-deploy` runs `scripts/prod-init.sh`: backup, pull, then `up -d --wait`, which runs `migrate` |
| Why not an operator step | A manual `migrate up` before `make prod-deploy` skips prod-init's backup. On a first deploy it creates the database volume without `.deploy-state`, and prod-init then refuses to run |
| `up --wait` and a one-shot | Compose waits for `service_completed_successfully` on a service another one depends on that way. `--wait` accepts `migrate` exiting 0 and fails on a non-zero exit |
| Migration image | `ghcr.io/nicograef/what-the-flag-migrate:vX.Y.Z` from `database/Dockerfile`: `FROM migrate/migrate:v4.20.1`, `COPY migrations /migrations`. The tag carries exactly the release's migrations |
| Migrate invocation | `entrypoint: ["migrate", "-path", "/migrations", "-database", "postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres/${POSTGRES_DB}?sslmode=disable"]`, `command: ["up"]`. A `run` argument replaces only `command` |
| DSN without port | Host `postgres` takes port 5432. CI's restore drill greps `postgres:[0-9]` in the prod file for the image; `postgres:5432` would match it |
| Manual migrate | `make prod-migrate ARGS="version"` runs `docker compose -f docker-compose.prod.yml run --rm migrate $(ARGS)`, default `up`. `force` follows the handbook's `reference/postgresql.md` |
| Pin consistency | `migrate`, `backend` and `edge` share one tag in the prod file: `v0.1.0` here. The migrate base pin equals `MIGRATE_VERSION` in `.github/workflows/ci.yml` |
| Stack under test | Files `docker-compose.prod.yml` and `docker-compose.e2e.yml`, plus `docker-compose.local.yml` when present. The override adds `build:` and the images `what-the-flag-{backend,migrate,edge}:e2e` |
| Local TLS | The override runs `caddy run --adapter caddyfile --config /etc/caddy/e2e.Caddyfile`. That file holds `{ local_certs skip_install_trust }` and `import /etc/caddy/Caddyfile`; site blocks stay verbatim |
| Edge port and network | Edge `ports: !override ["127.0.0.1:${E2E_STACK_PORT:-8443}:443"]`; `app-network.enable_ipv6: false` (CI runners lack IPv6) |
| Stack runner | `scripts/e2e-stack.sh <command> [args]`, the jotti pattern. Defaults `E2E_STACK_PROJECT=what-the-flag-e2e`, `E2E_STACK_PORT=8443`, both overridable |
| Smoke script | `scripts/smoke.sh` checks one running stack at `E2E_BASE_URL` with curl and `jq`, printing `ok <check>` per check. The first failure exits 1 |
| Docker in the cloud session | `dockerd &`, then wait until `docker info` exits 0. The gitignored `docker-compose.local.yml` carries the session CA and `network: host` for builds. Committed Dockerfiles stay clean |
| CI job `e2e` | `timeout-minutes: 20`, `needs: changes`, runs `make e2e` when filter output `e2e` is true or on `refs/heads/main`. The main run closes the gap of path-filtered jobs on a tagged commit |
| Licences in images | `backend/Dockerfile` copies `internal/country/dataset/LICENSE` and, through the named build context `root`, `NOTICE` to `/usr/share/doc/what-the-flag/`. `reverse-proxy/Dockerfile` copies `NOTICE` and `data/LICENSE` there |
| Named context `root` | `docker-compose.yml` and `docker-compose.e2e.yml` set backend `build.additional_contexts: {root: .}`; the release matrix passes `build-contexts: root=.` for backend. It keeps the template Dockerfile's other `COPY` lines |
| Dependabot | `.github/dependabot.yml` gains a `docker` entry for `/database`, monthly and grouped like the template's entries |

`scripts/e2e-stack.sh` steps (handbook script header, `set -euo pipefail`):

1. Export `COMPOSE_PROJECT_NAME`, `COMPOSE_FILE` (colon list), `COMPOSE_PROFILES=e2e`, `E2E_STACK_PORT` and `POSTGRES_USER=e2e POSTGRES_PASSWORD=e2e POSTGRES_DB=whattheflag`.
2. Trap EXIT: `docker compose down -v`. Run `docker compose up -d --build --wait`; on failure print `ps` and `logs`, exit 1.
3. Run the command with `E2E_BASE_URL=https://what-the-flag.de:$E2E_STACK_PORT`. On a non-zero exit print `logs`; exit with the command's status.

`scripts/smoke.sh` checks, each `curl -fsS -k --resolve what-the-flag.de:<port>:127.0.0.1`:

| Check | Request | Expect |
| --- | --- | --- |
| `health` | `GET /api/health` | `{"status":"ok"}` |
| `practice` | `POST /api/practice`, body `{}`, `Content-Type: application/json`, `Origin: $E2E_BASE_URL` | 201, a `roundId` |
| `round` | `GET /api/rounds/<roundId>` | `status` `playing`, `question.position` 0 |
| `spa` | `GET /practice/<roundId>` | 200 HTML with `<div id="root">` |
| `migrations` | `docker compose exec -T postgres psql -U e2e -d whattheflag -tAc 'SELECT version, dirty FROM schema_migrations'` | `<highest number in database/migrations>\|f` |

## Inventory

- `docker-compose.prod.yml`, `docker-compose.yml`, `scripts/prod-init.sh`, `.github/workflows/release.yml`, `reverse-proxy/Caddyfile`, `reverse-proxy/Dockerfile`, `backend/Dockerfile` (foundation) — prod stack and images.
- `Makefile — CLASS_developer, CLASS_production, MIGRATE_VERSION`, `.github/workflows/ci.yml — changes, upgrade-path`, `.github/dependabot.yml` (foundation) — targets, filters, pins.
- `NOTICE`, `data/LICENSE`, `backend/internal/country/dataset/LICENSE` (country-data) — licence files the images carry.
- `backend/internal/quiz — POST /api/practice, GET /api/rounds/{id}`, `frontend/src/features/play/practice-page.tsx` (quiz-practice) — the smoke path.
- jotti `scripts/e2e-stack.sh`, `docker-compose.prod.yml — migrate` — patterns for the runner and the one-shot service.

## Open questions / Risks

- The server's Compose must wait on `service_completed_successfully` under `up --wait`. Compose v2.7.0 and later do; the handbook server setup installs a current plugin.
- The DB password lands in the migrate URL, so it must be URL-safe. `.env.example` says so.
- A global options block added to `reverse-proxy/Caddyfile` breaks the `import` in `e2e.Caddyfile`. Such options go into both files.
- Dependabot bumps `database/Dockerfile` alone. `MIGRATE_VERSION` in `ci.yml` follows in the same PR; phase 2's pin criterion catches drift.
- The session's `docker-compose.local.yml` also feeds the dev stack. An edge entry there gets `profiles: [e2e]`, which `COMPOSE_PROFILES=e2e` activates.
- The handbook deploy guide knows no `migrate` service. Proposing it there is outside this repo.

## Phase 1: Production stack under test

**Depends on**: none

### Context

- `docker-compose.prod.yml`, `scripts/prod-init.sh` — `up -d --wait` is where migrations run.
- `.github/workflows/release.yml`, `.github/workflows/ci.yml`, `.github/dependabot.yml`, `Makefile` — see Inventory. Stack criteria need `dockerd` running.

### What to build

- `database/Dockerfile` per the decisions.
- `docker-compose.prod.yml`: service `migrate` after `postgres`: image `ghcr.io/nicograef/what-the-flag-migrate:v0.1.0`, `restart: "no"`, `db-network`, `*default-logging`, `memory: 64M`.
  It has `depends_on: postgres: service_healthy` and the entrypoint and command above. `backend.depends_on` gains `migrate: condition: service_completed_successfully`.
- `.github/workflows/release.yml`: matrix entry `service: migrate`, `context: ./database`, `file: ./database/Dockerfile`.
- `docker-compose.e2e.yml`: `build:` and `:e2e` image names for backend, migrate and reverse-proxy (context `.`, file `reverse-proxy/Dockerfile`).
  The edge also gets the port, a read-only mount of `reverse-proxy/e2e.Caddyfile` and the `caddy run` command; `app-network` gets `enable_ipv6: false`.
- `reverse-proxy/e2e.Caddyfile` per the decisions.
- `scripts/e2e-stack.sh`, `scripts/smoke.sh` per the decisions.
- `Makefile`: `e2e` (`scripts/e2e-stack.sh scripts/smoke.sh`) in `CLASS_developer`; `prod-migrate` in `CLASS_production`.
- `.github/workflows/ci.yml`: filter `e2e` and its output, then job `e2e` (SHA-pinned checkout, `make e2e`).
  Filter paths: `backend/**`, `frontend/**`, `database/**`, `reverse-proxy/**`, `docker-compose.prod.yml`, `docker-compose.e2e.yml`, `scripts/e2e-stack.sh`, `scripts/smoke.sh`, the workflow.
- `.github/dependabot.yml`: the `/database` docker entry. `.env.example`: a comment that `POSTGRES_PASSWORD` must be URL-safe.
- `docs/decisions.md`: the next `Dnn` line: the e2e stack runs the production compose file with Caddy local certificates. It tests the real site blocks and Origin with port.

### Acceptance criteria

- [ ] Stack, migrate image, `up --wait` with an exited one-shot and every smoke check: `make e2e`
- [ ] A failing command fails the run and leaves no container: `! E2E_STACK_PROJECT=wtf-e2e-neg scripts/e2e-stack.sh false && test -z "$(docker ps -aq --filter label=com.docker.compose.project=wtf-e2e-neg)"`
- [ ] Manual migrate keeps the DSN: `test "$(docker compose -f docker-compose.prod.yml --env-file .env.example config --format json | jq -r '.services.migrate.entrypoint[1:3] | join(" ")')" = '-path /migrations'`
- [ ] `! make help | grep -q UNCLASSIFIED`
- [ ] `grep -q 'directory: "/database"' .github/dependabot.yml`
- [ ] CI job `e2e` green on the pushed head (lead checks).
- [ ] `make check` passes.

## Phase 2: Licences in images and the v0.1.0 check

**Depends on**: 1

### Context

- `backend/Dockerfile`, `reverse-proxy/Dockerfile`, `reverse-proxy/Dockerfile.dockerignore`, `NOTICE`, `data/LICENSE` — licence copies.
- `docker-compose.yml`, `docker-compose.e2e.yml`, `.github/workflows/release.yml` — backend build contexts.
- `docker-compose.prod.yml`, `database/Dockerfile`, `.github/workflows/ci.yml` — release pins.

### What to build

- `backend/Dockerfile`, `reverse-proxy/Dockerfile` per the licence decision; `reverse-proxy/Dockerfile.dockerignore` gains `!NOTICE` and `!data/LICENSE`.
- `docker-compose.yml`, `docker-compose.e2e.yml`, `.github/workflows/release.yml`: the `root` build context for backend.
- Any pin or placeholder the criteria below find wrong, fixed in the file that holds it. No feature lands here.

### Acceptance criteria

- [ ] Backend image carries both files: `make e2e && test "$(docker run --rm --entrypoint ls what-the-flag-backend:e2e /usr/share/doc/what-the-flag | paste -sd' ')" = 'LICENSE NOTICE'`
- [ ] Edge image (built by the criterion above): `test "$(docker run --rm --entrypoint ls what-the-flag-edge:e2e /usr/share/doc/what-the-flag | paste -sd' ')" = 'LICENSE NOTICE'`
- [ ] Dev build keeps working: `docker compose build backend`
- [ ] Prod pins: `test "$(grep -cE 'what-the-flag-(backend|edge|migrate):v0\.1\.0' docker-compose.prod.yml)" = 3`
- [ ] One migrate version: `test "$(grep -hoE 'v4\.[0-9]+\.[0-9]+' database/Dockerfile .github/workflows/ci.yml | sort -u | wc -l)" = 1`
- [ ] Release matrix: `test "$(grep -cE 'service: (backend|edge|migrate)$' .github/workflows/release.yml)" = 3`
- [ ] No placeholders: `! grep -rnE '<(owner|project|name|domain|database-name)>' docker-compose*.yml database .github reverse-proxy scripts Makefile`
- [ ] `make check` passes.
