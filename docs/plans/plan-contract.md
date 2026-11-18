# Plan: API contract suite

> Source PRD: docs/prds/prd-rebuild.md (Testing Decisions, HTTP contract)

## Goal

`contract/` pins the HTTP API: an OpenAPI 3.1 document and black-box tests against a running backend and a real Postgres.
Every response a test receives must match the document. CI job `contract` runs the suite on every backend change.
Feature plans add each route to the document and its cases to `contract/tests/<domain>.test.ts` in the phase that adds the route.

## Architectural decisions

| Topic | Decision |
| --- | --- |
| Package | `contract/` is its own pnpm package with its own `contract/pnpm-lock.yaml`. No pnpm workspace: `frontend/` and its lockfile stay untouched, and each CI job installs one package |
| Node and pnpm pins | No second `.node-version`: CI reads `frontend/.node-version`. `contract/package.json — packageManager` equals frontend's exact `pnpm@<version>` (criterion) |
| Tools and scripts | TypeScript per the stack-conventions Node block (`noEmit`, `module: nodenext`, `erasableSyntaxOnly`, `strict`). Dev tools and scripts exactly as its "Package scripts" block, `build` excepted (nothing to build) |
| Doc lint | Script `lint:openapi` = `redocly lint --extends=minimal openapi.yaml`. `@redocly/cli` version from `pnpm view @redocly/cli version`; flags per https://redocly.com/docs/cli/commands/lint at execution |
| Suite vs gate | `pnpm run test` (`vitest run --passWithNoTests`) is the suite and needs a running backend. `make check` runs only `contract-check`: frozen install, `format:check`, `lint`, `lint:openapi`, `typecheck` |
| Base URL | `CONTRACT_BASE_URL`, default `http://localhost:8080`, read once in `contract/src/env.ts`. `.env.example` gains `# CONTRACT_BASE_URL=http://localhost:8080` |
| Database | `pg` pool from `DB_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, port 5432: the names the backend reads. Only `correctOption()` uses it |
| Document | `contract/openapi.yaml`, `openapi: 3.1.0`. Paths are written in full (`/api/health`), without a `servers` prefix, so a path equals its URL. Nullable fields use `type: [<t>, "null"]` |
| Shared parts | `components.schemas.Error` is the envelope `{"error": {"code", "message", "field"?}}`. `components.responses` hold `InvalidJson` 400, `OriginMismatch` 403, `NotFound` 404, `BodyTooLarge` 413, `UnsupportedMediaType` 415, `Internal` 500 |
| Validation rule | `contract/src/openapi.ts — validateResponse(method, path, status, body)`. A matched operation must list `status`, and `body` must match that response's schema. An unmatched path or method must answer 4xx with an `Error` body. A mismatch throws with the validator's messages |
| Effect of the rule | A route missing from the document fails on its first 2xx. A phase cannot add a route without its document entry |
| Validator library | Chosen at execution. Candidates in order: `openapi-backend` (`OpenAPIBackend — validateResponse()`), then Ajv's `ajv/dist/2020` over the dereferenced document. Take the first whose official docs state OpenAPI 3.1 support and whose `pnpm view <pkg> time.modified` lies within 12 months. `docs/decisions.md` records the pick |
| Client | `contract/src/client.ts — newClient(): Client`, one per simulated user. `get`, `post`, `patch`, `delete(path, body?)` return `{ status, headers, body }` after `validateResponse()` |
| Client headers | Unsafe methods send `Origin: <origin of CONTRACT_BASE_URL>`, `Content-Type: application/json` and a JSON body (`{}` when none), as `frontend/src/lib/api.ts` does. `raw(method, path, init)` sends exactly the given headers, for the Origin and JSON rules; it validates too |
| Cookie jar | A `Map` of name → value per client, filled from `Headers.getSetCookie()`; `Max-Age=0` deletes. The jar ignores `Secure` and `__Host-` rules: Node is no browser. Browser cookie behaviour stays with accounts' manual check and the browser test |
| Rate limits | accounts limits per client address and trusts `X-Forwarded-For` from a loopback peer. Each client sends `X-Forwarded-For: 2001:db8:<hex4>:<hex4>::1`, a random /64 of the documentation prefix, so simulated users never share a bucket. A rate-limit case pins one address itself |
| `registerUser()` | `contract/src/users.ts — registerUser(): Promise<{ client, username, password, user }>`. Username `c_` plus 10 base36 chars, password 16 random chars, `POST /api/accounts`, asserts 201 and the session cookie |
| `correctOption()` | `contract/src/db.ts — correctOption(roundId: string, position: number): Promise<number>`: `SELECT q.correct_index FROM rounds r JOIN questions q ON q.set_id = r.set_id WHERE r.id = $1 AND q.position = $2`. No row throws. Columns per plan-quiz-practice's schema |
| Clock | Timeouts are not contract-tested (PRD); quiz service tests pin them. Tests answer as soon as a question is served |
| Isolation | Tests never truncate. Each creates its own users and rounds, so test files run in parallel and repeat runs pass |
| Makefile | `CONTRACT_DIR ?= contract`. `contract: ## Run the API contract suite against a running backend (CONTRACT_BASE_URL)`. `contract-check: ## Contract package: install, format, lint, OpenAPI lint, types`, a prerequisite of `check`. Both join `CLASS_developer` |
| CI | Job `contract` in `.github/workflows/ci.yml`, filter `contract`: `backend/**`, `database/**`, `contract/**`, `.github/workflows/ci.yml`. It mirrors `contract-check`, then runs the suite (phase 2) |
| Ownership (R21, R30) | This plan edits `Makefile` and `.github/workflows/ci.yml` in its wave. It owns `contract/` and creates `contract/openapi.yaml`, a choke file every route-adding phase edits |

## Inventory

- `backend/internal/httpx — CheckOrigin(), RequireJSON(), NotFound(), WriteError()`, `backend/internal/health — Handler` (foundation) — the phase 1 behaviour under test.
- `frontend/package.json — packageManager`, `frontend/.node-version`, `frontend/src/lib/api.ts — createApiClient()` (foundation) — pins and the header rules the client copies.
- `Makefile — check, CLASS_developer`, `.github/workflows/ci.yml — changes, backend-integration-tests` (foundation) — targets and the job this plan copies steps from.
- `<handbook>/reference/stack-conventions.md` — Node/TypeScript section, Package scripts block.
- plan-quiz-practice "Schema" (`rounds`, `questions`) and plan-accounts `POST /api/accounts` — inputs of the helpers.

## Open questions / Risks

- **Shared dev database.** Contract rows pile up in a lane's database. Practice clean-up removes practice sets after 7 days; `make db` with a fresh volume resets the rest.
- **Validator gaps.** If no candidate validates 3.1 `type` arrays, Ajv 2020 over the dereferenced document is the fallback; it needs no OpenAPI support of its own.
- **Workspace alternative.** A root pnpm workspace would share one lockfile with `frontend/`. Rejected: it rewrites foundation's frontend pins and CI cache paths for one small package.

## Phase 1: Package, document and HTTP rules

**Depends on**: none

### Context

- `backend/internal/httpx`, `backend/internal/health` — see Inventory.
- `frontend/package.json`, `frontend/.node-version` — pins to copy.
- `Makefile`, `.env.example`, `docs/decisions.md` — edited.

### What to build

- `contract/package.json` (`private`, `"type": "module"`, `packageManager`, scripts per decisions plus `lint:openapi`), `contract/pnpm-lock.yaml`, `contract/tsconfig.json`, `contract/.prettierignore` (`pnpm-lock.yaml`).
- `contract/vitest.config.ts`: `include: ['tests/**/*.test.ts']`, `testTimeout: 30_000`.
- `contract/openapi.yaml`: `GET /api/health` with 200 `{status}` (`status: {type: string, enum: [ok]}`) and 503 `Error`; the shared parts from the decisions.
- `contract/src/env.ts — baseUrl`, `contract/src/openapi.ts — validateResponse()`, `contract/src/client.ts — newClient(), Client`.
- `contract/tests/health.test.ts` (contract): `GET /api/health` is 200 and conforms.
- `contract/tests/http.test.ts` (contract, one table): `GET /api/nope` 404 `not_found`; `POST /api/health` without `Origin` 403 `origin_mismatch`; with a foreign `Origin` 403; with a matching `Origin` and `Content-Type: text/plain` 415 `unsupported_media_type`.
- `Makefile`: `CONTRACT_DIR`, `contract`, `contract-check`, `check: contract-check`, both in `CLASS_developer`.
- `.env.example`: `# CONTRACT_BASE_URL=http://localhost:8080`.
- `docs/decisions.md`: one D line for the separate contract package and the validator pick.

### Acceptance criteria

- [ ] `make contract-check` exits 0.
- [ ] Pins agree: `test "$(jq -r .packageManager contract/package.json)" = "$(jq -r .packageManager frontend/package.json)"` exits 0.
- [ ] Contract: with `make db`, `make db-migrate` and `make be` running, `make contract` passes.
- [ ] Validation bites (manual, stack as above): `sed -i 's/enum: \[ok\]/enum: [okay]/' contract/openapi.yaml; ! make contract; git checkout contract/openapi.yaml` exits 0.
- [ ] `! make help | grep -q UNCLASSIFIED` exits 0.
- [ ] `make check` passes.

## Phase 2: CI job

**Depends on**: 1

### Context

- `.github/workflows/ci.yml — changes, backend-integration-tests` — Postgres service, golang-migrate install step and pinned action SHAs to copy.

### What to build

- `.github/workflows/ci.yml`: filter `contract` in `changes`, plus its output.
- Job `contract`: `needs: changes`, `if: needs.changes.outputs.contract == 'true'`, `timeout-minutes: 15`.
  - `postgres:18` service and env as `backend-integration-tests` (`DB_HOST: localhost`, `POSTGRES_*`), plus `CONTRACT_BASE_URL: http://localhost:8080`.
- Steps, in order, every `uses:` SHA-pinned as in the file:
  1. checkout; setup-go from `backend/go.mod`; the golang-migrate install step verbatim; `migrate … up` on `database/migrations`.
  2. In `backend/`: `go build -o "$RUNNER_TEMP/what-the-flag" ./cmd/what-the-flag`, then start it in the background with output to `$RUNNER_TEMP/backend.log`.
  3. Wait: `curl -fsS --retry 30 --retry-connrefused --retry-delay 1 http://localhost:8080/api/health`.
  4. pnpm/action-setup with `package_json_file: contract/package.json`; setup-node with `node-version-file: frontend/.node-version`, `cache: pnpm`, `cache-dependency-path: contract/pnpm-lock.yaml`.
  5. In `contract/`: `pnpm install --frozen-lockfile`, `format:check`, `lint`, `lint:openapi`, `typecheck`, `test`.
  6. `if: failure()`: print `$RUNNER_TEMP/backend.log`.

### Acceptance criteria

- [ ] No tag pins: `! grep -nE 'uses: [^@]+@v[0-9]' .github/workflows/ci.yml` exits 0.
- [ ] CI job `contract` green on the lane's pushed head (lead checks, R31).
- [ ] `make check` passes.

## Phase 3: Helpers for the feature plans

**Depends on**: 1

### Context

- plan-quiz-practice "Schema": `rounds(id, set_id)`, `questions(set_id, position, correct_index)`.
- plan-accounts: `POST /api/accounts` body `{username, password}`, 201 with the session cookie and the me body.

### What to build

- `contract/package.json`, `contract/pnpm-lock.yaml`: `pg` and `@types/pg` via `pnpm add` (latest at execution).
- `contract/src/db.ts — correctOption(), closeDb()`; `contract/src/setup.ts` calls `closeDb()` in `afterAll`; `contract/vitest.config.ts` gains `setupFiles: ['src/setup.ts']`.
- `contract/src/users.ts — registerUser()`.
- No test of their own: quiz-practice phase 1 is the first caller of `correctOption()`, accounts phase 1 of `registerUser()`.

### Acceptance criteria

- [ ] Helper signatures typecheck: `pnpm --dir contract run typecheck` exits 0.
- [ ] Contract: with `make db`, `make db-migrate` and `make be` running, `make contract` passes.
- [ ] `make check` passes.
