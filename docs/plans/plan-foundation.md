# Plan: Foundation

> Source PRD: docs/prds/prd-rebuild.md

## Goal

Replace the repository content with the handbook Go + React scaffold.
End state: `GET /api/health` reaches Postgres and shows on the landing page through the API client.
The new-project guide's Verify section passes. Every later plan builds on this tree.

## Architectural decisions

Inputs to `<handbook>/guides/new-project.md` (`<handbook>` = the handbook clone, `/home/user/handbook` in cloud sessions):

| Input | Value |
| --- | --- |
| `<project-name>` / `<github-owner>` / `<database-name>` / `<domain>` | `what-the-flag` / `nicograef` / `whattheflag` / `what-the-flag.de` |
| `<project-go-version>` | `curl -fsS 'https://go.dev/dl/?mode=json' \| jq -r '.[0].version'`, without the `go` prefix |
| `<node-major>` | major of `curl -fsS https://nodejs.org/dist/index.json \| jq -r '[.[] \| select(.lts != false)][0].version'` |
| pnpm | `npm view pnpm version`, installed with `npm install -g pnpm@<that>` before `pnpm create vite` |
| `<other-stacks>` | `python` |

- **Health**: `GET /api/health` pings the pool (2 s timeout). 200 `{"status":"ok"}`; else 503 envelope code `database_unavailable`.
- **Error envelope**: `httpx.Error{Status, Code, Message, Field}` serialises to `{"error":{"code","message","field"?}}`. Codes are snake_case.
- Foundation codes: `invalid_json` 400, `body_too_large` 413, `unsupported_media_type` 415, `origin_mismatch` 403, `not_found` 404, `internal` 500, `database_unavailable` 503.
- **JSON input**: `httpx.ReadJSON` requires `Content-Type: application/json`, caps the body at 1 MiB, rejects unknown fields.
- **Origin check**: POST, PUT, PATCH, DELETE need an `Origin` whose host equals `r.Host`; missing counts as mismatch. Caddy and the Vite proxy both keep `Host`.
- **Locale**: `httpx.Locale` (`httpx.DE` = `"de"`, `httpx.EN` = `"en"`). Middleware takes the highest-q supported `Accept-Language` tag, fallback `en`. Handlers read `httpx.LocaleFrom(ctx)`.
- **Middleware order** (outer → inner): `RequestLog`, `Recover`, `Locale`, `CheckOrigin`, mux. Unmatched `/api/` paths get the `not_found` envelope.
- **Server**: `log/slog` JSON to stdout; `:$APP_PORT` (default 8080); SIGINT/SIGTERM → `Shutdown` with 10 s, then pool close.
- **Config**: `config.Load(getenv)` requires `DB_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`; `Config.DatabaseURL()` uses port 5432, `sslmode=disable`, escaped credentials.
- **Integration helper**: `backend/internal/postgres — TestPool(t testing.TB)` (`//go:build integration`) builds the pool via `config.Load(os.Getenv)`; it fails, never skips, when env is missing.
- **Makefile**: `-include .env` plus `export`, so `make check` runs without `.env`. `MIGRATE_VERSION` is read from `.github/workflows/ci.yml` (one pin).
- `db-migrate` runs `migrate/migrate:$(MIGRATE_VERSION)` on network `what-the-flag-dev_default` against host `postgres`, per `reference/postgresql.md`. `be-integration` runs `go test -tags=integration -race ./...` in `backend/`.
- **Dev Compose**: `postgres` (template block, plus the prod `pg_isready` healthcheck) and `backend` (build `./backend`, `DB_HOST: postgres`, `127.0.0.1:8080:8080`). The template `app` service goes.
- **golangci**: drop the forbidigo `forbid` placeholder entry; forbidigo then applies its default (`fmt.Print*`, `print`, `println`). Domain plans add real guards.
- **API client**: `lib/api.ts — ApiClient` interface (`get`, `post`, `patch`, `delete`, each `(path, schema, body?)`), `createApiClient({ fetch, getLocale })`, `ApiClientProvider`, `useApiClient()`. Tests inject a fake through the provider.
- Requests send `Accept-Language`, `credentials: "same-origin"`, JSON bodies; responses are Zod-parsed. Failures throw `ApiError{status, code, field?}`; codes `network` and `invalid_response` are client-side.
- **i18n**: `lib/i18n/locale.tsx — LocaleProvider, useLocale(), detectLocale()`; storage key `wtf.locale`, guarded by try/catch; sets `<html lang>`. `lib/i18n/messages.ts — useMessages()`.
- **Query keys** of responses with localised text end with the locale, so a switch refetches.
- **Router**: `react-router` data router; `src/app/router.tsx` exports `routes` (tests use `createMemoryRouter(routes)`) and `router`.
- The shell holds no translatable text: brand name, and switch buttons "Deutsch"/"English" with `lang`. The 404 page lives in `landing`.
- `cn()` is the helper shadcn init writes to `frontend/src/lib/utils.ts`. Paths alias `@/*` → `src/*`, without `baseUrl` (TypeScript 7).
- `.env.example` lists `COMPOSE_FILE` (commented), `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB=whattheflag`, `DB_HOST=localhost`, `# APP_PORT=8080`, `# BACKUP_PING_URL`. `APP_ENV`, `JWT_SECRET` and the "add a test" sentence go.
- `LICENSE` does not exist yet: create the MIT text, `Copyright (c) 2024 Nico Gräf` (author of the deleted `package.json`).
- `docs/decisions.md` D01–D15 (one line each): D01 handbook Go + React row; D02 Postgres 18, no SQLite; D03 vendored country data, dataset ODbL-1.0, code MIT; D04 catalogue in memory, DB stores codes only;
  D05 opaque flag keys, 4:3 flags; D06 server clock, 20 s + 2 s grace; D07 server-side 30-day sliding sessions, argon2id, no email; D08 JSON + matching `Origin` on unsafe requests; D09 append-only ledger, idempotent per source;
  D10 weekly = ISO week `Europe/Berlin`, created on first access; D11 German + English UI, no i18n library; D12 no data migration; D13 one API client, Zod at the boundary; D14 health pings the database; D15 localised query keys end with the locale.

## Inventory

- `<handbook>/guides/new-project.md` — every scaffold command; its Verify is the final acceptance.
- `<handbook>/templates/*` — copied files; edits listed per phase.
- `<handbook>/reference/stack-conventions.md` — Package scripts block, React layout, Go layout.
- `<handbook>/reference/postgresql.md` — migrate container form used by `db-migrate`.
- `https://ui.shadcn.com/docs/installation/vite` — read at execution time for Tailwind + shadcn init.
- Repository files deleted: `client/`, `server/`, `nginx-conf/`, `package.json`, `Dockerfile`, `Procfile`, `docker-compose.yml`, `.dockerignore`, `.gitignore`, `README.md`, `.github/workflows/challenge-of-the-week-cronjob.yml`.

## Open questions / Risks

- **Toolchains**: the cloud container has Go 1.24 and Node 22. Recommended: `GOTOOLCHAIN=auto` fetches the pinned Go through the module proxy; download the Node tarball from nodejs.org into `~/.local`. Fallback: run on the owner's dev machine.
- **Owner action**: apply the guide's "Create the repository" steps 2 and 3 for `nicograef/what-the-flag`; cloud sessions have no `gh`. Skip step 1: the repo exists.
- **Owner action**: GHCR packages start private; the server needs `docker login ghcr.io` or public packages before `make prod-deploy`.
- **CI `pull_request` trigger**: recommended to keep it commented (owner pushes directly). Uncomment it if forks should be checked.
- **TypeScript 7** may reject create-vite or shadcn tsconfig options (`baseUrl`, deprecated flags). Fix the tsconfig, never pin TS lower.
- **oxlint `--deny-warnings`** may flag shadcn files (`react-refresh/only-export-components`). Recommended: an `.oxlintrc.json` override scoped to `src/components/ui/**`; alternative: edit the generated file.
- `govulncheck` and `pnpm audit` need network; a proxy refusal is an environment block, not a pass.
- Merging deploys nothing: the live site keeps running until the owner tags `v0.1.0` and follows the deploy runbook.

## Phase 1: Clean slate and handbook scaffold

**Depends on**: none

### Context

- Deleted: every path in the Inventory's "Repository files deleted" line.
- Kept: `.git/`, `docs/prds/prd-rebuild.md`, `docs/UBIQUITOUS_LANGUAGE.md`, `docs/plans/`.
- Guide sections run in order: "Copy the base files", "Scaffold the stack" (Go and React lines), "Set up the toolchain" step 1, "Fill the templates" (the files present now).

### What to build

- Base: `.editorconfig`, `.gitignore`, `Makefile`, `.vscode/settings.json`, `scripts/make-help.awk`, `.claude/settings.json` copied unchanged.
- `docker-compose.yml`: uncomment `postgres` and `volumes`, add its healthcheck, replace `app` with `backend` (decisions).
- `.devcontainer/devcontainer.json`: uncomment the Go, Node and Docker-in-Docker features, the Go extension and the oxc and Prettier extensions.
- `.github/workflows/ci.yml`, `.github/dependabot.yml`, `scripts/setup-dev-tools.sh`: python blocks deleted, placeholders filled by the guide's sed.
- `backend/go.mod`, `backend/go.sum` (tools goimports, sqlc, govulncheck), `backend/Dockerfile`, `backend/.dockerignore`, `backend/.golangci.yml` (forbid placeholder dropped), `backend/sqlc.yaml`.
- `backend/cmd/what-the-flag/main.go` (guide's health server), `backend/sqlc/queries/meta.sql — GetMeta`, generated `backend/internal/db/`.
- `database/migrations/000001_init.up.sql` (`app_meta`).
- `frontend/` from `pnpm create vite frontend --template react-ts --no-interactive`, then `frontend/.node-version`, `packageManager`, the Package scripts block, `frontend/.prettierignore`, `pnpm run format`.
- `Makefile`: Go blocks uncommented (guide sed), python blocks deleted, `-include .env` + `export`, `MIGRATE_VERSION`, targets `db-migrate` (under `db`) and `be-integration` (under Code Quality); both join `CLASS_developer`.

### Acceptance criteria

- [ ] `git ls-files client server nginx-conf package.json Dockerfile Procfile .dockerignore README.md .github/workflows/challenge-of-the-week-cronjob.yml` prints nothing.
- [ ] `make help` lists `db-migrate` and `be-integration` under DEVELOPER and prints no UNCLASSIFIED section.
- [ ] `grep -c 'stack: python' Makefile .github/workflows/ci.yml .github/dependabot.yml scripts/setup-dev-tools.sh` prints `0` for each file.
- [ ] The guide's placeholder `grep` over `Makefile docker-compose*.yml .devcontainer/* scripts/setup-dev-tools.sh .github/*.yml .github/workflows/*.yml */Dockerfile` prints nothing.
- [ ] `docker compose config --services` prints `postgres` and `backend`.
- [ ] With a `.env` holding `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB=whattheflag`, `DB_HOST=localhost` and `make db` running, `make db-migrate` prints `1/u init`.
- [ ] `cd backend && go tool sqlc diff && go build -o /dev/null ./cmd/what-the-flag` exits 0.
- [ ] `make check` passes.

## Phase 2: Backend skeleton with database health

**Depends on**: 1

### Context

- `backend/cmd/what-the-flag/main.go — main()` — replaced by the wiring below.
- `backend/internal/db — New(), Queries.GetMeta()` — used by the integration test.
- Choke file for later plans: `main.go`. Every domain adds one `Register(mux)` call there.

### What to build

- `backend/internal/config/config.go — Config, Load(), Config.DatabaseURL()`; test `backend/internal/config/config_test.go — TestLoad` (unit: default port, missing vars named, escaped password).
- `backend/internal/httpx/errors.go — Error, Error.Error(), WriteError()` (non-`*Error` → logged, `internal` 500).
- `backend/internal/httpx/json.go — ReadJSON(), WriteJSON()`.
- `backend/internal/httpx/middleware.go — Chain(), RequestLog(), Recover(), Locale(), LocaleFrom(), CheckOrigin(), NotFound()`; type `Locale` with `DE`, `EN`.
- `backend/internal/httpx/httpx_test.go` (unit, `httptest`): envelope shape with and without `field`; ReadJSON 415/413/400; CheckOrigin table (GET passes, POST with matching, foreign, missing Origin); Locale table (`de-DE`, `en;q=0.9,de;q=0.8`, `fr`, empty); Recover → 500 envelope.
- `backend/internal/postgres/postgres.go — NewPool(ctx, url)` (pgx v5 pool, ping on start).
- `backend/internal/postgres/testpool.go — TestPool()` and `backend/internal/postgres/postgres_integration_test.go — TestFirstMigrationApplied` (integration: `GetMeta` on an unknown key returns `pgx.ErrNoRows`).
- `backend/internal/health/handler.go — Pinger, Handler, NewHandler(), Handler.Register()`; `backend/internal/health/handler_test.go — TestHealth` (unit, fake pinger: 200 body, 503 envelope).
- `backend/cmd/what-the-flag/main.go — main(), run()`: config, slog, pool, mux, middleware, server, graceful shutdown; logs `server stopped` last.
- `backend/go.mod`, `backend/go.sum`: pgx v5 added.

### Acceptance criteria

- [ ] `cd backend && go test ./internal/config -run TestLoad` passes (unit).
- [ ] `cd backend && go test ./internal/httpx` passes (unit).
- [ ] `cd backend && go test ./internal/health -run TestHealth` passes (unit).
- [ ] With `make db` and `make db-migrate` done, `cd backend && go test -tags=integration -race ./internal/postgres -run TestFirstMigrationApplied` passes (integration).
- [ ] With `make db` and `make be` running, `curl -fsS localhost:8080/api/health` prints `{"status":"ok"}`.
- [ ] With `make be` running, `curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: http://evil.example' localhost:8080/api/health` prints `403`.
- [ ] `docker compose up -d --build backend && docker compose stop backend && docker compose logs backend | grep -c 'server stopped'` prints `1`.
- [ ] `make check` passes.

## Phase 3: Frontend shell with landing tracer

**Depends on**: 1

### Context

- `frontend/src/main.tsx`, `frontend/index.html`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/package.json`, `frontend/pnpm-lock.yaml` — edited.
- Deleted template files: `frontend/src/App.tsx`, `frontend/src/App.css`, `frontend/src/assets/`, `frontend/public/vite.svg`.
- Choke file for later plans: `frontend/src/app/router.tsx`.

### What to build

- Tailwind + shadcn/ui per the current Vite install docs: `frontend/src/index.css`, `frontend/components.json`, `frontend/src/lib/utils.ts — cn()`, `frontend/src/components/ui/button.tsx` (`shadcn add button`).
- Dependencies (latest at execution, `pnpm add`): `@tanstack/react-query`, `react-router`, `zod`; dev: `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `@testing-library/jest-dom`.
- `frontend/vite.config.ts`: tailwind plugin, `@` alias, `server.proxy` `/api` → `http://localhost:8080`, `test` block (`jsdom`, `setupFiles: ./src/test/setup.ts`).
- `frontend/src/lib/api.ts — ApiClient, ApiError, createApiClient(), ApiClientProvider, useApiClient()`; test `frontend/src/lib/api.test.ts` (unit, fake `fetch`: headers sent, envelope → `ApiError`, schema mismatch → `invalid_response`).
- `frontend/src/lib/i18n/locale.tsx — Locale, LocaleProvider, useLocale(), detectLocale()`; `frontend/src/lib/i18n/messages.ts — Messages, useMessages()`; test `frontend/src/lib/i18n/locale.test.ts — detectLocale` (unit table, stored value wins).
- `frontend/src/app/providers.tsx — Providers` (QueryClient, LocaleProvider, ApiClientProvider), `frontend/src/app/layout.tsx — Layout`, `frontend/src/app/navbar.tsx — Navbar` (brand, language switch), `frontend/src/app/router.tsx — routes, router`.
- `frontend/src/features/landing/landing-page.tsx — LandingPage` (title, tagline, server status), `frontend/src/features/landing/not-found-page.tsx — NotFoundPage`, `frontend/src/features/landing/api.ts — healthSchema, useHealth()`, `frontend/src/features/landing/messages.ts — messages`.
- `frontend/src/test/setup.ts` (jest-dom, cleanup), `frontend/src/test/render.tsx — renderRoute(path, { api, locale })` (real QueryClient without retries, memory router).
- `frontend/src/features/landing/landing-page.test.tsx` (component, fake API client): online text in German; offline text on `ApiError`; clicking "English" switches text and stores `wtf.locale`.
- `frontend/index.html`: `lang="de"`, title "What The Flag", `frontend/public/favicon.svg`.

### Acceptance criteria

- [ ] `pnpm --dir frontend exec vitest run src/lib/api.test.ts` passes (unit).
- [ ] `pnpm --dir frontend exec vitest run src/lib/i18n/locale.test.ts` passes (unit).
- [ ] `pnpm --dir frontend exec vitest run src/features/landing/landing-page.test.tsx` passes (component).
- [ ] `grep -rln 'fetch(' frontend/src | grep -v -e 'src/lib/api' -e '\.test\.'` prints nothing.
- [ ] `make check` passes.

## Phase 4: Production stack, agent files and Verify

**Depends on**: 2, 3

### Context

- Guide sections run: "Copy the production files", "Fill the templates" for the new files, "Set up the agent files", "Verify".
- `docs/prds/prd-rebuild.md` — source of `docs/decisions.md` D01–D13.

### What to build

- `docker-compose.prod.yml`, `.env.example` (edits in decisions), `scripts/prod-init.sh`, `scripts/backup-postgres.sh`, `.github/workflows/release.yml` from the templates, placeholders filled.
- `reverse-proxy/Caddyfile` (`example.com` → `what-the-flag.de`), `reverse-proxy/Dockerfile` (`<node-major>` filled), `reverse-proxy/Dockerfile.dockerignore`.
- `CLAUDE.md` (`@AGENTS.md`). `AGENTS.md`: project in two lines; links to PRD, glossary, decisions; `make` targets table; rules below.
- AGENTS.md rules: UI German + English, files English; UI strings only in a feature's `messages.ts`; backend domain packages with `handler.go`/`service.go`/`store.go`; frontend `features/<name>/`; API only via `lib/api.ts`; sqlc output regenerated, never edited; migrations forward-only `.up.sql`; error envelope; locale query keys.
- `docs/README.md` (rows: PRD, glossary, decisions, each with its question), `docs/decisions.md` (D01–D15), `README.md` (name, one-line pitch, `make help`, setup link to the guide, code licence), `LICENSE` (MIT).

### Acceptance criteria

- [ ] `grep -c example.com reverse-proxy/Caddyfile` prints `0`.
- [ ] `docker build -t what-the-flag-backend:dev backend` exits 0.
- [ ] `docker build -f reverse-proxy/Dockerfile -t what-the-flag-edge:dev .` exits 0.
- [ ] With `make db`, `make db-migrate`, `make be` and `make fe` running, `curl -fsS localhost:5173/api/health` prints `{"status":"ok"}` (cross-stack tracer).
- [ ] `head -1 CLAUDE.md` prints `@AGENTS.md`.
- [ ] `docker compose -f docker-compose.prod.yml --env-file .env.example config --quiet && echo ok` prints `ok`.
- [ ] `make help` prints the DEVELOPER and PRODUCTION sections.
- [ ] `make check` passes.
