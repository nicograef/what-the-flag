# Plan: Release readiness

> Source PRD: docs/prds/prd-rebuild.md (Testing Decisions: one browser test; Operations)

## Goal

Make `v1.0.0` taggable: runs and the leaderboard.
One browser test enters a name, plays a run to its end and finds it on today's leaderboard, through the real edge over local TLS.
The CSP is reviewed, the docs describe the final tree, and the durable game rules live in `docs/game-rules.md`.

## Architectural decisions

| Topic | Decision |
| --- | --- |
| Stack under test | first-release's `scripts/e2e-stack.sh <command>` and its e2e Compose project. It sets `E2E_BASE_URL` and uses `docker-compose.local.yml` when present |
| Browser package | Root `e2e/`, laid out like jotti's `e2e/`: own `package.json` with `packageManager`, own `pnpm-lock.yaml`, `playwright.config.ts`, `tsconfig.json`, `tests/` |
| Package scripts | The handbook's Package scripts, except `test` is `playwright test`. Lint is oxlint with jotti's Playwright rules in `e2e/.oxlintrc.json` |
| Node pin | The root `.node-version`, as for `frontend/` |
| Config | jotti settings: `forbidOnly` on CI, `retries: 0`, `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, reporter `github` + `html` on CI |
| Device | One project on `devices['Pixel 7']`, since the layout is mobile first. `locale: 'en-US'`, `timeout: 120_000` |
| Browser routing | `baseURL` is `E2E_BASE_URL`. Chromium runs with `--host-resolver-rules=MAP what-the-flag.de 127.0.0.1` and `ignoreHTTPSErrors` |
| Origin | The page origin is `https://what-the-flag.de:<port>`, the `Host` Caddy passes. No cookie exists |
| Rate limit | One run start passes the edge, well inside the per-address burst |
| Clock | The test clicks the first option as soon as a question renders. The run ends at the first wrong answer, after 197 questions at most. No test-only server switch exists |
| Console gate | Any `pageerror` and any console error fail the test. No request is expected to fail |
| CSP | In `reverse-proxy/Caddyfile`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'` |
| Why `'unsafe-inline'` styles | Radix dialogs inject a runtime `<style>` through `react-remove-scroll`. A static SPA has no per-request nonce. Vite emits no inline script |
| Why `data:` | Vite inlines assets under 4 KiB as `data:` URLs, images and fonts alike |
| CSP violations | A blocked resource logs `Refused to …` as a console error, so the console gate fails the browser test |
| CI job `e2e` | Runs `scripts/e2e-stack.sh pnpm --dir e2e test` and uploads `e2e/playwright-report/` and `e2e/test-results/` on failure, as jotti's job does |
| Smoke script | The browser test covers health, migrations, API and SPA. `scripts/smoke.sh` and its references go |
| Release tag | `backend`, `edge` and `migrate` move to `v1.0.0` in `docker-compose.prod.yml`. The owner tags after this plan lands |
| Docker here | Stack criteria run after `dockerd &` with the session CA from `docker-compose.local.yml` (programme § Rulings) |

## Inventory

- `scripts/e2e-stack.sh`, `docker-compose.e2e.yml`, `reverse-proxy/e2e.Caddyfile`, `scripts/smoke.sh` (first-release) — the stack under test.
- `reverse-proxy/Caddyfile` — the primary site's `header` block gains the CSP.
- `.github/workflows/ci.yml — changes, e2e`, `.github/dependabot.yml`, `Makefile — check, e2e` — gates and their wiring.
- `frontend/src/features/{landing,play,leaderboard}/` — routes and English labels the test selects by role.
- `docker-compose.prod.yml`, `database/Dockerfile`, `.github/workflows/release.yml` — release pins.
- `README.md`, `AGENTS.md`, `docs/README.md`, `docs/decisions.md`, `docs/prds/prd-rebuild.md`, `.gitignore`.
- jotti `e2e/package.json`, `e2e/playwright.config.ts`, `e2e/tsconfig.json`, `Makefile — check-e2e`, `.github/workflows/ci.yml — e2e` — the patterns.

## Open questions / Risks

- Phase agents re-read every file and symbol named here against the landed tree first.
- `pnpm exec playwright install chromium` downloads a browser. If the session's network blocks it, the stack criteria wait for CI.

## Phase 1: Browser test of a run

**Depends on**: none

### Context

- `scripts/e2e-stack.sh`, `Makefile`, `.github/workflows/ci.yml` — the stack runner, its target and its CI job.
- `frontend/src/features/{landing,play,leaderboard}/` — pages and labels the test drives.

### What to build

- `e2e/package.json`, `e2e/pnpm-lock.yaml`: `@playwright/test`, `typescript@~7.0`, `oxlint`, `oxlint-tsgolint`, `prettier`, `@types/node`, `eslint-plugin-playwright`.
  Versions resolve at execution with `pnpm add -D`.
- `e2e/playwright.config.ts`, `e2e/tsconfig.json`, `e2e/.oxlintrc.json`, `e2e/.prettierignore` per the decisions.
- `e2e/tests/run.spec.ts`, one test. The player name is `e2e_` plus 8 base36 characters.
  - It enters the name on `/` and starts a run.
  - On `/play/:runId` it clicks the first option of each question until the result shows, and reads the score.
  - It follows the result's leaderboard link and finds the name with that score on today's tab.
  - The console gate applies to every page.
- `Makefile`: `e2e-check` (frozen install, `format:check`, `typecheck`, `lint` in `e2e/`) in `CLASS_developer`, a prerequisite of `check`.
  `e2e` runs the Playwright install, then `scripts/e2e-stack.sh pnpm --dir e2e test`.
- `scripts/smoke.sh` deleted; `grep -rn 'smoke.sh' .` then fixes every reference.
- `.github/workflows/ci.yml`: filter `e2e` gains `e2e/**`. Job `e2e` gains SHA-pinned `pnpm/action-setup` (`package_json_file: e2e/package.json`).
  It also gains `setup-node` with `.node-version`, `make e2e-check`, `playwright install --with-deps chromium`, the stack run and the upload.
- `.github/dependabot.yml`: an npm entry for `/e2e`. `.gitignore`: `e2e/playwright-report/`, `e2e/test-results/`.
- `docs/decisions.md`: one D line for the browser package outside `frontend/`, one for the absent test clock.

### Acceptance criteria

- [ ] A run passes through the edge (local): `make e2e`
- [ ] CI uploads the report on failure: `grep -q 'e2e/playwright-report/' .github/workflows/ci.yml`
- [ ] No reference to the deleted smoke script remains: `! grep -rq 'smoke.sh' Makefile .github scripts README.md AGENTS.md`
- [ ] `make check` passes

## Phase 2: Production configuration review

**Depends on**: 1

### Context

- `reverse-proxy/Caddyfile` — the primary site's `header` block.
- `.github/dependabot.yml` — one entry per package and Dockerfile directory.

### What to build

- `reverse-proxy/Caddyfile`: the CSP header from the decisions, beside the handbook's security headers.
- `e2e/tests/run.spec.ts`: the response to `/` carries `Content-Security-Policy` containing `frame-ancestors 'none'`.
- `.github/dependabot.yml`: an entry for every directory with a manifest or Dockerfile, `/database` included.
- `docs/decisions.md`: one D line for the CSP with its two exceptions and their reasons.

### Acceptance criteria

- [ ] The CSP holds and breaks no page (local): `make e2e`
- [ ] The styles exception is the only `unsafe-inline`: `test "$(grep -o "'unsafe-inline'" reverse-proxy/Caddyfile | wc -l)" -eq 1`
- [ ] Every package and image directory has a Dependabot entry: `for d in backend frontend e2e reverse-proxy database; do grep -qE "directory: \"?/$d\"?\s*$" .github/dependabot.yml || exit 1; done`
- [ ] `make check` passes

## Phase 3: Documentation and the `v1.0.0` checklist

**Depends on**: 2

### Context

- `docs/prds/prd-rebuild.md` — sections Question rules, Run rules and Leaderboard.
- `README.md`, `AGENTS.md`, `docs/README.md`, `docs/decisions.md` — current state after phases 1–2.
- `docker-compose.prod.yml`, `database/Dockerfile`, `Makefile`, `.github/workflows/ci.yml` — release pins.

### What to build

- `docs/game-rules.md`, a current-state doc with sections Questions, Runs and Leaderboard.
  It states the durable rules, the clock, the end reasons and the ranking, without links into `docs/prds/` or `docs/plans/`.
- `README.md` quick start: `make db`, `make db-migrate`, `make be`, `make fe`, `make check`, `make be-integration`, `make e2e`.
  A link to `docs/game-rules.md`. The licence section stays as country-data wrote it.
- `README.md` deploy section: links to the handbook's `guides/deploy.md` and `guides/backup-restore.md`, and `DOMAIN=what-the-flag.de make prod-deploy`.
  It states three images per release, `migrate` running inside the deploy after the backup, and `make prod-migrate ARGS=version`.
- `docs/README.md`: one row per file in `docs/` with the question it answers.
- `docs/decisions.md`: every D line true to the tree; a replaced line says `replaced by DNN`.
- `AGENTS.md`: layout, `make` targets and rules true to the final tree, with `e2e/`, `database/Dockerfile` and `scripts/`.
  It links `docs/game-rules.md` and states that a route lands with its `backend/internal/contract/<domain>_integration_test.go` cases.
- `docker-compose.prod.yml`: `backend`, `edge` and `migrate` images move to `v1.0.0`.
- Run every check below and fix any failure in its own commit. No feature lands here.

### Acceptance criteria

- [ ] Game rules complete: `for h in Questions Runs Leaderboard; do grep -q "^## $h" docs/game-rules.md || exit 1; done`
- [ ] Game rules stand alone: `! grep -qE 'prds/|plans/' docs/game-rules.md`
- [ ] README and AGENTS link the rules: `grep -q 'docs/game-rules.md' README.md && grep -q 'docs/game-rules.md' AGENTS.md`
- [ ] Docs index complete: `for f in docs/*.md; do [ "$f" = docs/README.md ] || grep -q "$(basename "$f")" docs/README.md || exit 1; done`
- [ ] Paths true: ``grep -ohE '`[A-Za-z0-9_./-]+/`' AGENTS.md README.md | tr -d '`' | sort -u | while read -r p; do test -e "$p" || exit 1; done``
- [ ] Targets true: `grep -ohE 'make [a-z-]+' README.md AGENTS.md | awk '{print $2}' | sort -u | while read -r t; do grep -qE "^$t:" Makefile || exit 1; done`
- [ ] Pins: `test "$(grep -cE 'what-the-flag-(backend|edge|migrate):v1\.0\.0' docker-compose.prod.yml)" -eq 3`
- [ ] One migrate version: `test "$(grep -hoE 'v4\.[0-9]+\.[0-9]+' database/Dockerfile Makefile .github/workflows/ci.yml | sort -u | wc -l)" -eq 1`
- [ ] No template placeholders: `! grep -rqE '<(owner|project|name|domain|database-name)>' docker-compose.prod.yml .github reverse-proxy scripts Makefile`
- [ ] Owner items name the tag: `grep -q 'prod-release VERSION=1.0.0' docs/plans/programme.md`
- [ ] Integration suite passes (with `make db` and `make db-migrate` done): `make be-integration`
- [ ] The full stack passes (local): `make e2e`
- [ ] `make check` passes
