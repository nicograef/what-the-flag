# Plan: Anonymous player

> Source PRD: docs/prds/prd-rebuild.md. This plan changes its rules on names, leaderboards and on-device storage. Accounts stay out of scope.

## Goal

A returning visitor is recognised without signup or login:
- their name is prefilled;
- the server knows their best score, their world rank and score, and their latest quiz, and `GET /api/me` serves them.

`docs/plans/plan-redesign.md` builds the screens that show them.

Every leaderboard lists a player once, with their best run. The anonymous identity is the one a later account would attach to.

## Architectural decisions

- **The player key.** A random 256-bit key, base64url-encoded in 43 characters.
  - The first successful `POST /api/runs` without a valid key issues it, in the cookie `wtf_player`: `HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=34560000` (400 days, Chrome's cap).
  - The routes that resolve the player re-set it, so the lifetime slides: start, me, leaderboard and challenge. Answers and state reads ignore it.
  - Anything that isn't 43 base64url characters, or whose hash is unknown, counts as no key.
  - The key never appears in a JSON body, URL or log.
- **Why a server-set HttpOnly cookie (D14).**
  - Safari deletes script-writable storage after 7 days of Safari use without interaction with the site. That covers localStorage, IndexedDB and `document.cookie`.
  - Cookies set by the site's own server are exempt. The exemption fails behind CNAME cloaking or on a different IP than the page.
  - `/api` is served by the same Caddy on the same host, and must stay there.
  - JavaScript can't read an HttpOnly key.
- **Rejected identification.**
  - Device fingerprinting: it needs consent and is unreliable.
  - A localStorage UUID: Safari's 7-day deletion.
  - Passkeys: they belong to a later account.
- **Schema.** Migration `000006_players.up.sql`, in one transaction:
  1. Empty all play data: `run_answers`, `runs`, `quiz_questions`, `quizzes`. The owner ruled this for the beta on 2026-11-28; there is no backfill.
  2. `players`: `id uuid PK DEFAULT gen_random_uuid()`, `key_hash bytea UNIQUE NOT NULL` (SHA-256 of the key), `created_at timestamptz NOT NULL`.
  3. `runs.player_id uuid NOT NULL REFERENCES players`.
  4. Index `runs (player_id, started_at DESC)`.
- **Boundaries.**
  - The core knows only `quiz.PlayerID`.
  - The key, its hash and the `Players` port live in `httpapi`: `Resolve(ctx, hash) (PlayerID, bool, error)` and `Create(ctx, hash) (PlayerID, error)`. `postgres.Players` implements it, wired in `backend/internal/app/app.go — New()`.
  - A player is created only after `Service.Start` validated the request, so a rejected start leaves no orphan.
- **Names.** A player has no name of its own. The name stays per run, and the latest run's name prefills the form.
- **Leaderboards.**
  - A player appears once, with their best visible ended run: highest score, then earliest end, then id.
  - Global counts creator runs; a quiz leaderboard counts runs on that quiz.
  - The rank is `rank() OVER (ORDER BY score DESC)` over the players' best runs, so ties share a rank.
  - The own row is the requester's player; `?run=` and router state go.
  - The challenge response's `creator` gains `own`, always present: true when the creator run belongs to the requester's player.
  - A hidden run is skipped. `make hide` and `make prod-hide` hide every run of the given run's player.
  - `GlobalTop` no longer limits through an index. It scans every ended creator run, which is acceptable at this scale.
- **API.**
  - `GET /api/me` answers 200 with `{ lastName, best, worldRank, worldBest, lastQuizId }`:
    - every field is null without a known player;
    - `best` is the best score over all of the player's ended runs;
    - `worldRank` is the player's rank on the global leaderboard;
    - `worldBest` is the score of the run behind `worldRank`, null when `worldRank` is;
    - `lastQuizId` is the quiz of the player's latest run of any kind, creator or challenge.
  - The finished-run payload gains `best: { score, isNew, previous }`:
    - `score` is the player's best score over all ended runs;
    - `isNew` holds when the run's score is above 0 and above every other ended run of the player; a tie isn't new;
    - `previous` is the player's best before this run: the best over their runs that ended before it, null on a first run.
- **No resume after days.** A question expires 17 s after it's served, so a run left open can't be resumed later. Reloading `/play/:runId` resumes within the clock, as today. `lastQuizId` lets the home page link `/q/:lastQuizId`, which shows its leaderboard and offers a replay.
- **Later accounts.** An account would link one or more player ids. No schema for it now.

## Inventory

- `database/migrations/` — `000006` follows `000005`; `database/stats.sql — replay_share`.
- `backend/sqlc/queries/quiz.sql — CreateRun, GlobalTop, QuizTop, RunRanks, CreatorRun`; regenerate with `cd backend && go tool sqlc generate`.
- `backend/internal/quiz/service.go — Service.Start(), Service.Global(), Service.Challenge(), Service.State()`; `ports.go — Repository, Leaderboards, Entry`; `run.go — Run`.
- `backend/internal/quiz/service_test.go` (11 `Start` calls) and `memory_test.go — memory` (the double).
- `backend/internal/quiz/postgres/repository.go`, `leaderboards.go`, `repository_integration_test.go — newRun(), TestInRunConcurrent()`, `leaderboards_integration_test.go — board.run()` (a raw `INSERT INTO runs`).
- `backend/internal/quiz/httpapi/handler.go — Handler.Register(), start(), leaderboard(), challenge()`; `present.go — presenter.state()`.
- `backend/internal/app/app.go — New()` — the wiring.
- `backend/internal/contract/harness_integration_test.go — newClient()` (it needs a cookie jar per client), `golden_test.go — decodeGolden(), pinned`, `quiz_integration_test.go`, `testdata/*.json`. Regenerate the goldens with `make POSTGRES_DB="$POSTGRES_DB" be-integration TEST_ARGS='-count=1 ./internal/contract -args -update'`.
- `backend/internal/httpx/middleware.go — CheckOrigin()` — together with `SameSite=Lax`, it guards the cookie against CSRF.
- `Makefile — hide, prod-hide, hide-run`; `scripts/smoke.sh`.
- `frontend/src/lib/api.ts — createApiClient()`, which always parses JSON; `frontend/src/test/fake-api.ts — FakeApi`, which rejects unknown routes; `frontend/src/test/render.tsx — renderRoute()` (its `state` option); `frontend/src/test/api-contract.test.ts`.
- `frontend/src/features/play/personal-best.ts — recordScore()`, `name-form.tsx` (its `nameKey` with `readItem` and `writeItem`), `run-result.tsx` (its `recordScore()` call), `api.ts`, `messages.ts`, `home-page.test.tsx`, `play.test.tsx`.
- `frontend/src/features/leaderboard/own-run.ts — ownRunState(), useOwnRun(), runQuery()`, `leaderboard-page.tsx`, `api.ts`, `leaderboard-page.test.tsx`; `frontend/src/features/challenge/challenge-page.tsx`, `api.ts`, `challenge-page.test.tsx`.
- `docs/game-rules.md`, `docs/UBIQUITOUS_LANGUAGE.md`, `docs/decisions.md`, `docs/prds/prd-rebuild.md` (the "browser remembers" and "sessions" lines, and the leaderboard rules).

## Open questions / Risks

- **Consent (inference).** The device already stores data today: the name, the best score and the locale.
  - New is a persistent pseudonymous id that links runs on the server, probably under GDPR Art. 6(1)(f).
  - The privacy page the owner supplies before the public launch must name the cookie, its purpose and its 400-day lifetime.
  - A legal check is the owner's call before the public launch.
- **Lost cookie.** Clearing cookies, a new browser or another device makes a new player. A later account solves it.
- **Two tabs.** Two tabs starting a run at once without a cookie make two players; the later `Set-Cookie` wins.
- **Dev limitation (inference).** Safari on `http://localhost`, or a phone reaching Vite by LAN IP, drops the `Secure` cookie.
  - Each start there makes a new player.
  - Chrome and Firefox keep the cookie on localhost. The e2e stack is HTTPS.
- **Shared dev database.** Each lane migrates its own database, and every make command passes it, as in [programme.md](programme.md#stores).
  - Applying `000006` to the shared `make db` database breaks run creation for code without this plan.
  - Undoing it needs `migrate force 5` and a manual rollback.
  - Integration tests run only through `make be-integration`.
- **Ordering.**
  - This plan runs before `docs/plans/plan-quiz-domain-now.md` phases 6–8, which touch the same service, ports, adapter and presenter files.
  - It also runs before `docs/plans/plan-redesign.md`, which builds the home, result and leaderboard screens on `/api/me` and `best`.
- **Overtaken card.** A later follow-up to this plan adds `overtaken` for the latest 3 quizzes to `/api/me`. This plan does not build it.

## Phase 1: Player key and runs owned by a player

**Depends on**: none

### Context

- `database/migrations/` — new `000006_players.up.sql`.
- `backend/sqlc/queries/quiz.sql — CreateRun`; new `CreatePlayer` and `PlayerByKeyHash`.
- `backend/internal/quiz/ports.go`, `service.go — Service.Start()`, `run.go — Run`, `service_test.go`, `memory_test.go`.
- `backend/internal/quiz/postgres/repository.go`, a new `players.go`, `repository_integration_test.go`, `leaderboards_integration_test.go — board.run()`.
- `backend/internal/quiz/httpapi/handler.go — start()`, a new `player.go`; `backend/internal/app/app.go — New()`.
- `backend/internal/contract/harness_integration_test.go — newClient()`, `quiz_integration_test.go`.
- `docs/decisions.md`, `docs/prds/prd-rebuild.md`.

### What to build

- **Migration and core.**
  - The migration, as in the decisions.
  - `quiz.PlayerID`, `Run.Player`, and `Service.Start(ctx, player PlayerID, name, quiz)`.
  - The service tests, the memory double and the integration helpers pass a player. `board.run()` creates one player per run unless its spec names one.
- **`httpapi/player.go`.**
  - It parses the cookie and hashes it.
  - It resolves the player through `Players`.
  - On `start`, it creates a player when none resolves, but only after the request validated.
  - It sets the cookie.
- **Tests.**
  - The contract harness gives each client its own cookie jar. Go's cookiejar treats 127.0.0.1 as a secure origin, so the `Secure` cookie round-trips.
  - `TestPlayerKey`:
    - the first start sets `wtf_player` with `HttpOnly`, `Secure`, `SameSite=Lax` and `Path=/api`;
    - a second start with the jar reuses the player, read back from the database;
    - a malformed cookie gets a new player;
    - a rejected start (an invalid name) sets no cookie.
- **Docs.**
  - Add D14 with the Safari constraint from the decisions.
  - In `docs/prds/prd-rebuild.md`, narrow the out-of-scope "sessions" item to logins and accounts, and name the anonymous player key.

### Acceptance criteria

- [ ] `make POSTGRES_DB="$POSTGRES_DB" db-migrate && docker compose -f docker-compose.yml exec -T -e DB="$POSTGRES_DB" postgres sh -c 'psql -U "$POSTGRES_USER" -d "${DB:-$POSTGRES_DB}" -Atc "select attnotnull from pg_attribute where attrelid = '\''runs'\''::regclass and attname = '\''player_id'\''"' | grep -qx t` (run with the lane's database exported as `POSTGRES_DB`)
- [ ] `make POSTGRES_DB="$POSTGRES_DB" be-integration TEST_ARGS='-count=1 -v -run=TestPlayerKey' | grep -q -- '--- PASS: TestPlayerKey'`
- [ ] `grep -q '^- D14' docs/decisions.md`
- [ ] Final gate: `make check && make POSTGRES_DB="$POSTGRES_DB" be-integration TEST_ARGS=-count=1`

## Phase 2: One leaderboard entry per player

**Depends on**: 1

### Context

- `backend/sqlc/queries/quiz.sql — GlobalTop, QuizTop, RunRanks`; `backend/internal/quiz/postgres/leaderboards.go`, `leaderboards_integration_test.go`.
- `backend/internal/quiz/ports.go — Leaderboards, Entry`; `service.go — Service.Global(), Service.Challenge(), Service.State()`; `httpapi/handler.go — leaderboard(), challenge()`, `player.go`.
- `backend/internal/contract/quiz_integration_test.go`, `testdata/leaderboard.json`, `testdata/challenge.json`.
- `Makefile — hide, prod-hide, hide-run`; `database/stats.sql — replay_share`.
- `frontend/src/features/leaderboard/own-run.ts`, `leaderboard-page.tsx`, `api.ts`, `ranking-table.tsx`, `leaderboard-page.test.tsx`; `frontend/src/features/challenge/challenge-page.tsx`, `api.ts`, `challenge-page.test.tsx`; `frontend/src/features/play/run-result.tsx`; `frontend/src/test/render.tsx — renderRoute()`.
- `docs/game-rules.md`, `docs/prds/prd-rebuild.md`.

### What to build

- **SQL.**
  - `GlobalTop` and `QuizTop` take each player's best visible ended run with `DISTINCT ON (player_id) ORDER BY player_id, score DESC, ended_at, id`. An outer query ranks them, then orders by score descending, earliest end and id, limited to 100.
  - `RunRanks` computes a rank as 1 plus the number of other players whose best visible ended run scores higher. A run that isn't its player's best reports the rank of that best.
  - An index on `runs (score DESC, player_id) WHERE creator AND NOT hidden`.
- **Own row.** It comes from the resolved player. `?run=` goes from the API. `own-run.ts`, `runQuery()`, the router state and `renderRoute()`'s `state` option go from the frontend.
- **`creator.own`.** The challenge response sets it from the resolved player, as in the decisions; the frontend schema gains it.
- **Hiding.** `make hide` and `make prod-hide` hide all runs of the given run's player.
- **Stats.** `stats.sql`'s replay share counts players with more than one run.
- **Tests.**
  - `TestLeaderboardOnePerPlayer`: two runs of one player plus one run of another yield two rows, with the first player's better run.
  - `TestOwnRowByPlayer`, a contract test: the jar client's row is `own` without `?run=`. On its own quiz, `creator.own` is true; on another player's quiz it is false.
- **Docs.**
  - `docs/game-rules.md`: "A player appears once per leaderboard, with their best run; the name shown is that run's", replacing "A name may appear many times, once per run".
  - `docs/prds/prd-rebuild.md` gets the matching lines.

### Acceptance criteria

- [ ] `make POSTGRES_DB="$POSTGRES_DB" be-integration TEST_ARGS='-count=1 -v -run=TestLeaderboardOnePerPlayer' | grep -q -- '--- PASS: TestLeaderboardOnePerPlayer'`
- [ ] `make POSTGRES_DB="$POSTGRES_DB" be-integration TEST_ARGS='-count=1 -v -run=TestOwnRowByPlayer' | grep -q -- '--- PASS: TestOwnRowByPlayer'`
- [ ] `! grep -rqw -e runQuery -e useOwnRun -e ownRunState frontend/src`
- [ ] `jq -e '.creator.own == false' backend/internal/contract/testdata/challenge.json`
- [ ] Final gate: `make check && make POSTGRES_DB="$POSTGRES_DB" be-integration TEST_ARGS=-count=1`

## Phase 3: /api/me and the run's best

**Depends on**: 2

### Context

- `backend/sqlc/queries/quiz.sql` — a new `PlayerSummary`: latest name, best score, the latest run's quiz. The world rank comes from the per-player `RunRanks`. A new query reads the player's best over the runs that ended before a given run.
- `backend/internal/quiz/service.go — Service.State()`, `ports.go`; `httpapi/handler.go — Register()`, `player.go`; `present.go — presenter.state()`.
- `backend/internal/contract/quiz_integration_test.go`, `golden_test.go — pinned`, `testdata/run-finished.json`, `testdata/run-timeout.json`, a new `testdata/me.json`.
- `frontend/src/features/play/personal-best.ts`, `name-form.tsx`, `run-result.tsx`, `api.ts`, `messages.ts`, `home-page.test.tsx`, `play.test.tsx`, `fake-run.ts`.
- `frontend/src/features/challenge/challenge-page.test.tsx`, `frontend/src/features/leaderboard/leaderboard-page.test.tsx` (both render `NameForm` or `/`); `frontend/src/test/fake-api.ts`, `api-contract.test.ts`.
- `scripts/smoke.sh`.

### What to build

This phase builds data and its plumbing only. `docs/plans/plan-redesign.md` builds the home and result presentation: the best score, the world rank and the latest-quiz link.

- **Backend.**
  - `GET /api/me`, as in the decisions. `TestMe` writes the `me.json` golden.
    - A challenge run after a creator run moves `lastQuizId` to the challenge's quiz.
  - `best` in the finished-run payload. Regenerate the goldens and pin `lastQuizId` in `golden_test.go`.
    - `TestBestPrevious`: a first run has `previous` null and `isNew` true; a lower second run has `isNew` false and `previous` equal to the first score.
- **`me` query.** `api.ts` gains `fetchMe()` with its schema and a `me` query. Starting or finishing a run invalidates it.
- **Name prefill.** The name form prefills `lastName` while the field is untouched. A failing `/api/me` never blocks the form.
- **Best wiring.** The result schema gains `best`. `run-result.tsx` reads `best.isNew` for its new-record line instead of `recordScore()`. Its rank line names the best run's rank as "dein bester Platz", because phase 2 reports that rank.
- **Deletions.** `personal-best.ts` and the `wtf.name` storage go; locale storage stays.
- **Frontend wiring.** `FakeApi` replies to `GET /api/me` in every test file that renders `/` or `NameForm`. `api-contract.test.ts` parses `me.json`.
- **Tests.**
  - `home-page.test.tsx`: "prefills the name from the server" replaces "prefills the stored name".
  - `play.test.tsx`: "announces a new record from the server" replaces "stores and announces a new personal best".
- **Smoke.** `scripts/smoke.sh` gains a cookie round-trip with `curl -c` and `-b`: a start, then `/api/me` returns `lastName == "smoke"`.
- **Copy.** Every changed string in de and en in `features/play/messages.ts`.

### Acceptance criteria

- [ ] `make POSTGRES_DB="$POSTGRES_DB" be-integration TEST_ARGS='-count=1 -v -run=TestMe' | grep -q -- '--- PASS: TestMe'`
- [ ] `make POSTGRES_DB="$POSTGRES_DB" be-integration TEST_ARGS='-count=1 -v -run=TestBestPrevious' | grep -q -- '--- PASS: TestBestPrevious'`
- [ ] `jq -e 'has("lastName") and has("best") and has("worldRank") and has("worldBest") and has("lastQuizId") and (has("record") | not)' backend/internal/contract/testdata/me.json && jq -e '.result.best | has("previous")' backend/internal/contract/testdata/run-finished.json`
- [ ] `cd frontend && pnpm exec vitest run src/features/play/home-page.test.tsx -t 'prefills the name from the server' --reporter=verbose | grep -q '✓.*prefills the name from the server'`
- [ ] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'announces a new record from the server' --reporter=verbose | grep -q '✓.*announces a new record from the server'`
- [ ] `test ! -e frontend/src/features/play/personal-best.ts && ! grep -rq -e 'wtf.best' -e 'wtf.name' frontend/src`
- [ ] `grep -q -- '-c ' scripts/smoke.sh && grep -q '/api/me' scripts/smoke.sh`
- [ ] Final gate: `make check && make POSTGRES_DB="$POSTGRES_DB" be-integration TEST_ARGS=-count=1`
