# Plan: First release

> Source PRD: docs/prds/prd-rebuild.md (Operations: practice rounds only in the first release)

## Goal

Make `v0.1.0` taggable as soon as practice rounds land. The real images run behind the real edge with local TLS.
Migrations apply on deploy through a one-shot service, and every image carries its licences. Accounts, duels and weekly follow in later releases.

## Architectural decisions

| Topic | Decision |
| --- | --- |
| Why a separate plan | The executor parses one plan per lane. A plan of its own lands between quiz-practice and accounts without splitting release-readiness's phase numbers |
| Who migrates (R9) | One-shot Compose service `migrate` in `docker-compose.prod.yml`. `backend.depends_on.migrate` is `service_completed_successfully`. `make prod-deploy` runs `scripts/prod-init.sh`: backup, pull, then `up -d --wait`, which runs `migrate` |
| Why not an operator step | A manual `migrate up` before `make prod-deploy` skips prod-init's backup. On a first deploy it creates the database volume without `.deploy-state`, and prod-init then refuses to run |
| `up --wait` and a one-shot | Compose `pkg/compose/start.go — getDependencyCondition()` waits for `service_completed_successfully` on a service another one depends on that way. `--wait` accepts `migrate` exiting 0 and fails on a non-zero exit |
| Migration source | Image `ghcr.io/nicograef/what-the-flag-migrate:vX.Y.Z` from `database/Dockerfile`: `FROM migrate/migrate:v4.20.1`, `COPY migrations /migrations`. The tag carries exactly the release's migrations |
| Migrate invocation | `entrypoint: ["migrate", "-path", "/migrations", "-database", "postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres/${POSTGRES_DB}?sslmode=disable"]`, `command: ["up"]`. A `run` argument replaces only `command` |
| DSN without port | Host `postgres` takes the default port 5432. CI's restore drill greps `postgres:[0-9]` in the prod file for the image; `postgres:5432` would match it |
| Manual migrate | `make prod-migrate ARGS="version"` runs `docker compose -f docker-compose.prod.yml run --rm migrate $(ARGS)`, default `up`. `force` follows `reference/postgresql.md` |
| Pin consistency | `migrate`, `backend` and `edge` share one tag in the prod file: `v0.1.0` here. The migrate base pin equals `MIGRATE_VERSION` in `ci.yml` |
| Stack under test | `docker compose -p what-the-flag-e2e -f docker-compose.prod.yml -f docker-compose.e2e.yml`. The override adds `build:` and `:e2e` image names for backend, migrate and edge. Release-readiness later adds the browser test to the same stack, hence the `e2e` names |
| Local TLS | The override runs `caddy run --config /etc/caddy/e2e.Caddyfile`. That file holds `{ local_certs skip_install_trust }` and `import /etc/caddy/Caddyfile`; site blocks stay verbatim |
| Edge port and credentials | Edge `ports: !override ["127.0.0.1:8443:443"]`; `app-network.enable_ipv6: false`. `scripts/e2e.sh` exports `POSTGRES_USER=e2e POSTGRES_PASSWORD=e2e POSTGRES_DB=whattheflag` |
| Smoke checks | Through the edge with `curl -fsk --resolve what-the-flag.de:8443:127.0.0.1`: health; `POST /api/practice` with `Origin: https://what-the-flag.de:8443` returns a `roundId`; that round reads `playing`; `/practice/<id>` serves the SPA. Plus `schema_migrations` equals the highest migration number |
| Docker in the cloud session (R29) | `dockerd &`, wait for `docker info`. Builds use `--network host` and `/root/.ccr/ca-bundle.crt` per `/root/.ccr/README.md` through the gitignored `docker-compose.local.yml` or build args. The committed Dockerfiles stay clean |
| CI job `e2e` | `timeout-minutes: 20`, runs `make e2e` when filter output `e2e` is true or on `refs/heads/main`. Criteria read it per R31 |
| Licences in images (R28) | `backend/Dockerfile` copies `internal/country/dataset/LICENSE` and, through the named build context `root`, `NOTICE` to `/usr/share/doc/what-the-flag/`. `reverse-proxy/Dockerfile` copies `NOTICE` and `data/LICENSE` there |
| Named context `root` | `docker-compose.yml` and `docker-compose.e2e.yml` set backend `build.additional_contexts: {root: .}`; the release matrix passes `build-contexts: root=.` for backend. A bare `docker build backend` needs `--build-context root=.` |

## Inventory

- `docker-compose.prod.yml`, `scripts/prod-init.sh`, `.github/workflows/release.yml`, `reverse-proxy/Caddyfile`, `reverse-proxy/Dockerfile`, `backend/Dockerfile` (foundation) — prod stack and images.
- `Makefile — CLASS_developer, CLASS_production, MIGRATE_VERSION`, `.github/workflows/ci.yml — changes` (foundation) — targets, filters, pinned SHAs. Its `upgrade-path` job reads only `database/migrations`.
- `NOTICE`, `data/LICENSE`, `backend/internal/country/dataset/LICENSE` (country-data) — licence files the images carry.
- `backend/internal/quiz — POST /api/practice, GET /api/rounds/{id}`, `frontend/src/features/play/practice-page.tsx` (quiz-practice) — the smoke path.
- `/root/.ccr/README.md` — "docker build / docker run" section (R29).

## Open questions / Risks

- quiz-practice phases 1–4 land first. Re-check every path named here against the landed tree.
- The server's Compose must carry `getDependencyCondition()`. Compose tags since v2.7.0 do; the handbook server setup installs a current plugin.
- The DB password lands in the migrate URL. It must be URL-safe; `.env.example` says so.
- A global options block added to `reverse-proxy/Caddyfile` breaks the `import` in `e2e.Caddyfile`. Move such options into both files.
- The handbook deploy guide knows no `migrate` service. Proposing it to the handbook is outside this repo.

## Phase 1: Production stack runs under test

**Depends on**: none

### Context

- `docker-compose.prod.yml`, `scripts/prod-init.sh` — `up -d --wait` is where migrations run.
- `.github/workflows/release.yml`, `.github/workflows/ci.yml`, `Makefile` — see Inventory.

### What to build

- `database/Dockerfile` per the decisions.
- `docker-compose.prod.yml`: service `migrate` after `postgres`: image `ghcr.io/nicograef/what-the-flag-migrate:v0.1.0`, `restart: "no"`, `db-network`, `*default-logging`, `memory: 64M`, `depends_on: postgres: service_healthy`, entrypoint and command per the decisions. `backend.depends_on` gains `migrate: condition: service_completed_successfully`.
- `.github/workflows/release.yml`: matrix entry `service: migrate`, `context: ./database`, `file: ./database/Dockerfile`.
- `docker-compose.e2e.yml`: `build:` plus `what-the-flag-{backend,migrate,edge}:e2e`; edge context `.`, file `reverse-proxy/Dockerfile`, port, read-only mount of `reverse-proxy/e2e.Caddyfile`, the `caddy run` command, `enable_ipv6: false`.
- `reverse-proxy/e2e.Caddyfile` per the decisions.
- `scripts/e2e.sh` (handbook script header, `set -euo pipefail`): export the credentials; add `-f docker-compose.local.yml` when it exists (R29); `up -d --build --wait`; the smoke checks; an EXIT trap prints `logs` on failure and runs `down --volumes` unless `KEEP=1`.
- `Makefile`: `e2e` (`scripts/e2e.sh`) in `CLASS_developer`; `prod-migrate` in `CLASS_production`.
- `.github/workflows/ci.yml`: filter `e2e` (`backend/**`, `frontend/**`, `database/**`, `reverse-proxy/**`, `docker-compose*.yml`, `scripts/e2e.sh`, the workflow), its output, and job `e2e` (`needs: changes`, SHA-pinned checkout, `make e2e`).
- `.env.example`: a comment that `POSTGRES_PASSWORD` must be URL-safe.
- `docs/decisions.md`: one D line for the migrate service, one for the e2e stack with local TLS.

### Acceptance criteria

- [ ] Stack, migrate image, `up --wait` with an exited one-shot and the practice smoke (local, R29): `make e2e` exits 0.
- [ ] CI job `e2e` green on the lane's pushed head (lead checks, R31).
- [ ] Manual migrate keeps the DSN: `docker compose -f docker-compose.prod.yml --env-file .env.example config --format json | jq -r '.services.migrate.entrypoint[1:3] | join(" ")'` prints `-path /migrations`.
- [ ] `! make help | grep -q UNCLASSIFIED` exits 0.
- [ ] `make check` passes.

## Phase 2: Licences in images

**Depends on**: 1

### Context

- `backend/Dockerfile`, `reverse-proxy/Dockerfile`, `reverse-proxy/Dockerfile.dockerignore`, `NOTICE`, `data/LICENSE` — licence copies (R28).
- `docker-compose.yml`, `docker-compose.e2e.yml`, `.github/workflows/release.yml` — backend build contexts.

### What to build

- `backend/Dockerfile`, `reverse-proxy/Dockerfile` per the licence decision; `reverse-proxy/Dockerfile.dockerignore` gains `!NOTICE`, `!data/LICENSE`.
- `docker-compose.yml`, `docker-compose.e2e.yml`, `.github/workflows/release.yml`: the `root` build context for backend.

### Acceptance criteria

- [ ] Backend image (after `make e2e`): `docker run --rm --entrypoint ls what-the-flag-backend:e2e /usr/share/doc/what-the-flag | paste -sd' '` prints `LICENSE NOTICE`.
- [ ] Edge image (after `make e2e`): `docker run --rm --entrypoint ls what-the-flag-edge:e2e /usr/share/doc/what-the-flag | paste -sd' '` prints `LICENSE NOTICE`.
- [ ] Dev build keeps working: `docker compose build backend` exits 0 (R29 route in the cloud session).
- [ ] `make check` passes.

## Phase 3: Release check for v0.1.0

**Depends on**: 2

### Context

- `docker-compose.prod.yml`, `database/Dockerfile`, `.github/workflows/release.yml`, `.github/workflows/ci.yml`, `reverse-proxy/Caddyfile`.

### What to build

- Run every check below on the run branch; fix any failure in its own commit. No feature lands here.

### Acceptance criteria

- [ ] Pins: `grep -cE 'what-the-flag-(backend|edge|migrate):v0\.1\.0' docker-compose.prod.yml` prints 3.
- [ ] Migrate pin: `grep -hoE 'v4\.[0-9]+\.[0-9]+' database/Dockerfile .github/workflows/ci.yml | sort -u | wc -l` prints 1.
- [ ] Release matrix: `grep -cE 'service: (backend|edge|migrate)$' .github/workflows/release.yml` prints 3.
- [ ] Placeholders: `grep -rnE '<(owner|project|name|domain|database-name)>' docker-compose.prod.yml .github reverse-proxy scripts Makefile` prints nothing.
- [ ] Domain: `grep -c 'what-the-flag.de' reverse-proxy/Caddyfile` prints ≥ 3.
- [ ] CI job `e2e` green on the lane's pushed head (lead checks, R31).
- [ ] `make check` passes.
