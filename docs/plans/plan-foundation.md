# Plan: Foundation

> Source PRD: docs/prds/prd-rebuild.md

## Goal

Replace the repository content with the handbook Go + React scaffold.
End state: `GET /api/health` reaches Postgres, a Go contract test pins it, and the landing page shows it.
The new-project guide's Verify section passes. Every later plan builds on this tree.

## Architectural decisions

### Scaffold and environment

Inputs to `<handbook>/guides/new-project.md` (`<handbook>` = the handbook clone, `/home/user/handbook` in cloud sessions):

| Input | Value |
| --- | --- |
| `<project-name>` / `<github-owner>` / `<database-name>` / `<domain>` | `what-the-flag` / `nicograef` / `whattheflag` / `what-the-flag.de` |
| `<project-go-version>` | `curl -fsS 'https://go.dev/dl/?mode=json' \| jq -r '.[0].version'`, without the `go` prefix |
| `<node-major>` | major of `curl -fsS https://nodejs.org/dist/index.json \| jq -r '[.[] \| select(.lts != false)][0].version'` |
| pnpm | `npm view pnpm version`, installed with `npm install -g pnpm@<that>` before `pnpm create vite` |
| `<other-stacks>` | `python` |

- **Toolchain**: the container ships Go 1.24 and Node 22. `GOTOOLCHAIN=auto` fetches `go<project-go-version>` through the module proxy once `go.mod` names it.
  Node: fetch `https://nodejs.org/dist/<version>/node-<version>-linux-x64.tar.xz`, check it against that directory's `SHASUMS256.txt` and extract it to `~/.local/node`, first on `PATH`.
- **Node pin**: one root `.node-version`. `ci.yml` jobs `frontend-ci` and `security-node` read it via `node-version-file: .node-version`.
- **Docker**: the container's `dockerd` is stopped. Run `dockerd &` and wait until `docker info` exits 0, before `make db` or a build. **Image builds** in the cloud session use `--network host` and the CA `/root/.ccr/ca-bundle.crt` per `/root/.ccr/README.md`. The CA comes from build args or the gitignored `docker-compose.local.yml`; committed Dockerfiles stay template-clean. No step relies on `nico` plugin scripts or `~/.claude/*` scripts. CI's `pull_request` trigger stays commented, as in the template.

### Backend

- **Error envelope**: `{"error": {"code", "message", "field"?}}`, codes snake_case. `message` is a short English developer text, never shown to users.
  Foundation codes: `invalid_json` 400, `origin_mismatch` 403, `not_found` 404, `body_too_large` 413, `unsupported_media_type` 415, `internal` 500, `database_unavailable` 503.
- **Health**: `GET /api/health` pings the pool with a 2 s timeout. 200 `{"status":"ok"}`, else 503 `database_unavailable`. `ReadJSON` caps a body at 1 MiB and rejects unknown fields and trailing data.
- **Unsafe methods** (POST, PUT, PATCH, DELETE) pass two middlewares, so body-less requests obey the PRD's JSON and `Origin` rule too.
  `CheckOrigin`: the host:port of the `Origin` URL must equal `Host`, case-insensitive; missing or unparsable counts as mismatch. `RequireJSON`: media type `application/json`, else 415.
- **Middleware order** (outer → inner): `RequestID`, `RequestLog`, `Recover`, `CheckOrigin`, `RequireJSON`, mux. The `/api/` catch-all answers `not_found`.
  Nothing reads `Accept-Language`: localised texts travel as `{"de": "…", "en": "…"}`.
- **Server**: `log/slog` JSON to stdout on `:$APP_PORT` (default 8080). `ReadHeaderTimeout` 5 s, `ReadTimeout` 10 s, `WriteTimeout` 15 s, `IdleTimeout` 120 s.
  SIGINT or SIGTERM → `Shutdown` with 10 s, then the pool closes. `server stopped` is the last log line. `config.Load(getenv)` requires `DB_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`. `DatabaseURL()` uses port 5432, `sslmode=disable`, escaped credentials.
- **Wiring**: `main.go` loads config, opens the pool and serves `app.New(deps)`. `app.New` builds the mux, registers each domain and wraps the middleware. Later plans add a `Deps` field and one `Register(mux)` call in `backend/internal/app/app.go`; quiz adds `country.Load()` there.

| Package | Signatures |
| --- | --- |
| `httpx` errors | `type Error struct { Status int; Code, Message, Field string }`; `func WriteError(w http.ResponseWriter, r *http.Request, err error)`: an `*Error` (`errors.As`) as-is, else logged via `Logger(ctx)` and 500 `internal` |
| | `type ErrorCode struct { Err error; Status int; Code, Field string }`; `func MapError(w, r, err error, table []ErrorCode)`: first `errors.Is` match wins, else `WriteError` (jotti `api/helper/http.go — MapError`) |
| `httpx` | `func WriteJSON(w http.ResponseWriter, status int, v any)`; `func ReadJSON(w http.ResponseWriter, r *http.Request, dst any) error` (returns `*Error`); `func Logger(ctx context.Context) *slog.Logger` (carries `request_id`); `func Chain(h http.Handler, mw ...func(http.Handler) http.Handler) http.Handler` (first is outermost); `RequestID(base *slog.Logger)` returns a middleware |
| `postgres` | `func NewPool(ctx context.Context, url string) (*pgxpool.Pool, error)`, pinging via `PingWithRetry` for up to 30 s (jotti `db/db.go`); `func TestPool(t testing.TB) *pgxpool.Pool`; `func TestTx(t testing.TB) pgx.Tx` (rolled back in `t.Cleanup`) |
| `health`, `app` | `type Pinger interface { Ping(context.Context) error }`; `func NewHandler(p Pinger) *Handler`; `func (h *Handler) Register(mux *http.ServeMux)`; `type Deps struct { Pool *pgxpool.Pool; Log *slog.Logger }`; `func New(d Deps) http.Handler` |

### Backend tests and data access

- **Integration tests** start with `//go:build integration` and end in `_integration_test.go`. Packages run in parallel on one database.
  Tests never truncate; each creates its own rows. Tests of global aggregates use `TestTx`. `backend/internal/postgres/testpool.go` carries the tag but is no test file, so other packages import it. `TestPool` builds the pool via `config.Load(os.Getenv)`; missing env fails, never skips.
- **Stores** declare `DB`: sqlc's `DBTX` plus `Begin(ctx) (pgx.Tx, error)`. A pool and `postgres.TestTx(t)` both meet it.
- **Contract harness** (`backend/internal/contract/harness_integration_test.go`), on the real handler chain. Every route-adding phase adds `backend/internal/contract/<domain>_integration_test.go`.
  - `newServer(t)` starts `httptest.NewTLSServer(app.New(...))` on `postgres.TestPool(t)`. TLS is needed because Go's `cookiejar` sends a `Secure` cookie only over https.
  - `newClient(t, srv)` copies `srv.Client()` with its own `cookiejar` and a random `X-Forwarded-For` in `2001:db8::/32`, one /64 per client. Unsafe methods send `Origin: <srv.URL>` (the https URL), `Content-Type: application/json` and a JSON body (`{}` when none).
  - `decode[T](t, resp, status)` checks the status and decodes strictly (`DisallowUnknownFields`, no trailing data), which pins the wire shape. `expectError(t, resp, status, code)` does the same for the envelope and wants a non-empty `message`.
    A domain file holds one happy path per route plus each route-specific error code. Middleware rules stay in `httpx` unit tests.
- **sqlc**: `backend/sqlc.yaml` holds one `sql:` block per domain, all reading `../database/migrations`. No shared `backend/internal/db/`.
  - sqlc v1.31.1 rejects a config without a block and a block without a query. So the guide's `GetMeta` stays, as block `postgres`. Block `postgres`: `queries: sqlc/queries/postgres.sql`, `out: internal/postgres/internal/db`, caller `TestTxRollsBack`. It defines YAML anchors `&block` and `&go`. A domain block is `- <<: *block`, its own `queries`, and `gen: {go: {<<: *go, out: internal/<domain>/internal/db}}`. sqlc v1.31.1 accepts these merge keys.
  - Options: `sql_package: pgx/v5`, `emit_pointers_for_null_types: true`, `emit_empty_slices: true`. Overrides: `uuid` → `github.com/google/uuid.UUID`, `timestamptz` → `time.Time`. Their nullable forms map to pointers via `go_type: {import, type, pointer: true}`. Re-check names against https://docs.sqlc.dev/en/latest/reference/config.html at execution.
- **Migrations**: `000001_init.up.sql` creates `app_meta`, wrapped in `BEGIN; … COMMIT;`. Production migrations belong to plan-first-release. **golangci**: drop the forbidigo `forbid` placeholder, so forbidigo applies its default. Add `exhaustive` with `default-signifies-exhaustive: false`.
- **Makefile**: `-include .env` plus `export`, so `make check` runs without `.env`. `MIGRATE_VERSION` is read from `.github/workflows/ci.yml` (one pin). `db-migrate` runs `migrate/migrate:$(MIGRATE_VERSION)` on network `what-the-flag-dev_default` against host `postgres` (`reference/postgresql.md`). `be-integration` runs `go test -tags=integration -race ./...` in `backend/`.
- **Dev Compose**: `postgres` (template block plus the prod `pg_isready` healthcheck) and `backend` (build `./backend`, `POSTGRES_*` from `.env`). `backend` sets `DB_HOST: postgres`, publishes `127.0.0.1:8080:8080` and waits for a healthy `postgres`. The template `app` service goes.

### Frontend

- **API client** (`frontend/src/lib/api.ts`): `interface ApiClient { get<T>(path: string, schema: z.ZodType<T>): Promise<T>; post, patch, delete: <T>(path: string, schema: z.ZodType<T>, body?: unknown) => Promise<T> }`.
  - `createApiClient(deps: { fetch: typeof fetch }): ApiClient`; `ApiClientProvider({ client, children })`; `useApiClient(): ApiClient`. `class ApiError extends Error { status: number; code: string; field?: string }`; client-side codes `network`, `invalid_response`.
  - Every request sends `credentials: "same-origin"`. Unsafe methods send `Content-Type: application/json` and a JSON body (`{}` when none). A 204 parses `undefined` (`z.undefined()`).
  - Feature API shape: `features/<name>/api.ts` holds plain functions `(api: ApiClient, …args) => Promise<T>`, plus hooks that call `useApiClient()`.
- **Query client**: `frontend/src/lib/query-client.ts — createQueryClient()` serves `Providers` and `renderRoute`. Queries retry only `network` and status ≥ 500, at most twice; mutations never.
- **Error messages**: `frontend/src/lib/i18n/error-messages.ts — errorMessage(err, locale)` maps the foundation codes, `network` and `invalid_response`, with a fallback. A feature maps only its own codes.
- **i18n** (`frontend/src/lib/i18n/`): `type Locale = "de" | "en"`; `locale.tsx — getLocale(), useLocale(): { locale, setLocale }, detectLocale(), LocaleProvider`.
  - `messages.ts — defineMessages<T>(m: { de: T; en: NoInfer<T> }), useMessages(m)`. `NoInfer` checks `en` against the shape of `de`.
  - A module store read with `useSyncExternalStore` holds the locale. `setLocale` writes it and `wtf.locale` (storage in try/catch). `LocaleProvider` syncs `<html lang>`. A switch re-renders and refetches nothing; query keys carry no locale.
- **Test seam**: `frontend/src/test/fake-api.ts — FakeApi` with `respond(route, body | fn, status?)`, `fail(route, status, code, field?)`, `calls` and `fetch`. A route reads `"GET /api/health"`. An unknown route rejects loudly. `GET /api/me` answers 401 `unauthenticated` by default.
  - `frontend/src/test/render.tsx — renderRoute(path, { api: FakeApi; locale?: Locale })` renders `routes` in a memory router inside `Providers`. It builds the real `createApiClient({ fetch: api.fetch })`.
  - `frontend/src/test/setup.ts`: jest-dom, cleanup, locale store and storage reset, jsdom polyfills for Radix (`matchMedia`, `ResizeObserver`, pointer capture, `scrollIntoView`).
- **cn**: `frontend/src/lib/utils.ts` re-exports `cn` from the `cn` package (handbook default), so shadcn components keep importing `@/lib/utils`. **Router**: `react-router` data router; `src/app/router.tsx` exports `routes` and `router`. File names under `frontend/src/` are kebab-case. Alias `@/*` → `src/*`, without `baseUrl`.
- **Navbar**: `frontend/src/app/navbar.tsx — Navbar` renders the brand left and `<div data-slot="nav-right">` with the switch "Deutsch"/"English" (with `lang`). Later plans add links there.
- **Footer**: `frontend/src/app/footer.tsx — Footer` in `Layout` on every page, text from `frontend/src/app/messages.ts`. It links to `https://github.com/nicograef/what-the-flag/blob/main/NOTICE` (added by country-data). de: "Länderdaten: mledoze/countries (ODbL 1.0), Wikidata, Unicode CLDR; Flaggen: flag-icons (MIT)". En: "Country data: mledoze/countries (ODbL 1.0), Wikidata, Unicode CLDR; Flags: flag-icons (MIT)".

### Repository files

- **`LICENSE`**: MIT, `Copyright (c) 2022 Nico Gräf` (first commit and author of the deleted `package.json`). **`.env.example`**: the template with `POSTGRES_DB=whattheflag`. The `APP_ENV` and `JWT_SECRET` lines go, since nothing reads them. The "Add a test" sentence goes too.
- **`docs/decisions.md`**: only decisions the PRD lacks, as `- Dnn: <decision>. <reason>.`, no file paths. Process rules stay in `programme.md` § Rulings.

| Line | Decision | Reason |
| --- | --- | --- |
| D01 | The Origin check compares the `Origin` host and port with the `Host` header; there is no allow-list | Caddy and the Vite proxy keep `Host`, so no setting is needed |
| D02 | The flag key is a reversible hash of the code, obfuscation only | The server clock is the anti-cheat, so a cheap scheme suffices |
| D03 | UI texts are typed `{de, en}` message objects; no i18n library | Two fixed languages and a few hundred strings need no extraction or ICU tooling |
| D04 | The API sends `{de, en}` texts and never negotiates language | A switch re-renders without a request, and query keys carry no locale |
| D05 | Contract tests are Go HTTP tests on the real handler chain; no OpenAPI document | The only client ships in the same release, so a document has no reader |
| D06 | Each domain has its own sqlc package inside its internal tree | Go's internal rule stops one module from calling another module's queries |
| D07 | Stores take sqlc's DBTX plus Begin, not a pool; integration tests never truncate | Aggregate tests run in a rolled-back transaction, so parallel packages share one database |
| D08 | A method that takes a transaction rejects a nil one | A silent second transaction would break the caller's atomicity |

## Inventory

- `<handbook>/guides/new-project.md` — every scaffold command; its Verify is the final acceptance. `<handbook>/templates/*` — copied files; edits listed per phase.
- `<handbook>/reference/stack-conventions.md` — Package scripts, React and Go layout. `<handbook>/reference/postgresql.md` — migrate container form. `https://ui.shadcn.com/docs/installation/vite` — read at execution.
- `<jotti>` = `/home/user/nicograef/jotti`, ported patterns: `backend/api/helper/http.go — MapError()`, `backend/db/db.go — PingWithRetry()`, `backend/internal/logging — FromContext()`, `frontend/src/test/FakeBackend.ts — FakeBackend`, `frontend/src/lib/queryClient.ts — createQueryClient()`, `frontend/src/lib/errorMessages.ts`, `frontend/src/test/setup.ts`.
- Repository files deleted: `client/`, `server/`, `nginx-conf/`, `package.json`, `Dockerfile`, `Procfile`, `docker-compose.yml`, `.dockerignore`, `.gitignore`, `README.md`, `.github/workflows/challenge-of-the-week-cronjob.yml`.

## Open questions / Risks

- **TypeScript 7** may reject create-vite or shadcn tsconfig options (`baseUrl`, deprecated flags). Fix the tsconfig, never pin TS lower.
- **oxlint `--deny-warnings`** may flag shadcn files (`react-refresh/only-export-components`). Add an `.oxlintrc.json` override scoped to `src/components/ui/**`.
- `govulncheck` and `pnpm audit` need network. A proxy refusal is an environment block, not a pass. Repository hardening and GHCR visibility are owner steps in `programme.md` § Owner items.

## Phase 1: Clean slate and handbook scaffold

**Depends on**: none

### Context
- Deleted: every path in the Inventory's "Repository files deleted" line. Kept: `.git/`, `docs/prds/`, `docs/UBIQUITOUS_LANGUAGE.md`, `docs/plans/`.
- Toolchain first: Node tarball, pnpm via npm, Go via `GOTOOLCHAIN=auto` after `go mod edit -go=<project-go-version>`. Then `dockerd &`.
  Guide sections in order: `Copy the base files`, `Scaffold the stack` (Go and React lines), `Set up the toolchain` step 1, `Fill the templates`. A local `.env` (gitignored) holds `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB=whattheflag`, `DB_HOST=localhost`.

### What to build
- Base: `.editorconfig`, `.gitignore` (plus `docker-compose.local.yml`), `.vscode/settings.json`, `scripts/make-help.awk`, `.claude/settings.json` from the templates.
- `Makefile`: Go blocks uncommented, python blocks deleted, `-include .env` + `export`, `MIGRATE_VERSION`, targets `db-migrate` and `be-integration`.
- `.node-version` at the root (`<node-major>`), read by `.github/workflows/ci.yml`. `docker-compose.yml`: `postgres`, `volumes`, healthcheck and `backend` (decisions).
- `.devcontainer/devcontainer.json`: Go, Node and Docker-in-Docker features, Go, oxc and Prettier extensions uncommented. `.github/workflows/ci.yml`, `.github/dependabot.yml`, `scripts/setup-dev-tools.sh`: python blocks deleted, placeholders filled by the guide's sed.
- `backend/go.mod`, `backend/go.sum` (tools goimports, sqlc, govulncheck; `github.com/jackc/pgx/v5`), `backend/Dockerfile`, `backend/.dockerignore`, `backend/.golangci.yml`, `backend/sqlc.yaml` (decisions).
- `backend/cmd/what-the-flag/main.go` (guide's health server), `backend/sqlc/queries/postgres.sql — GetMeta`, generated `backend/internal/postgres/internal/db/`, `database/migrations/000001_init.up.sql`.
- `frontend/` from `pnpm create vite frontend --template react-ts --no-interactive`, then `packageManager`, the Package scripts block, `frontend/.prettierignore`, `pnpm run format`.

### Acceptance criteria
- [x] `[ "$(cd backend && go env GOVERSION)" = "go$(cd backend && go mod edit -json | jq -r .Go)" ] && [ "$(node --version | cut -d. -f1)" = "v$(cat .node-version)" ]` exits 0.
- [x] `test -z "$(git ls-files client server nginx-conf package.json Dockerfile Procfile .dockerignore .github/workflows/challenge-of-the-week-cronjob.yml)"` exits 0.
- [x] `! grep -nE 'stack: python|^[^#]*<[a-z][a-z-]+>' Makefile docker-compose.yml .devcontainer/* scripts/setup-dev-tools.sh .github/*.yml .github/workflows/*.yml backend/Dockerfile` exits 0.
- [x] `make help | grep -q be-integration && ! make help | grep -q UNCLASSIFIED` exits 0.
- [x] `test "$(docker compose config --services | sort | paste -sd' ')" = 'backend postgres'` exits 0.
- [x] With `make db` running: `make db-migrate && test "$(docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT version, dirty FROM schema_migrations"')" = '1|f'` exits 0.
- [x] `make check` passes.

## Phase 2: Backend skeleton, database health and contract harness

**Depends on**: 1

### Context
- `backend/cmd/what-the-flag/main.go — main()` — replaced by the wiring below. `backend/internal/postgres/internal/db — Queries.GetMeta()` — read by `TestTxRollsBack`. Choke file for later plans: `backend/internal/app/app.go`. Every domain adds a `Deps` field and one `Register(mux)` call there.
- Integration tests need `dockerd`, `make db` and `make db-migrate`.

### What to build
- `backend/internal/config/config.go — Config, Load(), Config.DatabaseURL()`; `backend/internal/config/config_test.go — TestLoad` (unit: default port, missing vars named, escaped password).
- `backend/internal/httpx/errors.go — Error, WriteError(), ErrorCode, MapError()`; `backend/internal/httpx/json.go — ReadJSON(), WriteJSON()`;
  `backend/internal/httpx/middleware.go — Chain(), RequestID(), Logger(), RequestLog(), Recover(), CheckOrigin(), RequireJSON(), NotFound()`.
- `backend/internal/httpx/httpx_test.go` (unit, `httptest`), the only home of the middleware rules:
  - `TestReadJSON`: 413 over 1 MiB, 400 on an unknown field and on trailing data. `TestWriteError`: envelope with and without `field`; a 500 log line carries `request_id`.
  - `TestMapError`: first match wins, no match → 500. `TestRecover`: panic → 500 envelope. `TestRequireJSON`: `text/plain` → 415. `TestCheckOrigin` table: GET passes; POST with `Origin` matching `Host` incl. port (`localhost:5173`) passes; other port, foreign host, missing → 403.
- `backend/internal/postgres/postgres.go — NewPool(), PingWithRetry()`; `backend/internal/postgres/postgres_test.go — TestPingWithRetry` (unit: retry then success, budget spent, ctx done).
- `backend/internal/postgres/testpool.go — TestPool(), TestTx()`; `backend/internal/postgres/postgres_integration_test.go — TestTxRollsBack`: a subtest inserts an `app_meta` row on `TestTx`; afterwards `GetMeta` on `TestPool` returns `pgx.ErrNoRows`.
- `backend/internal/health/handler.go — Pinger, Handler, NewHandler(), Handler.Register()`; `backend/internal/health/handler_test.go — TestHandlerUnavailable` (unit, failing pinger → 503).
- `backend/internal/app/app.go — Deps, New()`: mux, health, `/api/` catch-all, middleware chain. `backend/cmd/what-the-flag/main.go — main(), run()`: config, slog, pool, `app.New`, server, shutdown.
- `backend/internal/contract/harness_integration_test.go — newServer(), newClient(), decode(), expectError()` (decisions); `backend/internal/contract/health_integration_test.go — TestHealth` (200 `{"status":"ok"}`), `TestUnknownRoute` (`GET /api/nope` → 404 `not_found`). `go mod tidy`.

### Acceptance criteria
- [x] `test "$(cd backend && go test -v -run '^(TestReadJSON|TestWriteError|TestMapError|TestRecover|TestRequireJSON|TestCheckOrigin)$' ./internal/httpx | grep -c '^--- PASS')" -eq 6` exits 0.
- [x] With `make db` and `make db-migrate` done: `set -a && . ./.env && set +a && test "$(cd backend && go test -tags=integration -v -run '^(TestHealth|TestUnknownRoute|TestTxRollsBack)$' ./internal/contract ./internal/postgres | grep -c '^--- PASS')" -eq 3` exits 0.
- [x] With `make db` and `make be` running: `test "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: http://evil.example' localhost:8080/api/health)" = 403` exits 0.
- [x] With `make db` running: `set -a && . ./.env && set +a && cd backend && go build -o /tmp/wtf ./cmd/what-the-flag && (APP_PORT=18080 /tmp/wtf >/tmp/wtf.log 2>&1 & p=$!; curl -fsS --retry 15 --retry-connrefused --retry-delay 1 -o /dev/null localhost:18080/api/health; c=$?; kill -TERM $p; wait $p && [ $c = 0 ]) && tail -1 /tmp/wtf.log | grep -q 'server stopped'` exits 0.
- [x] `make check` passes.

## Phase 3: Frontend shell with landing tracer

**Depends on**: 2

### Context
- Edited: `frontend/src/main.tsx`, `frontend/index.html`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/package.json`, `frontend/pnpm-lock.yaml`.
- Deleted template files: `frontend/src/App.tsx`, `frontend/src/App.css`, `frontend/src/assets/`, `frontend/public/vite.svg`. Choke file for later plans: `frontend/src/app/router.tsx`.

### What to build
- Tailwind + shadcn/ui per the current Vite install docs: `frontend/src/index.css`, `frontend/components.json`, `frontend/src/components/ui/button.tsx` (`shadcn add button`).
  `frontend/src/lib/utils.ts`: `export { cn } from 'cn'`; `clsx` and `tailwind-merge` removed when nothing else imports them.
- Dependencies (latest, `pnpm add`): `@tanstack/react-query`, `react-router`, `zod`, `cn`; dev: `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `@testing-library/jest-dom`.
  `frontend/vite.config.ts`: tailwind plugin, `@` alias, `server.proxy` `/api` → `http://localhost:8080` (`changeOrigin` off), `test` block (`jsdom`, `setupFiles: ./src/test/setup.ts`).
- `frontend/src/lib/api.ts — ApiClient, ApiError, createApiClient(), ApiClientProvider, useApiClient()`;
  `frontend/src/lib/api.test.ts` (unit, `FakeApi`): credentials and JSON body sent, envelope → `ApiError` with `field`, schema mismatch → `invalid_response`, rejected fetch → `network`, 204 → `undefined`.
- `frontend/src/lib/query-client.ts — createQueryClient()`; `frontend/src/lib/query-client.test.ts` (unit table: `network` and 503 retried, 404 and `invalid_response` not, a third failure not).
- `frontend/src/lib/i18n/locale.tsx — Locale, getLocale(), useLocale(), detectLocale(), LocaleProvider`; `frontend/src/lib/i18n/messages.ts — defineMessages(), useMessages()`;
  `frontend/src/lib/i18n/locale.test.ts — detectLocale` (unit table: stored value wins, `de-AT` → `de`, `fr` → `en`); `frontend/src/lib/i18n/error-messages.ts — errorMessage()`.
- `frontend/src/app/providers.tsx — Providers` (`createQueryClient()`, `LocaleProvider`, `ApiClientProvider`), `frontend/src/app/layout.tsx — Layout`, `frontend/src/app/navbar.tsx — Navbar`,
  `frontend/src/app/footer.tsx — Footer`, `frontend/src/app/messages.ts`, `frontend/src/app/router.tsx — routes, router`.
- `frontend/src/features/landing/landing-page.tsx — LandingPage` (title, tagline, server status), `frontend/src/features/landing/not-found-page.tsx — NotFoundPage`,
  `frontend/src/features/landing/api.ts — healthSchema, getHealth(), useHealth()`, `frontend/src/features/landing/messages.ts — messages`.
- `frontend/src/test/fake-api.ts — FakeApi`, `frontend/src/test/render.tsx — renderRoute()`, `frontend/src/test/setup.ts` (decisions); `frontend/src/features/landing/landing-page.test.tsx` (component, `renderRoute`): German online text. A 503 `database_unavailable` shows the `errorMessage` text. An unknown path shows `NotFoundPage`.
  Clicking "English" switches the text and stores `wtf.locale`, with no second health request. The footer links to `/NOTICE`.
- `frontend/index.html`: `lang="de"`, title "What The Flag", `frontend/public/favicon.svg`.

### Acceptance criteria
- [x] `cd frontend && ls src/lib/api.test.ts src/lib/query-client.test.ts src/lib/i18n/locale.test.ts src/features/landing/landing-page.test.tsx && pnpm exec vitest run src/lib src/features/landing` exits 0.
- [x] `! grep -rl 'fetch(' frontend/src --exclude-dir=test --exclude='*.test.*' | grep -v '^frontend/src/lib/api.ts$'` exits 0.
- [x] `! grep -rniE 'accept-language' backend frontend/src` exits 0.
- [x] With `make db`, `make db-migrate`, `make be` and `make fe` running: `test "$(curl -fsS localhost:5173/api/health)" = '{"status":"ok"}'` exits 0.
- [x] `make check` passes.

## Phase 4: Production files, agent files and decisions

**Depends on**: 3

### Context
- Guide sections: `Copy the production files`, `Fill the templates` for the new files, `Set up the agent files`, `Verify`. Image builds run through the cloud-session build route (decisions). `docs/prds/prd-rebuild.md` — what `docs/decisions.md` must not repeat.

### What to build
- From the templates, placeholders filled: `docker-compose.prod.yml`, `.env.example` (decisions), `scripts/prod-init.sh`, `scripts/backup-postgres.sh`, `.github/workflows/release.yml`. No migrate step, no `make e2e`, `scripts/e2e-stack.sh` or `docker-compose.e2e.yml`: plan-first-release adds them.
- `reverse-proxy/Caddyfile` (`example.com` → `what-the-flag.de`), `reverse-proxy/Dockerfile` (`<node-major>` filled), `reverse-proxy/Dockerfile.dockerignore`.
- `CLAUDE.md` (`@AGENTS.md`). `AGENTS.md`: the project in two lines; links to PRD, glossary and decisions; a `make` targets table; these rules:
  - UI German and English; repository files English. UI strings live only in a `messages.ts` built with `defineMessages` (a feature's, or `src/app/messages.ts`). A feature maps its own error codes there; generic codes map in `src/lib/i18n/error-messages.ts`.
  - Frontend: `features/<name>/`, kebab-case file names, server access only through feature API functions over `ApiClient`. Feature tests fake the server only via `FakeApi` and `renderRoute()`.
  - Backend: `internal/<domain>/{handler,service,store}.go`, wiring in `internal/app/app.go`. One sqlc block and `sqlc/queries/<domain>.sql` per domain; generated code is regenerated, never edited.
  - Stores take `DB` (`DBTX` plus `Begin`); a method taking a `pgx.Tx` rejects nil. Integration tests carry the `integration` tag, are named `*_integration_test.go` and never truncate. A route lands with `internal/contract/<domain>_integration_test.go`.
  - Migrations are forward-only `.up.sql`, each wrapped in `BEGIN; … COMMIT;`. Enumerations are `text` + `CHECK`, never `ENUM`. The error envelope's `message` is English developer text.
- `docs/README.md` (rows: PRD, glossary, decisions, each with its question), `docs/decisions.md` (D01–D08), `README.md` (name, pitch, `make help`, setup link to the guide), `LICENSE`. country-data adds the README licence section.

### Acceptance criteria
- [x] `! grep -q example.com reverse-proxy/Caddyfile` exits 0.
- [x] `docker build -t what-the-flag-backend:dev backend` exits 0 (cloud session: through the build route).
- [x] `docker build -f reverse-proxy/Dockerfile -t what-the-flag-edge:dev .` exits 0 (same route).
- [x] `docker compose -f docker-compose.prod.yml --env-file .env.example config --quiet` exits 0.
- [x] `[ "$(head -1 CLAUDE.md)" = "@AGENTS.md" ] && [ "$(head -1 LICENSE)" = "MIT License" ]` exits 0.
- [x] `test "$(grep -c '^- D[0-9][0-9]: ' docs/decisions.md)" -eq 8` exits 0.
- [x] `make check` passes.
