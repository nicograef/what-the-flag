# Plan: Release readiness

> Source PRD: docs/prds/prd-rebuild.md

## Goal

Make the full release `v1.0.0` taggable: practice, accounts, duels and weekly.
One browser test plays a duel through the real images behind the real edge. Production configuration matches the PRD, and the docs describe the final tree.
The prod stack under test, the migrate service and the image licences come from [plan-first-release.md](plan-first-release.md).

## Architectural decisions

| Topic | Decision |
| --- | --- |
| Stack under test | first-release's `make e2e` (`scripts/e2e.sh`, `docker-compose.e2e.yml`, `reverse-proxy/e2e.Caddyfile`). This plan adds the browser test to it |
| E2E location | `frontend/e2e/duel.e2e.ts`, config `frontend/playwright.config.ts`, script `pnpm run e2e`. Vitest's default include skips `.e2e.ts`; `fe-check` lints and typechecks it |
| Browser routing | Chromium runs with `--host-resolver-rules=MAP what-the-flag.de 127.0.0.1` and `ignoreHTTPSErrors`. `baseURL` is `https://what-the-flag.de:8443` |
| Origin (R6) | The browser sends `Origin: https://what-the-flag.de:8443`. Caddy passes `Host: what-the-flag.de:8443` unchanged. foundation's `httpx.CheckOrigin` compares host:port, so both match |
| Session cookie | The page is HTTPS, so the `__Host-` cookie with `Secure` is stored and sent as in production |
| Clock | The test clicks an option as soon as a question renders. No test-only server switch exists |
| CSP | In `reverse-proxy/Caddyfile`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'` |
| Why `'unsafe-inline'` styles | Radix dialogs in shadcn inject a runtime `<style>` through `react-remove-scroll`. A static SPA has no per-request nonce. Scripts stay `'self'`: Vite emits no inline script |
| Why `data:` | Vite inlines assets under 4 KiB as `data:` URLs, images and fonts alike |
| Console gate | The e2e test fails on any `pageerror` and on any console error except `Failed to load resource`. CSP violations log `Refused to …` and fail it. Expected 401s from `/api/me` log `Failed to load resource` |
| Memory (R17) | `account.MaxConcurrentHashes` (4) × `account.ArgonMemoryKiB` (19456 KiB) = 76 MiB of hash memory. Backend keeps `memory: 512M` and gains `GOMEMLIMIT: 400MiB`. 76 MiB plus an idle Go process stays far under 400 MiB |
| `.env.example` gate (R21) | `scripts/check-env-example.sh` compares the names in `.env.example` (active and `# NAME=` lines) with the readers, both directions. Readers: `[Gg]etenv("NAME")` and `LookupEnv("NAME")` in `backend/`, `process.env.NAME` in `contract/src/`, `${NAME}` in `docker-compose*.yml`, plus `COMPOSE_FILE` and `BACKUP_PING_URL` named in the script |
| Env gate wiring | `make env-check` runs it as a prerequisite of `make check`; CI job `env-check` on every push |
| Release tag | All three images move to `v1.0.0` in `docker-compose.prod.yml` in the last phase. The owner tags after this plan lands |
| CI criteria (R31) | Lanes never call `gh`. A CI criterion reads "CI job `<name>` green on the lane's pushed head (lead checks)"; the lead reads the run through the GitHub MCP actions tools |
| Docker in the cloud session (R29) | As in first-release: `dockerd &`, `--network host`, the session CA through the gitignored `docker-compose.local.yml`. Stack criteria run locally and in CI; CI is the gate of record |

## Inventory

- `scripts/e2e.sh`, `docker-compose.e2e.yml`, `docker-compose.prod.yml`, `database/Dockerfile` (first-release) — the stack under test.
- `reverse-proxy/Caddyfile` — edge; gains the CSP header.
- `.github/workflows/ci.yml — e2e` (first-release) — gains the browser steps and the `env-check` job.
- `backend/internal/httpx — CheckOrigin()` — must pass the e2e host and port (R6).
- `backend/internal/account/password.go — ArgonMemoryKiB, MaxConcurrentHashes` — inputs to the memory budget (R17).
- `frontend/src/features/{auth,dashboard,duels,leaderboard}/` — screens and `messages.ts` labels the test selects by role.
- `Makefile`, `.env.example`, `README.md`, `AGENTS.md`, `docs/README.md`, `docs/decisions.md`, `.gitignore`.

## Open questions / Risks

- Feature plans land before phase 1. Re-check every file and symbol named here against the landed tree first.
- The CI criteria need the run branch pushed. Push it before each stack criterion.
- Chromium may refuse `Secure` cookies under `ignoreHTTPSErrors`. Fallback: export `/data/caddy/pki/authorities/local/root.crt` from the edge and trust it in the runner's NSS database.

## Phase 1: Browser test of the duel flow

**Depends on**: none

### Context

- `frontend/src/features/auth/`, `dashboard/`, `duels/`, `leaderboard/` — routes `/register`, `/dashboard`, `/duels/:id`, `/leaderboard` and their English labels.
- `frontend/package.json`, `frontend/tsconfig.node.json` — scripts, typecheck scope.
- `scripts/e2e.sh`, `.github/workflows/ci.yml` — the stack run and its CI job.

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
- `scripts/e2e.sh`: after the smoke checks, `pnpm install --frozen-lockfile`, `pnpm exec playwright install chromium` and `pnpm run e2e` in `frontend/`.
- `.gitignore`: `frontend/playwright-report/`, `frontend/test-results/`.
- `.github/workflows/ci.yml`: job `e2e` gains the template's pinned pnpm and setup-node steps and `pnpm exec playwright install --with-deps chromium` in `frontend/`, before `make e2e`.
- `docs/decisions.md`: D line for the e2e location and the absent test clock.

### Acceptance criteria

- [ ] End to end (local, R29): `make e2e 2>&1 | grep -c '1 passed'` prints ≥ 1.
- [ ] CI job `e2e` green on the lane's pushed head (lead checks, R31).
- [ ] `make check` passes.

## Phase 2: Production configuration review

**Depends on**: 1

### Context

- `reverse-proxy/Caddyfile` — primary site's `header` block.
- `docker-compose.prod.yml — backend` — limits and environment.
- `backend/internal/account/password.go — ArgonMemoryKiB, MaxConcurrentHashes`.
- `backend/internal/config/config.go — Load()`, `contract/src/env.ts`, `contract/src/db.ts`, `.env.example`, `scripts/backup-postgres.sh` — the env readers.
- `Makefile`, `.github/workflows/ci.yml` — `check` prerequisites, jobs.

### What to build

- `reverse-proxy/Caddyfile`: the CSP header from the decisions table in the primary site's `header` block.
- `frontend/e2e/duel.e2e.ts`: the response to `/` carries `Content-Security-Policy` containing `frame-ancestors 'none'`.
- `docker-compose.prod.yml`: backend `environment` gains `GOMEMLIMIT: 400MiB`.
- `scripts/check-env-example.sh` per the decisions table; prints each missing or extra name, exits 1 on any.
- `Makefile`: `env-check` in `CLASS_developer`, a prerequisite of `check`.
- `.github/workflows/ci.yml`: job `env-check`, no filter, `timeout-minutes: 5`, SHA-pinned checkout, `scripts/check-env-example.sh`.
- `docs/decisions.md`: D lines for the CSP with its two exceptions, and for the memory budget with `N`, `m` and the 400 MiB limit.

### Acceptance criteria

- [ ] CSP holds and breaks nothing (local): `make e2e 2>&1 | grep -c '1 passed'` prints ≥ 1.
- [ ] CI job `e2e` green on the lane's pushed head (lead checks, R31).
- [ ] Env gate passes on the tree: `make env-check` exits 0.
- [ ] Env gate catches a stale name: `printf 'STALE_NAME=x\n' >> .env.example; scripts/check-env-example.sh | grep -c STALE_NAME; git checkout -- .env.example` prints 1.
- [ ] Config: `docker compose -f docker-compose.prod.yml --env-file .env.example config --format json | jq -r '.services.backend.environment.GOMEMLIMIT'` prints `400MiB`.
- [ ] `make check` passes.

## Phase 3: Documentation

**Depends on**: 2

### Context

- `README.md`, `AGENTS.md`, `docs/README.md`, `docs/decisions.md` — current state after phases 1–2.

### What to build

- `README.md` quick start: `make db`, `make db-migrate`, `make be`, `make fe`, `make check`, `make be-integration`, `make contract`, `make e2e`, `make data`. The licence section stays as country-data wrote it (R1).
- `README.md` deploy section: links to the handbook's `guides/deploy.md` and `guides/backup-restore.md`; `DOMAIN=what-the-flag.de make prod-deploy`.
  It states three images per release, `migrate` running inside the deploy after the backup, and `make prod-migrate ARGS=version`.
- `docs/README.md`: one row per file in `docs/` with the question it answers.
- `docs/decisions.md`: every D line true to the tree; a replaced line says `replaced by DNN`.
- `AGENTS.md`: layout, `make` targets and rules true to the final tree, `contract/`, `frontend/e2e/`, `database/Dockerfile` and `scripts/` included. Rule: a route lands with its `contract/openapi.yaml` entry and contract tests.

### Acceptance criteria

- [ ] Index complete: `for f in docs/*.md; do grep -q "$(basename "$f")" docs/README.md || echo "$f"; done | grep -v '^docs/README.md$'` prints nothing.
- [ ] Paths true: `grep -ohE '\`[A-Za-z0-9_./-]+/\`' AGENTS.md README.md | tr -d '\`' | sort -u | while read -r p; do test -e "$p" || echo "$p"; done` prints nothing.
- [ ] Targets true: `grep -ohE 'make [a-z-]+' README.md AGENTS.md | awk '{print $2}' | sort -u | while read -r t; do make -n "$t" >/dev/null 2>&1 || echo "$t"; done` prints nothing.
- [ ] `make check` passes.

## Phase 4: Release checklist

**Depends on**: 3

### Context

- `docker-compose.prod.yml`, `database/Dockerfile`, `.github/workflows/release.yml`, `.github/workflows/ci.yml`, `reverse-proxy/Caddyfile`, `.env.example`, `docs/plans/`.

### What to build

- `docker-compose.prod.yml`: `backend`, `edge` and `migrate` images move to `v1.0.0`.
- Run every check below on the run branch and fix any failure in its own commit. No feature lands here.
- The run deletes this plan once every criterion is ticked (R26: no plugin scripts).

### Acceptance criteria

- [ ] Pins: `grep -cE 'what-the-flag-(backend|edge|migrate):v1\.0\.0' docker-compose.prod.yml` prints 3.
- [ ] Migrate pin: `grep -hoE 'v4\.[0-9]+\.[0-9]+' database/Dockerfile .github/workflows/ci.yml | sort -u | wc -l` prints 1.
- [ ] Release matrix: `grep -cE 'service: (backend|edge|migrate)$' .github/workflows/release.yml` prints 3.
- [ ] Placeholders: `grep -rnE '<(owner|project|name|domain|database-name)>' docker-compose.prod.yml .github reverse-proxy scripts Makefile` prints nothing.
- [ ] Env: `scripts/check-env-example.sh` exits 0.
- [ ] Integration: `make be-integration` passes.
- [ ] Contract: with `make db`, `make db-migrate` and `make be` running, `make contract` passes.
- [ ] CI job `e2e` green on the lane's pushed head (lead checks, R31).
- [ ] Plans: `ls docs/plans/plan-*.md` prints only `docs/plans/plan-release-readiness.md`.
- [ ] `make check` passes.
