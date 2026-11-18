# Plan: Release readiness

> Source PRD: docs/prds/prd-rebuild.md

## Goal

Make `v0.1.0` taggable. The real images run behind the real edge, and one browser test plays a duel through them.
Production configuration matches the PRD, migrations apply on deploy, and the docs describe the final tree.

## Architectural decisions

| Topic | Decision |
| --- | --- |
| Who migrates (R9) | One-shot Compose service `migrate` in `docker-compose.prod.yml`. `backend.depends_on.migrate` is `service_completed_successfully`. `make prod-deploy` runs `scripts/prod-init.sh`: backup, pull, then `up -d --wait`, which runs `migrate` |
| Why not an operator step | A manual `migrate up` before `make prod-deploy` skips prod-init's backup. On a first deploy it creates the database volume without `.deploy-state`, and prod-init then refuses to run |
| `up --wait` and a one-shot | Compose `pkg/compose/start.go — getDependencyCondition()` waits for `service_completed_successfully` on a service another service depends on that way. So `--wait` accepts `migrate` exiting 0 and fails on a non-zero exit |
| Migration source | Image `ghcr.io/nicograef/what-the-flag-migrate:vX.Y.Z` from `database/Dockerfile`: `FROM migrate/migrate:v4.20.1`, `COPY migrations /migrations`. The tag carries exactly the release's migrations |
| Migrate invocation | `entrypoint: ["migrate", "-path", "/migrations", "-database", "postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres/${POSTGRES_DB}?sslmode=disable"]`, `command: ["up"]`. A `run` argument replaces only `command` |
| DSN without port | The host `postgres` takes the default port 5432. CI's restore drill greps `postgres:[0-9]` in the prod file for the image; `postgres:5432` would match it |
| Manual migrate | `make prod-migrate ARGS="version"` runs `docker compose -f docker-compose.prod.yml run --rm migrate $(ARGS)`, default `up`. `force` follows `reference/postgresql.md` |
| Pin consistency | `migrate`, `backend` and `edge` share one `vX.Y.Z` in the prod file. The migrate base pin equals `MIGRATE_VERSION` in `ci.yml` |
| E2E location | `frontend/e2e/duel.e2e.ts`, config `frontend/playwright.config.ts`, script `pnpm run e2e`. Vitest's default include skips `.e2e.ts`; `fe-check` lints and typechecks it |
| Stack under test | `docker compose -p what-the-flag-e2e -f docker-compose.prod.yml -f docker-compose.e2e.yml`. The override adds `build:` and `:e2e` image names for backend, migrate and edge |
| Local TLS | Caddy would ask Let's Encrypt for the public name. The override runs `caddy run --config /etc/caddy/e2e.Caddyfile`. That file holds `{ local_certs skip_install_trust }` and `import /etc/caddy/Caddyfile`; site blocks stay verbatim |
| Browser routing | Edge `ports: !override ["127.0.0.1:8443:443"]`. Chromium runs with `--host-resolver-rules=MAP what-the-flag.de 127.0.0.1` and `ignoreHTTPSErrors`. `baseURL` is `https://what-the-flag.de:8443` |
| Origin (R6) | The browser sends `Origin: https://what-the-flag.de:8443`. Caddy passes `Host: what-the-flag.de:8443` unchanged. foundation's `httpx.CheckOrigin` compares host:port, so both match |
| Session cookie | The page is HTTPS, so the `__Host-` cookie with `Secure` is stored and sent as in production |
| Clock | The test clicks an option as soon as a question renders. No test-only server switch exists |
| E2E credentials | `scripts/e2e.sh` exports `POSTGRES_USER=e2e POSTGRES_PASSWORD=e2e POSTGRES_DB=whattheflag`. `-p what-the-flag-e2e` scopes its `down --volumes` to the test stack |
| IPv6 in e2e | The override sets `app-network.enable_ipv6: false`; runners need no IPv6 pool |
| CSP | In `reverse-proxy/Caddyfile`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'` |
| Why `'unsafe-inline'` styles | Radix dialogs in shadcn inject a runtime `<style>` through `react-remove-scroll`. A static SPA has no per-request nonce. Scripts stay `'self'`: Vite emits no inline script |
| Why `data:` | Vite inlines assets under 4 KiB as `data:` URLs, images and fonts alike |
| Console gate | The e2e test fails on any `pageerror` and on any console error except `Failed to load resource`. CSP violations log `Refused to …` and fail it. Expected 401s from `/api/me` log `Failed to load resource` |
| Memory (R17) | `account.MaxConcurrentHashes` (4) × `account.ArgonMemoryKiB` (19456 KiB) = 76 MiB of hash memory. Backend keeps `memory: 512M` and gains `GOMEMLIMIT: 400MiB`. 76 MiB plus an idle Go process stays far under 400 MiB |
| `.env.example` gate (R21) | `scripts/check-env-example.sh` compares the names in `.env.example` (active and `# NAME=` lines) with the readers, both directions. Readers: `[Gg]etenv("NAME")` and `LookupEnv("NAME")` in `backend/`, `${NAME}` in `docker-compose*.yml`, plus `COMPOSE_FILE` and `BACKUP_PING_URL` named in the script. `make env-check` runs it inside `make check`; CI job `env-check` on every push |
| CI e2e | Job `e2e` in `.github/workflows/ci.yml`, `timeout-minutes: 20`, runs `make e2e`. It runs when filter output `e2e` is true or on `refs/heads/main` |
| Verifying stack criteria | Stack criteria read the `e2e` job of the CI run for `HEAD`. A local `make e2e` is the dev command, not the criterion |

## Inventory

- `docker-compose.prod.yml` — prod stack; gains `migrate`, the backend dependency, `GOMEMLIMIT`.
- `scripts/prod-init.sh`, `scripts/backup-postgres.sh` — unchanged; backup, pull, `up --wait` order drives the migrate decision.
- `reverse-proxy/Caddyfile`, `reverse-proxy/Dockerfile` — edge; gains the CSP header.
- `backend/Dockerfile` — backend image under test.
- `.github/workflows/release.yml` — gains the `migrate` matrix entry.
- `.github/workflows/ci.yml` — gains the `e2e` filter and job and the `env-check` job. Its `upgrade-path` job reads only `database/migrations`, so `database/Dockerfile` leaves it intact.
- `backend/internal/httpx — CheckOrigin()` — must pass the e2e host and port (R6).
- `backend/internal/account/password.go — ArgonMemoryKiB, MaxConcurrentHashes` — inputs to the memory budget (R17).
- `frontend/src/features/{auth,dashboard,duels,leaderboard}/` — screens and `messages.ts` labels the test selects by role.
- `Makefile`, `.env.example`, `README.md`, `AGENTS.md`, `docs/README.md`, `docs/decisions.md`, `.gitignore`.

## Open questions / Risks

- Feature plans land before phase 1. Re-check every file and symbol named here against the landed tree first.
- Cloud session (R26): the container's Docker daemon is not running. Image builds behind the session proxy cannot fetch packages without its CA. Stack criteria therefore read the CI `e2e` job; nothing in the repo works around the sandbox.
- The CI criteria need the run branch pushed. Push it before each stack criterion.
- Chromium may refuse `Secure` cookies under `ignoreHTTPSErrors`. Fallback: export `/data/caddy/pki/authorities/local/root.crt` from the edge and trust it in the runner's NSS database.
- A global options block added to `reverse-proxy/Caddyfile` breaks the `import` in `e2e.Caddyfile`. Move such options into both files.
- The server's Compose must carry `getDependencyCondition()`. Compose tags since v2.7.0 do; the handbook server setup installs a current plugin.
- The DB password lands in the migrate URL. It must be URL-safe; `.env.example` says so.
- The handbook deploy guide knows no `migrate` service. Proposing it to the handbook is outside this repo.
- Owner items, not phases: push the tag with `make prod-release VERSION=0.1.0`; DNS A/AAAA for `what-the-flag.de` and `www`; provision the server; GHCR read token; `DOMAIN=what-the-flag.de make prod-deploy`; schedule the backup; imprint and privacy texts before the public launch; switch off the old hosting.

## Phase 1: Production stack runs under test

**Depends on**: none

### Context

- `docker-compose.prod.yml`, `scripts/prod-init.sh` — `up -d --wait` is where migrations run.
- `.github/workflows/release.yml` — image matrix. `.github/workflows/ci.yml` — `changes` filters, pinned action SHAs.
- `Makefile` — `CLASS_developer`, `CLASS_production`, `MIGRATE_VERSION`.

### What to build

- `database/Dockerfile`: `FROM migrate/migrate:v4.20.1`, `COPY migrations /migrations`.
- `docker-compose.prod.yml`: service `migrate` after `postgres`. Image `ghcr.io/nicograef/what-the-flag-migrate:v0.1.0`, `restart: "no"`, `db-network`, `*default-logging`, `memory: 64M`. `depends_on: postgres: service_healthy`; entrypoint and command per the decisions table.
- `docker-compose.prod.yml`: `backend.depends_on` gains `migrate: condition: service_completed_successfully`.
- `.github/workflows/release.yml`: matrix entry `service: migrate`, `context: ./database`, `file: ./database/Dockerfile`.
- `docker-compose.e2e.yml`: `build:` plus `what-the-flag-{backend,migrate,edge}:e2e` names; edge context `.`, file `reverse-proxy/Dockerfile`.
  Edge `ports: !override ["127.0.0.1:8443:443"]`, a read-only mount of `reverse-proxy/e2e.Caddyfile` and the `caddy run` command. `app-network.enable_ipv6: false`.
- `reverse-proxy/e2e.Caddyfile`: `local_certs`, `skip_install_trust`, `import /etc/caddy/Caddyfile`.
- `scripts/e2e.sh` (`set -euo pipefail`):
  - export the e2e credentials; `up -d --build --wait`;
  - an EXIT trap prints `logs` on failure and runs `down --volumes` unless `KEEP=1`;
  - `curl -fsk --resolve what-the-flag.de:8443:127.0.0.1 https://what-the-flag.de:8443/api/health`;
  - `SELECT version FROM schema_migrations` via `exec -T postgres psql` equals the highest `database/migrations/NNNNNN` number, else exit 1.
- `Makefile`: `e2e` (`scripts/e2e.sh`) in `CLASS_developer`; `prod-migrate` in `CLASS_production`.
- `.github/workflows/ci.yml`: filter `e2e` (`backend/**`, `frontend/**`, `database/**`, `reverse-proxy/**`, `docker-compose*.yml`, `scripts/e2e.sh`, the workflow) and its `changes` output.
  Job `e2e`: `needs: changes`, `if: needs.changes.outputs.e2e == 'true' || github.ref == 'refs/heads/main'`, `timeout-minutes: 20`, SHA-pinned checkout, `make e2e`.
- `docs/decisions.md`: one D line for the e2e stack with local TLS.

### Acceptance criteria

- [ ] Stack, migrate image and `up --wait` with an exited one-shot (CI): `id=$(gh run list --workflow ci.yml --commit "$(git rev-parse HEAD)" --limit 1 --json databaseId --jq '.[0].databaseId') && gh run watch "$id" >/dev/null; gh run view "$id" --json jobs --jq '.jobs[] | select(.name=="e2e") | .conclusion'` prints `success`.
- [ ] Manual migrate keeps the DSN: `docker compose -f docker-compose.prod.yml --env-file .env.example config --format json | jq -r '.services.migrate.entrypoint[1:3] | join(" ")'` prints `-path /migrations`.
- [ ] `make help | grep -c UNCLASSIFIED` prints 0.
- [ ] `make check` passes.

## Phase 2: Browser test of the duel flow

**Depends on**: 1

### Context

- `frontend/src/features/auth/`, `dashboard/`, `duels/`, `leaderboard/` — routes `/register`, `/dashboard`, `/duels/:id`, `/leaderboard` and their English labels.
- `frontend/package.json`, `frontend/tsconfig.node.json` — scripts, typecheck scope.
- `scripts/e2e.sh`, `.github/workflows/ci.yml`.

### What to build

- `frontend/package.json`: dev dependency `@playwright/test` (version from `pnpm view @playwright/test version`), script `e2e: playwright test`; `frontend/pnpm-lock.yaml`.
- `frontend/playwright.config.ts`: `testDir: 'e2e'`, `testMatch: /.*\.e2e\.ts$/`, Chromium only, `locale: 'en-US'`, `baseURL`, `ignoreHTTPSErrors`, the resolver flag, `retries: 0`, `timeout: 120_000`, `trace: 'retain-on-failure'`.
- `frontend/tsconfig.node.json`: include `playwright.config.ts` and `e2e`.
- `frontend/e2e/duel.e2e.ts` (end to end, one test): usernames `a_`/`b_` plus 8 base36 chars.
  - Two browser contexts register A and B via `/register`.
  - A searches B on `/dashboard`, challenges, and plays ten questions on `/duels/:id`, clicking the first option at once.
  - B sees the duel as `your_turn` on `/dashboard` and plays the same way.
  - Both result pages list both players and ten question rows.
  - `/leaderboard` shows each player with the points their result page awarded.
  - The console gate from the decisions table applies to every page.
- `scripts/e2e.sh`: after the health check, `pnpm install --frozen-lockfile`, `pnpm exec playwright install chromium` and `pnpm run e2e` in `frontend/`.
- `.gitignore`: `frontend/playwright-report/`, `frontend/test-results/`.
- `.github/workflows/ci.yml`: job `e2e` gains the template's pinned pnpm and setup-node steps and `pnpm exec playwright install --with-deps chromium` in `frontend/`, before `make e2e`.
- `docs/decisions.md`: D line for the e2e location and the absent test clock.

### Acceptance criteria

- [ ] End to end (CI): `id=$(gh run list --workflow ci.yml --commit "$(git rev-parse HEAD)" --limit 1 --json databaseId --jq '.[0].databaseId') && gh run watch "$id" >/dev/null; gh run view "$id" --log --job "$(gh run view "$id" --json jobs --jq '.jobs[] | select(.name=="e2e") | .databaseId')" | grep -c '1 passed'` prints ≥ 1.
- [ ] `make check` passes.

## Phase 3: Production configuration review

**Depends on**: 2

### Context

- `reverse-proxy/Caddyfile` — primary site's `header` block.
- `docker-compose.prod.yml — backend` — limits and environment.
- `backend/internal/account/password.go — ArgonMemoryKiB, MaxConcurrentHashes`.
- `backend/internal/config/config.go — Load()`, `.env.example`, `scripts/backup-postgres.sh` — the env readers.
- `Makefile`, `.github/workflows/ci.yml` — `check` prerequisites, jobs.

### What to build

- `reverse-proxy/Caddyfile`: the CSP header from the decisions table in the primary site's `header` block.
- `frontend/e2e/duel.e2e.ts`: the response to `/` carries `Content-Security-Policy` containing `frame-ancestors 'none'`.
- `docker-compose.prod.yml`: backend `environment` gains `GOMEMLIMIT: 400MiB`.
- `.env.example`: a comment that `POSTGRES_PASSWORD` must be URL-safe.
- `scripts/check-env-example.sh` per the decisions table; prints each missing or extra name, exits 1 on any.
- `Makefile`: `env-check` in `CLASS_developer`, a prerequisite of `check`.
- `.github/workflows/ci.yml`: job `env-check`, no filter, `timeout-minutes: 5`, SHA-pinned checkout, `scripts/check-env-example.sh`.
- `docs/decisions.md`: D lines for the CSP with its two exceptions, and for the memory budget with `N`, `m` and the 400 MiB limit.

### Acceptance criteria

- [ ] CSP holds and breaks nothing (CI): the phase 2 command prints ≥ 1 for `HEAD`.
- [ ] Env gate passes on the tree: `make env-check` exits 0.
- [ ] Env gate catches a stale name: `printf 'STALE_NAME=x\n' >> .env.example; scripts/check-env-example.sh | grep -c STALE_NAME; git checkout -- .env.example` prints 1.
- [ ] Config: `docker compose -f docker-compose.prod.yml --env-file .env.example config --format json | jq -r '.services.backend.environment.GOMEMLIMIT'` prints `400MiB`.
- [ ] `make check` passes.

## Phase 4: Documentation

**Depends on**: 3

### Context

- `README.md`, `AGENTS.md`, `docs/README.md`, `docs/decisions.md` — current state after phases 1–3.

### What to build

- `README.md` quick start: `make db`, `make db-migrate`, `make be`, `make fe`, `make check`, `make be-integration`, `make e2e`, `make data`. The licence section stays as country-data wrote it (R1).
- `README.md` deploy section: links to the handbook's `guides/deploy.md` and `guides/backup-restore.md`; `DOMAIN=what-the-flag.de make prod-deploy`.
  It states three images per release, `migrate` running inside the deploy after the backup, and `make prod-migrate ARGS=version`.
- `docs/README.md`: one row per file in `docs/` with the question it answers.
- `docs/decisions.md`: every D line true to the tree; a replaced line says `replaced by DNN`.
- `AGENTS.md`: layout, `make` targets and rules true to the final tree, `frontend/e2e/`, `database/Dockerfile` and `scripts/` included.

### Acceptance criteria

- [ ] Index complete: `for f in docs/*.md; do grep -q "$(basename "$f")" docs/README.md || echo "$f"; done | grep -v '^docs/README.md$'` prints nothing.
- [ ] Paths true: `grep -ohE '\`[A-Za-z0-9_./-]+/\`' AGENTS.md README.md | tr -d '\`' | sort -u | while read -r p; do test -e "$p" || echo "$p"; done` prints nothing.
- [ ] Targets true: `grep -ohE 'make [a-z-]+' README.md AGENTS.md | awk '{print $2}' | sort -u | while read -r t; do make -n "$t" >/dev/null 2>&1 || echo "$t"; done` prints nothing.
- [ ] `make check` passes.

## Phase 5: Release checklist

**Depends on**: 4

### Context

- `docker-compose.prod.yml`, `database/Dockerfile`, `.github/workflows/release.yml`, `.github/workflows/ci.yml`, `reverse-proxy/Caddyfile`, `.env.example`, `docs/plans/`.

### What to build

- Run every check below on the run branch and fix any failure in its own commit. No feature lands here.
- The run deletes this plan once every criterion is ticked (R26: no plugin scripts).

### Acceptance criteria

- [ ] Pins: `grep -cE 'what-the-flag-(backend|edge|migrate):v0\.1\.0' docker-compose.prod.yml` prints 3.
- [ ] Migrate pin: `grep -hoE 'v4\.[0-9]+\.[0-9]+' database/Dockerfile .github/workflows/ci.yml | sort -u | wc -l` prints 1.
- [ ] Release matrix: `grep -cE 'service: (backend|edge|migrate)$' .github/workflows/release.yml` prints 3.
- [ ] Placeholders: `grep -rnE '<(owner|project|name|domain|database-name)>' docker-compose.prod.yml .github reverse-proxy scripts Makefile` prints nothing.
- [ ] Domain: `grep -c 'what-the-flag.de' reverse-proxy/Caddyfile` prints ≥ 3.
- [ ] Env: `scripts/check-env-example.sh` exits 0.
- [ ] Integration: `make be-integration` passes.
- [ ] End to end (CI): the phase 2 command prints ≥ 1 for `HEAD`.
- [ ] Plans: `ls docs/plans/plan-*.md` prints only `docs/plans/plan-release-readiness.md`.
- [ ] `make check` passes.
