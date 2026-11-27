# Agents

What The Flag is an endless quiz about flags, countries and capitals for `what-the-flag.de`, with a public leaderboard and no accounts.
A Go backend on Postgres serves a React SPA through a Caddy edge.

- Game rules: [docs/game-rules.md](docs/game-rules.md).
- What the game does: [docs/prds/prd-rebuild.md](docs/prds/prd-rebuild.md).
- Domain terms: [docs/UBIQUITOUS_LANGUAGE.md](docs/UBIQUITOUS_LANGUAGE.md).
- Architecture decisions: [docs/decisions.md](docs/decisions.md).

## Make targets

| Target | Does |
| --- | --- |
| `make db` | Starts the Postgres container |
| `make db-migrate` | Applies pending migrations to the `make db` database |
| `make be` | Starts the backend on :8080 |
| `make fe` | Starts the Vite dev server, which proxies `/api` to :8080 |
| `make check` | Runs the backend and frontend gates, as CI does |
| `make be-integration` | Runs the integration tests against the `make db` database |
| `make e2e` | Builds the production stack, serves it with local TLS and runs `scripts/smoke.sh` |
| `make help` | Lists every target, the production ones included |

## Layout

| Path | Holds |
| --- | --- |
| `backend/` | The Go module: `cmd/` binaries, `internal/` domains, sqlc config and queries |
| `frontend/` | The React SPA |
| `database/` | Migrations, `stats.sql` and the `migrate` image |
| `reverse-proxy/` | The Caddyfile and the edge image, which bakes in the SPA |
| `data/` | Vendored country sources, overrides and the data licence |
| `scripts/` | Deploy, backup, e2e stack, smoke and data-fetch scripts |
| `docs/` | Game rules, glossary, decisions, PRD and plans; `docs/README.md` indexes them |

## Rules

### Language

- The UI speaks German and English. Repository files are English.
- UI strings live only in a `messages.ts` built with `defineMessages`: a feature's, or `src/app/messages.ts`.
- A feature maps its own error codes there. Generic codes map in `src/lib/i18n/error-messages.ts`.

### Frontend

- Code lives in `features/<name>/`. File names are kebab-case.
- Components reach the server only through feature API functions over `ApiClient`.
- Feature tests fake the server only via `FakeApi` and `renderRoute()`.

### Backend

- A domain is a pure core in `internal/<domain>/`, with adapters in `internal/<domain>/postgres` and `internal/<domain>/httpapi`.
  A `depguard` rule in `backend/.golangci.yml` keeps HTTP and database imports out of the core. Wiring lives in `internal/app/app.go`.
- Each domain has one sqlc block and `sqlc/queries/<domain>.sql`. Generated code is regenerated, never edited.
- Stores take `DB` (`DBTX` plus `Begin`). A method taking a `pgx.Tx` rejects nil.
- Integration tests carry the `integration` tag, are named `*_integration_test.go` and never truncate.
- A route lands with `internal/contract/<domain>_integration_test.go`.
- The error envelope's `message` is English developer text.

### Database

- Migrations are forward-only `.up.sql` files, each wrapped in `BEGIN; … COMMIT;`.
- Enumerations are `text` with a `CHECK`, never `ENUM`.
