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

- **Toolchain (R26)**: the container ships Go 1.24 and Node 22. Go: `GOTOOLCHAIN=auto` (the container default) fetches `go<project-go-version>` through the module proxy once `go.mod` names it.
- Node: `curl -fsSLO https://nodejs.org/dist/<version>/node-<version>-linux-x64.tar.xz`, checked against that directory's `SHASUMS256.txt`, extracted to `~/.local/node`, `~/.local/node/bin` first on `PATH`.
- **Docker (R29)**: the container's `dockerd` is stopped. Start it with `dockerd &` and wait until `docker info` exits 0, before `make db` or any build.
  Local image builds use `--network host` and get `/root/.ccr/ca-bundle.crt` per `/root/.ccr/README.md` from a local-only override or build args; the committed Dockerfiles stay template-clean.
- No step relies on `nico` plugin scripts, `agent-bus.sh`, `plan-run-guard.sh` or `~/.claude/*` scripts.
- **CI `pull_request` trigger** stays commented, as in the template: the owner pushes directly.

- **Health (R19)**: `GET /api/health` pings the pool (2 s timeout). 200 `{"status":"ok"}`; else 503 envelope code `database_unavailable`.
- **Error envelope**: `httpx.Error{Status, Code, Message, Field}` serialises to `{"error":{"code","message","field"?}}`. Codes are snake_case.
- Foundation codes: `invalid_json` 400, `body_too_large` 413, `unsupported_media_type` 415, `origin_mismatch` 403, `not_found` 404, `internal` 500, `database_unavailable` 503.
- **JSON input**: `httpx.ReadJSON` caps the body at 1 MiB and rejects unknown fields and trailing data.
- **Unsafe methods** (POST, PUT, PATCH, DELETE) pass two middlewares, so the PRD's "JSON and a matching `Origin`" holds for body-less requests too:
  - `CheckOrigin` (R6): the host:port of the `Origin` URL must equal the `Host` header, port included, case-insensitive. Missing or unparsable counts as mismatch. No configured list, no env var. Caddy and the Vite proxy (`changeOrigin` off) keep `Host`.
  - `RequireJSON`: `Content-Type` media type must be `application/json`, else 415 `unsupported_media_type`.
- **Locale (R2)**: `httpx.Locale` (`httpx.DE` = `"de"`, `httpx.EN` = `"en"`). `DetectLocale` takes the highest-q supported `Accept-Language` tag, fallback `en`. Handlers read `httpx.LocaleFrom(ctx)`.
- **Middleware order** (outer → inner): `RequestLog`, `Recover`, `DetectLocale`, `CheckOrigin`, `RequireJSON`, mux. `/api/` (catch-all) answers the `not_found` envelope.
- **Go signatures** (package `httpx` unless named):

| Symbol | Signature |
| --- | --- |
| `Error` | `type Error struct { Status int; Code, Message, Field string }`; `func (e *Error) Error() string` |
| `WriteError` | `func WriteError(w http.ResponseWriter, r *http.Request, err error)`: an `*Error` (via `errors.As`) as-is; anything else logged, then `internal` 500 |
| `WriteJSON`, `ReadJSON` | `func WriteJSON(w http.ResponseWriter, status int, v any)`; `func ReadJSON(w http.ResponseWriter, r *http.Request, dst any) error` (returns `*Error`) |
| Locale | `type Locale string`; `func LocaleFrom(ctx context.Context) Locale` (`EN` when unset) |
| Middleware | `func Chain(h http.Handler, mw ...func(http.Handler) http.Handler) http.Handler` (first is outermost); `RequestLog(*slog.Logger)`, `Recover(*slog.Logger)` return `func(http.Handler) http.Handler`; `DetectLocale`, `CheckOrigin`, `RequireJSON` are `func(http.Handler) http.Handler`; `func NotFound() http.Handler` |
| `config` | `type Config struct { DBHost, DBUser, DBPassword, DBName string; Port int }`; `func Load(getenv func(string) string) (Config, error)`; `func (c Config) DatabaseURL() string` |
| `postgres` | `func NewPool(ctx context.Context, url string) (*pgxpool.Pool, error)`; `func TestPool(t testing.TB) *pgxpool.Pool` |
| `health` | `type Pinger interface { Ping(context.Context) error }`; `func NewHandler(p Pinger) *Handler`; `func (h *Handler) Register(mux *http.ServeMux)` |

- **Server**: `log/slog` JSON to stdout; `:$APP_PORT` (default 8080); SIGINT/SIGTERM → `Shutdown` with 10 s, then pool close.
- **Config**: `config.Load(getenv)` requires `DB_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`; `Config.DatabaseURL()` uses port 5432, `sslmode=disable`, escaped credentials.
- **Integration helper**: `backend/internal/postgres/testpool.go — TestPool()` (`//go:build integration`, a non-test file so other packages import it) builds the pool via `config.Load(os.Getenv)` and closes it in `t.Cleanup`. It fails, never skips, when env is missing.
- `go test` runs packages in parallel against one database. Integration tests never truncate; each creates its own rows with fresh ids and names.
- **sqlc (R3)**: `backend/sqlc.yaml` extends the guide's file with `sql_package: pgx/v5` and two overrides: `db_type: uuid` → `github.com/google/uuid.UUID`; `db_type: uuid, nullable: true` → `github.com/google/uuid.NullUUID`. pgx v5 is therefore a phase 1 dependency.
- **Makefile**: `-include .env` plus `export`, so `make check` runs without `.env`. `MIGRATE_VERSION` is read from `.github/workflows/ci.yml` (one pin).
- `db-migrate` runs `migrate/migrate:$(MIGRATE_VERSION)` on network `what-the-flag-dev_default` against host `postgres`, per `reference/postgresql.md`. `be-integration` runs `go test -tags=integration -race ./...` in `backend/`.
- **Dev Compose**: `postgres` (template block, plus the prod `pg_isready` healthcheck) and `backend` (build `./backend`, `POSTGRES_*` from `.env`, `DB_HOST: postgres`, `127.0.0.1:8080:8080`, `depends_on: postgres: condition: service_healthy`). The template `app` service goes.
- **Production migrations (R9)** belong to release-readiness. Foundation copies the prod templates without a migrate step.
- **golangci**: drop the forbidigo `forbid` placeholder entry; forbidigo then applies its default (`fmt.Print*`, `print`, `println`). Domain plans add real guards.
- **API client** (`frontend/src/lib/api.ts`):
  - `interface ApiClient { get<T>(path: string, schema: z.ZodType<T>): Promise<T>; post, patch, delete: <T>(path: string, schema: z.ZodType<T>, body?: unknown) => Promise<T> }`.
  - `createApiClient(deps: { fetch: typeof fetch; getLocale: () => Locale }): ApiClient`; `ApiClientProvider({ client, children })`; `useApiClient(): ApiClient`.
  - `class ApiError extends Error { status: number; code: string; field?: string }`; codes `network` and `invalid_response` are client-side.
- Every request sends `Accept-Language` and `credentials: "same-origin"`. Unsafe methods always send `Content-Type: application/json` and a JSON body (`{}` when none). A 204 parses `undefined`, so callers pass `z.undefined()`.
- **Test seam (R18)**: `frontend/src/test/render.tsx — renderRoute(path: string, options: { api: ApiClient; locale?: Locale })` renders `routes` in a memory router inside `Providers`, with a real QueryClient without retries.
  - Feature tests fake the server only through it, building `api` with `createApiClient({ fetch: fakeFetch, getLocale })` so Zod parsing stays real.
- **i18n** (`frontend/src/lib/i18n/`): `type Locale = "de" | "en"`; `locale.tsx — getLocale(), useLocale(): { locale; setLocale(l) }, detectLocale(), LocaleProvider`; `messages.ts — useMessages<T>(m: { de: T; en: T }): T`.
  - Locale state is a module store read with `useSyncExternalStore`. `setLocale` writes it and `wtf.locale` synchronously, so the next request already carries the new `Accept-Language`.
  - Storage access is guarded by try/catch. `LocaleProvider` keeps `<html lang>` in sync. `src/test/setup.ts` resets the store and storage after each test.
- **Query keys** of responses with localised text end with the locale, so a switch refetches.
- **Router**: `react-router` data router; `src/app/router.tsx` exports `routes` (tests use `createMemoryRouter(routes)`) and `router`.
- The shell's text: brand name, switch buttons "Deutsch"/"English" with `lang`, and the footer. The 404 page lives in `landing`.
- **Footer (R28)**: `frontend/src/app/footer.tsx — Footer`, mounted in `Layout` on every page, text from `frontend/src/app/messages.ts`.
  de "Länderdaten: mledoze/countries (ODbL 1.0), Wikidata, Unicode CLDR; Flaggen: flag-icons (MIT)"; en "Country data: mledoze/countries (ODbL 1.0), Wikidata, Unicode CLDR; Flags: flag-icons (MIT)".
  It links to `https://github.com/nicograef/what-the-flag/blob/main/NOTICE`, which resolves once country-data adds `NOTICE`.
- **Navbar slot**: `frontend/src/app/navbar.tsx — Navbar` renders the brand left and a right-hand `<div data-slot="nav-right">` holding the language switch. Later plans add links and menus inside that element.
- `cn()` is the helper shadcn init writes to `frontend/src/lib/utils.ts`, not the `cn` package of stack-conventions; AGENTS.md records the override. Paths alias `@/*` → `src/*`, without `baseUrl` (TypeScript 7).
- `.env.example` lists `COMPOSE_FILE` (commented), `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB=whattheflag`, `DB_HOST=localhost`, `# APP_PORT=8080`, `# BACKUP_PING_URL`. `APP_ENV`, `JWT_SECRET` and the "add a test" sentence go.
- **Root `LICENSE` (R1)**: foundation creates the MIT text, `Copyright (c) 2022 Nico Gräf` (first commit and author of the deleted `package.json`).
- **`docs/decisions.md` (R22)**: foundation seeds it; later plans append only decisions the PRD does not hold.
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

- **Owner action**: apply the guide's "Create the repository" steps 2 and 3 for `nicograef/what-the-flag`; cloud sessions have no `gh`. Skip step 1: the repo exists.
- **Owner action**: GHCR packages start private; the server needs `docker login ghcr.io` or public packages before `make prod-deploy`.
- **TypeScript 7** may reject create-vite or shadcn tsconfig options (`baseUrl`, deprecated flags). Fix the tsconfig, never pin TS lower.
- **oxlint `--deny-warnings`** may flag shadcn files (`react-refresh/only-export-components`). Recommended: an `.oxlintrc.json` override scoped to `src/components/ui/**`; alternative: edit the generated file.
- `govulncheck` and `pnpm audit` need network; a proxy refusal is an environment block, not a pass.
- Merging deploys nothing: the live site keeps running until the owner tags `v0.1.0` and follows the deploy runbook.

## Phase 1: Clean slate and handbook scaffold

**Depends on**: none

### Context

- Deleted: every path in the Inventory's "Repository files deleted" line.
- Kept: `.git/`, `docs/prds/prd-rebuild.md`, `docs/UBIQUITOUS_LANGUAGE.md`, `docs/plans/`.
- Toolchain first (decisions): Node tarball into `~/.local/node`, pnpm via npm. Go arrives through `GOTOOLCHAIN=auto` after `go mod edit -go=<project-go-version>`. `dockerd &`, then wait for `docker info` (R29).
- Guide sections run in order: "Copy the base files", "Scaffold the stack" (Go and React lines), "Set up the toolchain" step 1, "Fill the templates" (the files present now).

### What to build

- Base: `.editorconfig`, `.gitignore`, `Makefile`, `.vscode/settings.json`, `scripts/make-help.awk`, `.claude/settings.json` copied unchanged.
- `docker-compose.yml`: uncomment `postgres` and `volumes`, add its healthcheck, replace `app` with `backend` (decisions).
- `.devcontainer/devcontainer.json`: uncomment the Go, Node and Docker-in-Docker features, the Go extension and the oxc and Prettier extensions.
- `.github/workflows/ci.yml`, `.github/dependabot.yml`, `scripts/setup-dev-tools.sh`: python blocks deleted, placeholders filled by the guide's sed.
- `backend/go.mod`, `backend/go.sum` (tools goimports, sqlc, govulncheck; `github.com/jackc/pgx/v5`), `backend/Dockerfile`, `backend/.dockerignore`, `backend/.golangci.yml` (forbid placeholder dropped), `backend/sqlc.yaml` (pgx/v5, uuid overrides).
- `backend/cmd/what-the-flag/main.go` (guide's health server), `backend/sqlc/queries/meta.sql — GetMeta`, generated `backend/internal/db/`.
- `database/migrations/000001_init.up.sql` (`app_meta`).
- `frontend/` from `pnpm create vite frontend --template react-ts --no-interactive`, then `frontend/.node-version`, `packageManager`, the Package scripts block, `frontend/.prettierignore`, `pnpm run format`.
- `Makefile`: Go blocks uncommented (guide sed), python blocks deleted, `-include .env` + `export`, `MIGRATE_VERSION`, targets `db-migrate` (under `db`) and `be-integration` (under Code Quality); both join `CLASS_developer`.

### Acceptance criteria

- [ ] `cd backend && go version` prints `go<project-go-version>`, and `node --version` starts with `v<node-major>.`.
- [ ] `docker info --format '{{.ServerVersion}}'` prints a version (R29: `dockerd` running).
- [ ] `git ls-files client server nginx-conf package.json Dockerfile Procfile .dockerignore README.md .github/workflows/challenge-of-the-week-cronjob.yml` prints nothing.
- [ ] `make help` lists `db-migrate` and `be-integration` under DEVELOPER and prints no UNCLASSIFIED section.
- [ ] `! grep -l 'stack: python' Makefile .github/workflows/ci.yml .github/dependabot.yml scripts/setup-dev-tools.sh` exits 0.
- [ ] The guide's placeholder `grep` over `Makefile docker-compose*.yml .devcontainer/* scripts/setup-dev-tools.sh .github/*.yml .github/workflows/*.yml */Dockerfile` prints nothing.
- [ ] `docker compose config --services | sort | paste -sd' '` prints `backend postgres`.
- [ ] With a `.env` holding `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB=whattheflag`, `DB_HOST=localhost` and `make db` running, `make db-migrate` prints `1/u init`.
- [ ] `cd backend && go tool sqlc diff && go build -o /dev/null ./cmd/what-the-flag` exits 0.
- [ ] `grep -c 'github.com/google/uuid' backend/sqlc.yaml` prints `2`.
- [ ] `make check` passes.

## Phase 2: Backend skeleton with database health

**Depends on**: 1

### Context

- `backend/cmd/what-the-flag/main.go — main()` — replaced by the wiring below.
- `backend/internal/db — New(), Queries.GetMeta()` — used by the integration test.
- Choke file for later plans: `main.go`. Every domain adds one `Register(mux)` call there.

### What to build

- `backend/internal/config/config.go — Config, Load(), Config.DatabaseURL()`; test `backend/internal/config/config_test.go — TestLoad` (unit: default port, missing vars named, escaped password).
- `backend/internal/httpx/errors.go — Error, Error.Error(), WriteError()`.
- `backend/internal/httpx/json.go — ReadJSON(), WriteJSON()`.
- `backend/internal/httpx/middleware.go — Chain(), RequestLog(), Recover(), DetectLocale(), LocaleFrom(), CheckOrigin(), RequireJSON(), NotFound()`; type `Locale` with `DE`, `EN`.
- `backend/internal/httpx/httpx_test.go` (unit, `httptest`): envelope with and without `field`; ReadJSON 413/400; RequireJSON 415.
  - CheckOrigin table: GET passes; POST with `Origin` matching `Host` incl. port (`localhost:5173`) passes; other port, foreign host, missing Origin → 403.
  - DetectLocale table (`de-DE`, `en;q=0.9,de;q=0.8`, `fr`, empty); Recover → 500 envelope.
- `backend/internal/postgres/postgres.go — NewPool(ctx, url)` (pgx v5 pool, ping on start).
- `backend/internal/postgres/testpool.go — TestPool()` and `backend/internal/postgres/postgres_integration_test.go — TestFirstMigrationApplied` (integration: `GetMeta` on an unknown key returns `pgx.ErrNoRows`).
- `backend/internal/health/handler.go — Pinger, Handler, NewHandler(), Handler.Register()`; `backend/internal/health/handler_test.go — TestHealth` (unit, fake pinger: 200 body, 503 envelope).
- `backend/cmd/what-the-flag/main.go — main(), run()`: config, slog, pool, mux, middleware, server, graceful shutdown; logs `server stopped` last.
- `backend/go.mod`, `backend/go.sum`: `go mod tidy` after `pgxpool` is imported.

### Acceptance criteria

- [ ] `cd backend && go test ./internal/config -run TestLoad` passes (unit).
- [ ] `cd backend && go test ./internal/httpx` passes (unit).
- [ ] `cd backend && go test ./internal/health -run TestHealth` passes (unit).
- [ ] With `make db` and `make db-migrate` done, `make be-integration` passes; it runs `TestFirstMigrationApplied` (integration).
- [ ] With `make db` and `make be` running, `curl -fsS localhost:8080/api/health` prints `{"status":"ok"}`.
- [ ] With `make be` running, `curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: http://evil.example' localhost:8080/api/health` prints `403`.
- [ ] With `make be` stopped, `docker compose up -d --wait --build --force-recreate backend && docker compose stop backend && docker compose logs backend | grep -c 'server stopped'` prints `1`.
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
- `frontend/src/lib/api.ts — ApiClient, ApiError, createApiClient(), ApiClientProvider, useApiClient()`; test `frontend/src/lib/api.test.ts` (unit, fake `fetch`: headers and JSON body sent, envelope → `ApiError` with `field`, schema mismatch → `invalid_response`, 204 → `undefined`).
- `frontend/src/lib/i18n/locale.tsx — Locale, getLocale(), useLocale(), detectLocale(), LocaleProvider`; `frontend/src/lib/i18n/messages.ts — useMessages()`; test `frontend/src/lib/i18n/locale.test.ts — detectLocale` (unit table, stored value wins).
- `frontend/src/app/providers.tsx — Providers` (QueryClient, LocaleProvider, ApiClientProvider), `frontend/src/app/layout.tsx — Layout`, `frontend/src/app/navbar.tsx — Navbar` (brand, `nav-right` slot with the language switch), `frontend/src/app/footer.tsx — Footer` and `frontend/src/app/messages.ts` (R28 notice), `frontend/src/app/router.tsx — routes, router`.
- `frontend/src/features/landing/landing-page.tsx — LandingPage` (title, tagline, server status), `frontend/src/features/landing/not-found-page.tsx — NotFoundPage`, `frontend/src/features/landing/api.ts — healthSchema, useHealth()`, `frontend/src/features/landing/messages.ts — messages`.
- `frontend/src/test/setup.ts` (jest-dom, cleanup, locale store and storage reset), `frontend/src/test/render.tsx — renderRoute()` (decisions).
- `frontend/src/features/landing/landing-page.test.tsx` (component, `renderRoute` with a fake `fetch`): online text in German; offline text on a 503 envelope; clicking "English" switches text, stores `wtf.locale` and refetches with `Accept-Language: en`; footer shows the notice.
- `frontend/index.html`: `lang="de"`, title "What The Flag", `frontend/public/favicon.svg`.

### Acceptance criteria

- [ ] `pnpm --dir frontend exec vitest run src/lib/api.test.ts` passes (unit).
- [ ] `pnpm --dir frontend exec vitest run src/lib/i18n/locale.test.ts` passes (unit).
- [ ] `pnpm --dir frontend exec vitest run src/features/landing/landing-page.test.tsx` passes (component).
- [ ] Footer notice in German with a link ending in `/NOTICE` (component): `pnpm --dir frontend exec vitest run src/features/landing/landing-page.test.tsx -t footer` passes.
- [ ] `grep -rln 'fetch(' frontend/src | grep -v -e 'src/lib/api' -e '\.test\.'` prints nothing.
- [ ] `make check` passes.

## Phase 4: Production stack, agent files and Verify

**Depends on**: 2, 3

### Context

- Guide sections run: "Copy the production files", "Fill the templates" for the new files, "Set up the agent files", "Verify".
- `docs/prds/prd-rebuild.md` — source of `docs/decisions.md` D01–D15.

### What to build

- `docker-compose.prod.yml`, `.env.example` (edits in decisions), `scripts/prod-init.sh`, `scripts/backup-postgres.sh`, `.github/workflows/release.yml` from the templates, placeholders filled.
- `reverse-proxy/Caddyfile` (`example.com` → `what-the-flag.de`), `reverse-proxy/Dockerfile` (`<node-major>` filled), `reverse-proxy/Dockerfile.dockerignore`.
- `CLAUDE.md` (`@AGENTS.md`). `AGENTS.md`: project in two lines; links to PRD, glossary, decisions; `make` targets table; rules below.
- AGENTS.md rules: UI German + English, files English; UI strings only in a `messages.ts` (a feature's, or `src/app/messages.ts` for the shell); frontend file names kebab-case (R27); backend domain packages with `handler.go`/`service.go`/`store.go`; frontend `features/<name>/`; API only via `lib/api.ts`; `cn()` from `src/lib/utils.ts`; feature tests fake the server only via `renderRoute()`; sqlc output regenerated, never edited; migrations forward-only `.up.sql`; error envelope; locale query keys.
- `docs/README.md` (rows: PRD, glossary, decisions, each with its question), `docs/decisions.md` (D01–D15), `README.md` (name, one-line pitch, `make help`, setup link to the guide), `LICENSE` (MIT). country-data adds the README licence section.

### Acceptance criteria

- [ ] `grep -c example.com reverse-proxy/Caddyfile` prints `0`.
- [ ] `docker build -t what-the-flag-backend:dev backend` exits 0 (in the cloud session through the R29 build route).
- [ ] `docker build -f reverse-proxy/Dockerfile -t what-the-flag-edge:dev .` exits 0 (same route).
- [ ] With `make db`, `make db-migrate`, `make be` and `make fe` running, `curl -fsS localhost:5173/api/health` prints `{"status":"ok"}` (cross-stack tracer).
- [ ] `head -1 CLAUDE.md` prints `@AGENTS.md`, and `head -1 LICENSE` prints `MIT License`.
- [ ] `docker compose -f docker-compose.prod.yml --env-file .env.example config --quiet && echo ok` prints `ok`.
- [ ] `make help` prints the DEVELOPER and PRODUCTION sections.
- [ ] `make check` passes.
