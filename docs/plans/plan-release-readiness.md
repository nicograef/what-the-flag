# Plan: Release readiness

> Source PRD: docs/prds/prd-rebuild.md

## Goal

Make `v0.1.0` taggable. The real images run locally behind the real edge, and one browser test plays a duel through them.
Production configuration matches the PRD, migrations apply on deploy, and the docs describe the final tree.

## Architectural decisions

| Topic | Decision |
| --- | --- |
| Who migrates | A one-shot Compose service `migrate` in `docker-compose.prod.yml`. `backend` depends on it with `service_completed_successfully`. `make prod-deploy` therefore migrates after its pre-update backup and pull, inside `up --wait` |
| Why not an operator step | A manual `migrate up` before `make prod-deploy` runs before `scripts/prod-init.sh` takes its backup. On a first deploy it creates the volume, which prod-init's guard then refuses |
| Migration source | Image `ghcr.io/nicograef/what-the-flag-migrate:vX.Y.Z`, built from `database/Dockerfile`: `FROM migrate/migrate:v4.20.1`, `COPY migrations /migrations`. The tag carries exactly the release's migrations; the server's `main` checkout never feeds `migrate` |
| Manual migrate | `make prod-migrate ARGS="version"` runs `docker compose -f docker-compose.prod.yml run --rm migrate` with ARGS, default `up`; for `version` and `force` per `reference/postgresql.md` |
| Schema guard | `backend/internal/postgres — SchemaVersion` is a Go constant, the highest migration number. A unit test reads `../database/migrations` and fails when they differ. Nothing outside the module is embedded |
| Guard behaviour | `main.go` calls `postgres.CheckSchema(ctx, pool, postgres.SchemaVersion)` before serving. Version lower, dirty or no `schema_migrations` table: log `database schema behind binary` with `have`, `want`, `dirty`, exit 1. Higher passes (additive forward-only migrations) |
| E2E location | `frontend/e2e/duel.e2e.ts`, config `frontend/playwright.config.ts`, script `pnpm run e2e`. The `.e2e.ts` suffix keeps it out of Vitest's default include; `fe-check` lints and typechecks it but never runs it |
| Stack under test | `docker compose -p what-the-flag-e2e -f docker-compose.prod.yml -f docker-compose.e2e.yml`. The override adds `build:` for backend, migrate and edge, so the prod file, real Caddyfile, images and Postgres 18 run |
| Local TLS | `what-the-flag.de` is a public name, so Caddy would ask Let's Encrypt and fail. The override runs `caddy run --config /etc/caddy/e2e.Caddyfile`; that file holds `{ local_certs skip_install_trust }` and `import /etc/caddy/Caddyfile`. Certificates come from Caddy's internal CA; the site blocks stay verbatim |
| Browser routing | Edge port `127.0.0.1:8443:443` (`ports: !override`). Chromium runs with `--host-resolver-rules=MAP what-the-flag.de 127.0.0.1` and `ignoreHTTPSErrors`; `baseURL` is `https://what-the-flag.de:8443` |
| Session cookie | The page is HTTPS, so the `__Host-` cookie with `Secure` is stored and sent as in production. Plain HTTP would drop it on a non-localhost name |
| Clock | The test clicks an option as soon as a question renders. Ten questions take seconds; no test-only server switch exists |
| E2E credentials | `scripts/e2e.sh` exports `POSTGRES_USER=e2e POSTGRES_PASSWORD=e2e POSTGRES_DB=whattheflag`; no env file. `-p what-the-flag-e2e` scopes its `down --volumes` to the test stack |
| IPv6 in e2e | The override sets `app-network.enable_ipv6: false`; CI runners need no IPv6 pool |
| CSP | Added in `reverse-proxy/Caddyfile`: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`. Vite emits no inline script; Tailwind is a built CSS file; React `style` props use CSSOM, which CSP allows; `data:` covers Vite-inlined small assets |
| CSP enforcement | The e2e test fails on any console error, CSP violations included |
| Memory | Backend keeps `memory: 512M`; prod compose adds `GOMEMLIMIT: 400MiB` literal. Check: `N × m + baseline ≤ 0.75 × 512 MiB`. `m` is the argon2id memory cost, `N` the cap on concurrent hashes, baseline the idle RSS |
| `.env.example` gate | `scripts/check-env-example.sh` diffs the names in `.env.example` (active and `# NAME=` lines) against the readers, both directions. Readers: `os.Getenv`/`os.LookupEnv` in `backend/`, `${NAME}` in `docker-compose*.yml`, plus `COMPOSE_FILE` (docker compose) and `BACKUP_PING_URL` (`scripts/backup-postgres.sh`) named in the script. `make env-check` runs it inside `make check` |
| CI e2e | Job `e2e` in `.github/workflows/ci.yml`, filter output `e2e`, `timeout-minutes: 20`; runs `make e2e` |

## Inventory

- `docker-compose.prod.yml` — prod stack; gains `migrate`, the backend dependency, `GOMEMLIMIT`.
- `reverse-proxy/Caddyfile`, `reverse-proxy/Dockerfile` — edge; gains the CSP header.
- `backend/Dockerfile` — backend image under test.
- `.github/workflows/release.yml` — gains the `migrate` matrix entry.
- `.github/workflows/ci.yml` — gains the `e2e` job and the env check.
- `scripts/prod-init.sh`, `scripts/backup-postgres.sh` — unchanged; their order (backup, pull, `up --wait`) drives the migrate decision.
- `backend/cmd/what-the-flag/main.go — main()` — wiring; gains the schema guard.
- `backend/internal/postgres/` — pool and test helper; gains `schema.go`.
- `backend/internal/config/` — the env readers the env check greps.
- `backend/internal/account/` — argon2id parameters and hash concurrency.
- `backend/internal/httpx/` — Origin check the e2e host and port must pass.
- `frontend/src/features/{auth,dashboard,duels,leaderboard}/` — screens and `messages.ts` labels the test selects by role.
- `Makefile`, `.env.example`, `README.md`, `AGENTS.md`, `docs/README.md`, `docs/decisions.md`, `.gitignore`.

## Open questions / Risks

- The feature plans are written in parallel with this one. Re-check every file and symbol named here against the landed tree before phase 1: config reader form, `httpx` Origin check, `account` hash parameters, Makefile targets `db-migrate` and `be-integration`, feature UI labels, Vitest `include`, `tsconfig.node.json`.
- `up --wait` with a one-shot service: one forum report (Compose v2.17) shows exit 1 when such a container exits. Phase 1 proves the behaviour. Fallback, in order: Compose `pre_start` on `backend`; else an explicit `make prod-migrate` after a manual `scripts/backup-postgres.sh`, documented in the README.
- Chromium may refuse `Secure` cookies under `ignoreHTTPSErrors`. Fallback: export `/data/caddy/pki/authorities/local/root.crt` and trust it in a test NSS database.
- The `httpx` Origin check must compare `Origin` with the request `Host` including the port. A fixed `https://what-the-flag.de` would reject the test; then publish `127.0.0.1:443:443` instead.
- A global options block added to `reverse-proxy/Caddyfile` breaks the `import` in `e2e.Caddyfile`. Move such options into both files.
- A shadcn component that injects a `<style>` element breaks `style-src 'self'`. Fallback: add `'unsafe-inline'` to `style-src` only, recorded in `docs/decisions.md`.
- The env check greps `os.Getenv`. If `internal/config` wraps it in a helper, the regex matches that helper instead.
- The handbook guide URLs in the README assume `github.com/nicograef/handbook` is readable by its readers.
- The handbook deploy guide knows no `migrate` service. Proposing it to the handbook is outside this repo.
- The DB password lands in a URL inside `migrate`; `.env.example` states it must be URL-safe.
- Owner items, not phases: push the tag with `make prod-release VERSION=0.1.0`; DNS A/AAAA for `what-the-flag.de` and `www`; provision the server; `DOMAIN=what-the-flag.de make prod-deploy`; schedule the backup; GHCR read token; imprint and privacy texts before the public launch; switch off the old hosting.

## Phase 1: Production stack runs locally

**Depends on**: none

### Context

- `docker-compose.prod.yml`, `scripts/prod-init.sh` — `up -d --wait` is where migrations must run.
- `backend/cmd/what-the-flag/main.go — main()`, `backend/internal/postgres/` — pool construction and integration helper.
- `.github/workflows/release.yml` — matrix of images.
- `Makefile` — `CLASS_developer`, `CLASS_production`.

### What to build

- `database/Dockerfile`: `FROM migrate/migrate:v4.20.1`, `COPY migrations /migrations`.
- `docker-compose.prod.yml`: service `migrate`, image `ghcr.io/nicograef/what-the-flag-migrate:v0.1.0`, `restart: "no"`, network `db-network`, logging, `memory: 64M`, `depends_on: postgres: service_healthy`. Command: `-path /migrations -database postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?sslmode=disable up`. `backend.depends_on` gains `migrate: service_completed_successfully`.
- `.github/workflows/release.yml`: matrix entry `service: migrate`, `context: ./database`, `file: ./database/Dockerfile`.
- `backend/internal/postgres/schema.go`: `const SchemaVersion`, `CheckSchema(ctx, q, want int) error` reading `version, dirty` from `schema_migrations`; `42P01` counts as version 0.
- `backend/internal/postgres/schema_test.go — TestSchemaVersionMatchesMigrations` (unit): highest `NNNNNN_*.up.sql` in `../../../database/migrations` equals `SchemaVersion`.
- `backend/internal/postgres/schema_integration_test.go — TestCheckSchema` (integration, table): current passes; in a rolled-back tx, `version - 1` fails and `dirty = true` fails.
- `backend/cmd/what-the-flag/main.go`: call `CheckSchema` after the pool; on error `slog.Error("database schema behind binary", …)` and `os.Exit(1)`.
- `docker-compose.e2e.yml`: `build:` and `:e2e` image names for `backend`, `migrate`, `reverse-proxy` (context `.`, `reverse-proxy/Dockerfile`); edge `ports: !override ["127.0.0.1:8443:443"]`, mount and `command` for `e2e.Caddyfile`; `app-network.enable_ipv6: false`.
- `reverse-proxy/e2e.Caddyfile`: `local_certs`, `skip_install_trust`, `import /etc/caddy/Caddyfile`.
- `scripts/verify-images.sh`: against the running e2e stack via `curl -sk --resolve what-the-flag.de:8443:127.0.0.1`, fail on the first miss:
  - `backend` and `reverse-proxy` health `healthy`; `migrate` exit code 0;
  - `find / -xdev -name '*.go' -o -name go.mod` in the backend image prints nothing;
  - `/` 200 with `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`; `/api/health` 200;
  - first `/flags/*.svg` from `frontend/public/flags/`: 200, `image/svg+xml`, `Cache-Control: public, max-age=3600`;
  - the `/assets/*.js` named in `/`: `immutable`; `/assets/missing.js` 404;
  - `/dashboard` 200, `Cache-Control: no-cache`, body holds `id="root"`.
- `scripts/e2e.sh`: export the e2e credentials; `up -d --build --wait`; trap on EXIT prints `logs` on failure and runs `down --volumes` unless `KEEP=1`; run `scripts/verify-images.sh`. `GUARD=1` instead runs the guard check of the criteria below.
- `Makefile`: `e2e` (`scripts/e2e.sh`) in `CLASS_developer`; `prod-migrate` in `CLASS_production`.
- `docs/decisions.md`: next free D lines for the migrate service, migrate image, schema guard, e2e stack and local TLS.

### Acceptance criteria

- [ ] Unit: `cd backend && go test ./internal/postgres -run TestSchemaVersionMatchesMigrations` passes.
- [ ] Integration: `cd backend && go test -tags=integration ./internal/postgres -run TestCheckSchema` passes.
- [ ] Image builds and `up --wait` with the exited `migrate`: `make e2e` exits 0 and prints every `verify-images.sh` check.
- [ ] Guard on an unmigrated database: `GUARD=1 KEEP= scripts/e2e.sh` exits 0. With `GUARD=1`, the script starts `postgres` with `--wait`, then `backend` with `--no-deps`, and passes when `docker compose logs backend` holds `database schema behind binary` and the container exited 1.
- [ ] `make help | grep -c UNCLASSIFIED` prints 0.
- [ ] `make check` passes.

## Phase 2: Browser test of the duel flow

**Depends on**: 1

### Context

- `frontend/src/features/auth/`, `dashboard/`, `duels/`, `leaderboard/` — routes `/register`, `/dashboard`, `/duels/:id`, `/leaderboard` and their `messages.ts` English labels.
- `frontend/package.json`, `frontend/tsconfig.node.json`, `frontend/vite.config.ts` — scripts, typecheck scope, Vitest include.
- `scripts/e2e.sh`, `.github/workflows/ci.yml`.

### What to build

- `frontend/package.json`: dev dependency `@playwright/test` (latest from `pnpm view @playwright/test version`), script `e2e: playwright test`; `frontend/pnpm-lock.yaml` updated.
- `frontend/playwright.config.ts`: `testDir: 'e2e'`, `testMatch: /.*\.e2e\.ts$/`, Chromium only, `locale: 'en-US'`, `baseURL`, `ignoreHTTPSErrors`, the resolver flag, `retries: 0`, `timeout: 120_000`, `trace: 'retain-on-failure'`.
- `frontend/tsconfig.node.json`: include `playwright.config.ts` and `e2e`.
- `frontend/e2e/duel.e2e.ts` (end to end, one test): usernames `a_`/`b_` plus 8 base36 chars.
  - Two browser contexts register A and B via `/register`.
  - A searches B on `/dashboard`, challenges, plays ten questions on `/duels/:id`, clicking the first option at once.
  - B sees the duel as `your_turn`, plays the same way.
  - Both result pages list both players and ten question rows.
  - `/leaderboard` shows each player with the points the result page awarded them.
  - Any page console error fails the test.
- `scripts/e2e.sh`: after `verify-images.sh`, run `pnpm exec playwright install chromium` and `pnpm run e2e` in `frontend/`.
- `.gitignore`: `frontend/playwright-report/`, `frontend/test-results/`.
- `.github/workflows/ci.yml`: filter `e2e` (`backend/**`, `frontend/**`, `database/**`, `reverse-proxy/**`, `docker-compose*.yml`, `scripts/e2e.sh`, `scripts/verify-images.sh`, the workflow). Job `e2e`: `needs: changes`, `timeout-minutes: 20`, the template's SHA-pinned checkout, pnpm and setup-node steps, `pnpm install --frozen-lockfile`, `pnpm exec playwright install --with-deps chromium`, then `make e2e` from the repo root.
- `docs/decisions.md`: D line for the e2e location and the clock decision.

### Acceptance criteria

- [ ] Vitest ignores the browser test: `cd frontend && pnpm run test -- --reporter=verbose | grep -c duel.e2e` prints 0.
- [ ] End to end: `make e2e` exits 0 with `1 passed` from Playwright.
- [ ] CI: `gh run view "$(gh run list --workflow ci.yml --branch "$(git branch --show-current)" --limit 1 --json databaseId --jq '.[0].databaseId')" --json jobs --jq '.jobs[] | select(.name=="e2e") | .conclusion'` prints `success`.
- [ ] `make check` passes.

## Phase 3: Production configuration review

**Depends on**: 2

### Context

- `reverse-proxy/Caddyfile` — header block.
- `docker-compose.prod.yml — backend.environment` against `backend/internal/config/`.
- `.env.example`, `scripts/backup-postgres.sh` — the readers.
- `backend/internal/account/` — argon2id `m`, `t`, `p` and any cap on concurrent hashes.

### What to build

- `reverse-proxy/Caddyfile`: the CSP header from the decisions table, in the primary site's `header` block.
- `scripts/verify-images.sh`: `/` also carries `Content-Security-Policy` with `frame-ancestors 'none'`.
- `docker-compose.prod.yml`: backend `environment` lists every name `internal/config` reads (`DB_HOST`, `POSTGRES_*`; `APP_PORT` stays unset); add `GOMEMLIMIT: 400MiB`.
- `.env.example`: exactly the read names; drop `APP_ENV` and `JWT_SECRET`; note that `POSTGRES_PASSWORD` must be URL-safe; `POSTGRES_DB=whattheflag`.
- `scripts/check-env-example.sh` per the decisions table; prints each missing or extra name, exits 1 on any.
- `Makefile`: `env-check` (in `CLASS_developer`, a prerequisite of `check`).
- `.github/workflows/ci.yml`: `backend-ci` gains a step running `scripts/check-env-example.sh` from the repo root; its filter gains `.env.example` and `docker-compose*.yml`.
- Memory check: read `m` and the hash cap `N` in `backend/internal/account/`. Measure baseline as idle backend RSS with `docker stats --no-stream` on the e2e stack (`KEEP=1 make e2e`). Require `N × m + baseline ≤ 384 MiB`.
- No cap in `account`: add a buffered-channel semaphore of size `N = floor((384 MiB − baseline) / m)` around the hash call in `backend/internal/account/service.go`. Add service test `TestHashConcurrencyCapped` (unit): with the cap at 1, a second hash starts only after the first returns, seen through the injected hash function.
- `docs/decisions.md`: D lines for the CSP and for the memory budget with the measured numbers.

### Acceptance criteria

- [ ] `scripts/check-env-example.sh` exits 0.
- [ ] `docker compose -f docker-compose.prod.yml --env-file .env.example config --quiet && echo ok` prints `ok`.
- [ ] CSP and headers: `make e2e` exits 0, its `verify-images.sh` CSP check and the console-error check included.
- [ ] Memory: `grep -c 'argon2id' docs/decisions.md` prints ≥ 1, and the line states `N`, `m`, baseline and the 384 MiB budget.
- [ ] `make check` passes.

## Phase 4: Documentation

**Depends on**: 3

### Context

- `README.md`, `AGENTS.md`, `docs/README.md`, `docs/decisions.md` — current state after phases 1–3.
- `data/SOURCES.md`, `NOTICE`, `data/LICENSE`, `LICENSE` — licence facts.

### What to build

- `README.md`: what the game is (one paragraph); quick start with `make db`, `make db-migrate`, `make be`, `make fe`, `make check`, `make be-integration`, `make e2e`, `make data`; data and licences (sources table pointing at `data/SOURCES.md`, dataset ODbL-1.0, code MIT, flags MIT, `NOTICE`).
- `README.md` deploy section: links to the handbook's `guides/deploy.md` and `guides/backup-restore.md`; `DOMAIN=what-the-flag.de make prod-deploy`; three images per release; `migrate` runs inside the deploy after the backup; `make prod-migrate ARGS=version`; the schema guard's log line and its fix.
- `docs/README.md`: one row per file in `docs/` with the question it answers.
- `docs/decisions.md`: every D line true to the tree; replaced lines marked `replaced by DNN`.
- `AGENTS.md`: layout, `make` targets and rules true to the final tree, `frontend/e2e/`, `database/Dockerfile`, `scripts/` included.

### Acceptance criteria

- [ ] Index complete: `for f in docs/*.md; do grep -q "$(basename "$f")" docs/README.md || echo "$f"; done | grep -v '^docs/README.md$'` prints nothing.
- [ ] Paths true: `grep -oE '\`[A-Za-z0-9_./-]+/\`' AGENTS.md README.md | tr -d '\`' | cut -d: -f2 | sort -u | while read -r p; do test -e "$p" || echo "$p"; done` prints nothing.
- [ ] Targets true: `grep -oE 'make [a-z-]+' README.md AGENTS.md | awk '{print $2}' | sort -u | while read -r t; do make -n "$t" >/dev/null 2>&1 || echo "$t"; done` prints nothing.
- [ ] `make check` passes.

## Phase 5: Release checklist

**Depends on**: 4

### Context

- `docker-compose.prod.yml`, `.github/workflows/release.yml`, `reverse-proxy/Caddyfile`, `docs/plans/`.

### What to build

- Run every check below on `main` and fix any failure in its own commit. No new feature lands here.
- Delete every finished `docs/plans/plan-*.md` except this one; implement-plan deletes this one last.

### Acceptance criteria

- [ ] Pins: `grep -cE 'what-the-flag-(backend|edge|migrate):v0\.1\.0' docker-compose.prod.yml` prints 3.
- [ ] Release matrix: `grep -cE 'service: (backend|edge|migrate)$' .github/workflows/release.yml` prints 3.
- [ ] Placeholders: `grep -rnE '<(owner|project|name|domain|database-name)>' docker-compose.prod.yml .github reverse-proxy scripts Makefile` prints nothing.
- [ ] Domain: `grep -c 'what-the-flag.de' reverse-proxy/Caddyfile` prints ≥ 3.
- [ ] Config: `docker compose -f docker-compose.prod.yml --env-file .env.example config --quiet && echo ok` prints `ok`.
- [ ] Env: `scripts/check-env-example.sh` exits 0.
- [ ] Integration: `make be-integration` passes.
- [ ] End to end: `make e2e` exits 0.
- [ ] CI on main: `gh run list --workflow ci.yml --branch main --limit 1 --json conclusion --jq '.[0].conclusion'` prints `success`.
- [ ] Plans: `ls docs/plans/plan-*.md` prints only `docs/plans/plan-release-readiness.md`.
- [ ] `make check` passes.
