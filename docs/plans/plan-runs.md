# Plan: Runs

> Source PRD: docs/prds/prd-rebuild.md (Question rules, Run rules, HTTP contract, Frontend)

## Goal

A visitor enters a name, starts a run and answers one question after another until the first wrong or late answer.
The server generates each question when it serves it, runs the clock, checks every answer and ends abandoned runs.
Run starts are rate limited and names filtered. `frontend/src/features/play/` plays a run and shows its result.

## Architectural decisions

### Go types (`backend/internal/quiz/model.go`)

- `Mode` (`string`): `flag_country`, `flag_capital`, `country_flag`, `country_capital`, `capital_flag`, `capital_country`; constants `ModeFlagToCountry` … `ModeCapitalToCountry`, slice `Modes`.
- `Question struct{ Mode Mode; Target string; Options [4]string; Correct int }`; options are alpha-2 codes.
- `EndReason` (`string`): `EndWrong` (`wrong`), `EndTimeout` (`timeout`), `EndCompleted` (`completed`).
- `Limit = 15 * time.Second`, `Grace = 2 * time.Second`. "Late" means `now > served_at + Limit + Grace`.
- IDs are `github.com/google/uuid.UUID`. quiz uses `country.Country` and `country.Names` directly.
- Errors: `ErrPoolTooSmall`, `ErrInvalidName`, `ErrRunNotFound`, `ErrNotCurrentQuestion`, `ErrInvalidOption`, `ErrNilTx`.

### Generation (`backend/internal/quiz/generate.go`, `math/rand/v2`)

- `Generate(pool []country.Country, seed int64, position int) (Question, error)`, a pure function.
- Target: `rand.New(rand.NewPCG(uint64(seed), 0)).Perm(len(pool))[position]`. So no target repeats within a run.
- Everything else draws from `rand.New(rand.NewPCG(uint64(seed), uint64(position)+1))`: the mode with `IntN(6)`, then the distractors.
- `position >= len(pool)` and pools under 4 entries return `ErrPoolTooSmall`.
- Distractors, in order:
  1. Region candidates: the target's region minus the target, if the region holds ≥ `MinRegionPool = 8` pool countries.
  2. Walk the shuffled region candidates, then the shuffled rest of the pool. Take the first 3 that pass every filter.
     - Its answer text (name, primary capital or flag key) differs from all others in `De` and `En`.
     - Modes with a capital prompt or capital answers: no capital (primary or other) is shared with the target or a picked one.
     - Modes with a flag prompt or flag options: the candidate is in no `Lookalikes` of the target or a picked one.
  3. Fewer than 3 survivors returns `ErrPoolTooSmall`. Options `[target, d1, d2, d3]` are shuffled; `Correct` is the target's index.
- Real regions hold 14 (Oceania) to 54 (Africa) pool countries. The whole-pool fallback serves small test pools only.

### Name rules (`backend/internal/quiz/name.go`)

- `NormalizeName(raw string, blocked Blocklist) (string, error)` trims and collapses inner whitespace runs to one space.
  It returns `ErrInvalidName` when the result is empty, holds over 20 runes, or holds a rune other than these:
  `unicode.IsLetter`, `unicode.IsDigit`, space, `_`, `-`, `.`.
- `Blocklist` holds lower-case entries. The name is lower-cased and split into tokens at every rune that is no letter or digit.
- The name is blocked when one of these matches:
  - A token equals a single-word entry.
  - The tokens contain a multi-word entry's tokens consecutively.
  - All tokens joined without separator equal an entry, which catches `f.o.o`.
- No substring match, so "Scunthorpe" passes. Leetspeak passes too; the PRD accepts that.
- `LoadBlocklist() (Blocklist, error)` parses the embedded `backend/internal/quiz/blocklist/words.txt`, one entry per line.

### Word list

- Vendored by `scripts/fetch-data-sources.sh` like the country sources: `data/sources/ldnoobw/de`, `data/sources/ldnoobw/en`, `data/sources/ldnoobw/LICENSE`.
  Source: `https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words`, env default `LDNOOBW_REV=5faf2ba42d7b1c0977169ec3611df25a3c08eb13`, CC-BY-4.0.
- `backend/cmd/importdata` gains the owned directory `backend/internal/quiz/blocklist/`.
  It writes `words.txt` (both lists lower-cased, trimmed, deduplicated, sorted, LF) and a copy of the vendored `LICENSE`.
- Overrides: `data/overrides.json` gains `allowedWords` (entries removed from the list, each with `reason`), empty today.
  An entry absent from the list fails, as every override does.
- `NOTICE` and `data/SOURCES.md` gain the source. `data/LICENSE` (ODbL) does not cover it: the word list stays CC-BY-4.0.

### Schema (`database/migrations/000002_runs.up.sql`, wrapped in `BEGIN; … COMMIT;`)

| Table | Columns and constraints |
| --- | --- |
| `runs` | `id uuid PK DEFAULT gen_random_uuid()`, `name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 20)`, `seed bigint NOT NULL`, `started_at timestamptz NOT NULL`, `score integer NOT NULL DEFAULT 0 CHECK (score >= 0)`, `finished_at timestamptz NULL`, `end_reason text NULL CHECK (end_reason IN ('wrong','timeout','completed'))`, `CHECK ((finished_at IS NULL) = (end_reason IS NULL))`; index `runs_open (started_at) WHERE finished_at IS NULL`, index `(finished_at)` |
| `run_questions` | `run_id uuid REFERENCES runs ON DELETE CASCADE`, `position smallint CHECK (position >= 0)`, `mode text NOT NULL CHECK (six modes)`, `target text NOT NULL`, `options text[] NOT NULL CHECK (cardinality(options) = 4)`, `correct_index smallint NOT NULL CHECK (correct_index BETWEEN 0 AND 3)`, `served_at timestamptz NOT NULL`, `answered_at timestamptz NULL`, `option_index smallint NULL CHECK (option_index BETWEEN 0 AND 3)`, `correct boolean NULL`; PK `(run_id, position)`; unique index `run_questions_one_open (run_id) WHERE correct IS NULL`; index `(served_at) WHERE correct IS NULL` |

- `runs.id` is the credential: `gen_random_uuid()` gives 122 random bits. `seed` comes from `crypto/rand` and never leaves the server.
- Serving position `p` inserts its `run_questions` row with `served_at = now`: the row is the clock.
- `p` always equals `score`, since every served question before it was answered correctly.
- Quiz timestamps come from the injected clock, truncated to µs; no SQL `now()`.

### Run state machine

Each read (`State`) or answer (`Answer`) runs in one transaction that first locks the `runs` row `FOR UPDATE`. Then, in order:

1. Authorise: an unknown run returns `ErrRunNotFound`. An `option` outside 0..3 returns `ErrInvalidOption`. Either writes nothing.
2. Materialise: an open, late question is resolved with `correct = false`, the rest NULL. The run ends `timeout` at `served_at + 17 s`.
3. Apply the event:

| State after step 2 | Event | Result |
| --- | --- | --- |
| playing, no open question | read | serve position `score` (`served_at = now`); return it |
| playing, open `p` | read | return `p`, same deadline |
| finished | read | the result |
| playing, open `p` | answer(`p`, option) correct | `answered_at`, `option_index`, `correct = true`, `score + 1`; at 197 the run ends `completed` |
| playing, open `p` | answer(`p`, option) wrong or null | `answered_at`, `option_index`, `correct = false`; the run ends `wrong` at `now` |
| any | answer(`q`), `q` resolved | the stored result for `q`, nothing written (retry, double click, late answer) |
| any | answer(`q`), `q` never served | `ErrNotCurrentQuestion` |

- Concurrent answers serialise on the row lock; the second gets the stored result. A late answer returns `timedOut: true`.
- "End" sets `finished_at` and `end_reason`, then calls every finish hook in the same transaction. A hook error rolls back both.

### Sweep

- `Service.Sweep(ctx) error` runs three steps, each in its own transactions:
  1. For each run with an open question served before `now − 17 s`, lock it `FOR UPDATE SKIP LOCKED` and materialise as above.
  2. Delete unfinished runs without any `run_questions` row and `started_at < now − 1 h`.
  3. Delete runs with `finished_at < now − 7 × 24 h`; their questions cascade.
- `backend/internal/app/app.go — Sweeper(d Deps) func(ctx context.Context)` returns a loop that calls `Sweep` every 10 s until `ctx` ends.
  An error is logged and the loop goes on. `main.go — run()` starts it in a goroutine and cancels it before `Shutdown`.
- `app.New` and `app.Sweeper` build their services through one unexported `services(d Deps)`, so both wire the same hooks.

### Service API (`backend/internal/quiz/service.go`)

Every method that takes a `pgx.Tx` returns `ErrNilTx` for a nil one. The others run their own transaction.

| Signature | Behaviour |
| --- | --- |
| `NewService(store Store, pool []country.Country, blocked Blocklist, now func() time.Time) *Service` | |
| `Start(ctx context.Context, name string) (uuid.UUID, error)` | `NormalizeName`, a fresh seed, one `runs` row; serves nothing |
| `State(ctx context.Context, runID uuid.UUID) (RunState, error)` | read event |
| `Answer(ctx context.Context, runID uuid.UUID, position int, option *int) (AnswerResult, error)` | answer event |
| `Sweep(ctx context.Context) error` | see Sweep |
| `OnFinished(h FinishHook)` | appends a hook at wiring time |

| Type | Definition |
| --- | --- |
| `FinishHook` | `interface{ RunFinished(ctx context.Context, tx pgx.Tx, r FinishedRun) error }` |
| `FinishedRun` | `struct{ RunID uuid.UUID; Name string; Score int; EndReason EndReason; FinishedAt time.Time }` |
| `RunState` | `struct{ RunID uuid.UUID; Name string; Score int; Finished bool; Question *Question; Position int; Deadline, Now time.Time; Result *Result }` |
| `Result` | `struct{ Score int; EndReason EndReason; Last *Resolved }`; `Last` is nil for `completed` |
| `Resolved` | `struct{ Position int; Question Question; Chosen *int }` |
| `AnswerResult` | `struct{ Position int; Correct, TimedOut, Finished bool; Chosen *int; CorrectOption, Score int }` |

- `Store` (declared in `service.go`): `CreateRun`, `DeleteUnread`, `DeleteFinishedBefore`, `LateRuns`, and `InRun(ctx, id, skipLocked bool, func(RunTx) error)`.
  `RunTx` offers `Load`, `Serve`, `Resolve`, `End` and `Tx() pgx.Tx`. A skipped lock returns no error and runs nothing.
- `backend/internal/quiz/store.go — NewStore(db DB)`: `DB` is sqlc's `DBTX` plus `Begin`, met by a pool and `postgres.TestTx(t)`.
- sqlc: a `quiz` block in `backend/sqlc.yaml`, queries `backend/sqlc/queries/quiz.sql`, output `backend/internal/quiz/internal/db`.
- The in-memory fake (`backend/internal/quiz/fake_store_test.go`) holds rows in maps and passes a stub `pgx.Tx`. It mimics no lock and no rollback.

### Rate limit (`backend/internal/ratelimit/`)

- `New(burst int, every time.Duration, now func() time.Time) *Limiter`: a token bucket per key, guarded by a mutex.
- `(l *Limiter) Allow(key string) (ok bool, retryAfter time.Duration)`. Full buckets are pruned at most once a minute.
- `ClientKey(r *http.Request) string`: the last `X-Forwarded-For` entry, else the host of `RemoteAddr`. IPv6 is masked to its /64.
- Caddy's `reverse_proxy` sets `X-Forwarded-For` from the client connection unless `trusted_proxies` is set. Verify against the Caddy docs at execution.
- `POST /api/runs` allows a burst of 30 per key and one more every 20 s. The handler checks it before reading the body.
- A refusal is 429 `rate_limited` with `Retry-After` in whole seconds, rounded up.

### HTTP (`backend/internal/quiz/handler.go`, presentation in `present.go`)

- `NewHandler(svc *Service, p *Presenter, limit *ratelimit.Limiter) *Handler`, `(h *Handler) Register(mux *http.ServeMux)`.
- `backend/internal/app/app.go — services()` calls `country.Load()` and `quiz.LoadBlocklist()`; it panics on error, since both are embedded.

| Route | Body | Response |
| --- | --- | --- |
| `POST /api/runs` | `{"name": "…"}` | 201 `{"runId": "<uuid>"}` |
| `GET /api/runs/{id}` | — | 200 run state |
| `POST /api/runs/{id}/answers` | `{"position": 0, "option": 2}`; `option` null or absent = no answer | 200 answer result |

| Field | Type | Meaning |
| --- | --- | --- |
| `id`, `name`, `status`, `score`, `serverNow` | string, string, `"playing"`/`"finished"`, int, RFC 3339 with ms | run id, player name, status, correct answers so far, server clock |
| `question` | object or null: `position`, `mode`, `prompt`, `options`, `deadline` | null when finished |
| `question.prompt`, `question.options` | `{"type":"flag","flagKey":"…"}` or `{"type":"text","text":{"de":"…","en":"…"}}`; options: array of 4 | `text` is a `country.Names` |
| `question.deadline` | RFC 3339 with ms | `served_at + 15 s`; the grace stays server-side |
| `result` | object or null | `{"score","endReason","last"}`; `last` is null or `{"position","mode","prompt","options","correctOption","chosenOption"}`, `chosenOption` nullable |
| answer result | object | `{"position","correct","timedOut","chosenOption","correctOption","finished","score"}` |

- A playing state carries no correct option and no target. Flags travel as flag keys: no payload holds an alpha-2 code.
- Flag prompt for `flag_*`, flag options for `*_flag`, else text: a name or primary capital.
- `NewPresenter(pool []country.Country) *Presenter`, `Presenter.State(rs RunState) RunStateView`, `Presenter.Answer(r AnswerResult) AnswerView`.
- Error table for `httpx.MapError`:

| Error | Status | Code | Field |
| --- | --- | --- | --- |
| `ErrInvalidName` | 400 | `invalid_name` | `name` |
| `ErrRunNotFound`, also an unparsable `{id}` | 404 | `run_not_found` | |
| `ErrNotCurrentQuestion` | 409 | `not_current_question` | |
| `ErrInvalidOption` | 400 | `invalid_option` | `option` |
| rate limit refusal | 429 | `rate_limited` | |

- Contract tests: `backend/internal/contract/runs_integration_test.go`; timeouts stay at service level. No handler test: the contract sees every route.

### Frontend (`frontend/src/features/play/`)

- `play-page.tsx — PlayPage` on `/play/:runId` renders `Play`; `Play({ runId, now? })` plays and then shows `RunResult`. `now` defaults to `performance.now`.
- `api.ts`: `startRun(api, name)`, `getRun(api, runId)`, `answerQuestion(api, runId, position, option)` with Zod schemas; `use-run.ts — useRun(runId, now)`.
- Remaining = `(deadline − serverNow) − (now() − receivedAt)`, recomputed on a 100 ms tick; the wall clock is never read.
- A correct answer is revealed for 800 ms of `now()`, then a refetch serves the next question. At zero remaining the client posts `option: null`.
- A wrong or late answer shows the correct option, then `RunResult`.
- Query key `['run', runId]`, `staleTime: Infinity`, `refetchOnWindowFocus: false`, disabled during the reveal.
- `run-result.tsx — RunResult({ result, name })`: score, the missed question with both options marked, a "play again" button.
  The button starts a new run with the same name. The leaderboard plan adds the ranks and a leaderboard link.
- `/` (`frontend/src/features/landing/landing-page.tsx`): a name form with shadcn `input`, prefilled from `localStorage` key `wtf.name`.
  Submit stores the name (storage in try/catch), calls `startRun` and navigates to `/play/<runId>`. `invalid_name` shows under the field.
- Texts render `text[locale]`: a language switch sends no request. Flag `alt` is neutral ("Flag", "Option B"). Unknown codes use `errorMessage()`.
- The landing server-status tracer goes: `frontend/src/features/landing/api.ts — getHealth(), useHealth()` and its texts are deleted.
- `frontend/src/test/fake-api.ts — FakeApi` loses its default `GET /api/me` reply; no route answers by default.

## Inventory

- `backend/internal/country — Load()`, `Catalogue.Pool()`, `Country`, `Names` (country-data) — the pool.
- `backend/cmd/importdata — ownedDirs, render(), build()`, `scripts/fetch-data-sources.sh`, `data/overrides.json`, `NOTICE`, `data/SOURCES.md` (country-data) — the word list's path in.
- `backend/internal/httpx — ReadJSON(), WriteJSON(), MapError()`, `backend/internal/postgres — TestPool(), TestTx()`, `backend/internal/app/app.go — New()`, `backend/cmd/what-the-flag/main.go — run()` (foundation).
- `backend/internal/contract/harness_integration_test.go — newServer(), newClient(), decode(), expectError()` (foundation). `newClient` sends a random `X-Forwarded-For` per client.
- `frontend/src/lib/api.ts — useApiClient()`, `frontend/src/lib/i18n/ — useLocale(), defineMessages(), errorMessage()`, `frontend/src/test/ — FakeApi, renderRoute()` (foundation).

## Open questions / Risks

- A dataset change during a run shifts its target order, because the permutation runs over the current pool. Runs are short; accepted.
- A determined bot learns the 197 flag keys and plays perfectly. The PRD accepts this; the rate limit only slows it.
- The fake store checks no SQL. Locking, rollback, `SKIP LOCKED` and the cascades are proven only by the Postgres tests.
- The rate limiter lives in process memory. A restart resets it, and a second backend instance would double it. One instance runs.

## Phase 1: Start a run and serve the first question

**Depends on**: none

### Context

- See Inventory. Integration criteria need `make db` running.

### What to build

- `database/migrations/000002_runs.up.sql`; `backend/sqlc.yaml` (quiz block); `backend/sqlc/queries/quiz.sql` (create run, lock run, load questions, serve); generated `backend/internal/quiz/internal/db/`.
- `backend/internal/quiz/model.go`, `backend/internal/quiz/generate.go`, `backend/internal/quiz/name.go` with an empty-list `Blocklist`, `backend/internal/quiz/store.go`.
- `backend/internal/quiz/service.go`: `NewService`, `Start`, `State` without timeouts.
- `backend/internal/quiz/present.go — Presenter.State()`; `backend/internal/quiz/handler.go`: `POST /api/runs` without the rate limit, `GET /api/runs/{id}`.
- `backend/internal/app/app.go — New(), services()` wiring; `LoadBlocklist` is not yet called, so `services()` passes an empty `Blocklist`.
- `backend/internal/quiz/generate_test.go — TestGenerate`: the real pool, seeds 0–199, every position 0–196.
  Every country is a target once per seed; every mode occurs. A literal tiny pool pins the fallback, duplicate text, other capitals, look-alikes and `ErrPoolTooSmall`.
  The same seed and position give the same question.
- `backend/internal/quiz/name_test.go — TestNormalizeName`: one table for length 0, 1, 20 and 21 runes; umlauts; collapsing; a forbidden rune; the three blocklist matches with a literal list; "Scunthorpe" passes.
- `backend/internal/quiz/present_test.go — TestPresent`: prompt and option type and text per mode.
- `backend/internal/quiz/fake_store_test.go`; `backend/internal/quiz/service_test.go — TestRunServe`: `Start` rejects a bad name and serves nothing. The first read serves position 0 with deadline `now + 15 s`; a second read keeps it.
- `backend/internal/quiz/store_integration_test.go — TestStoreServe`: 10 concurrent reads of one run serve position 0 once.
- `backend/internal/contract/runs_integration_test.go — TestRunStart`: start returns a run id; the first read serves position 0 with four options and the name.
  A blank name is 400 `invalid_name`, field `name`. Unknown and unparsable ids are 404 `run_not_found`. No JSON string equals a pool code.
- `docs/decisions.md`: `D09`: a run stores a server-side seed and generates each question when served. Reason: only served questions are stored, and checking stays on the server.

### Acceptance criteria

- [ ] Generation (unit): `cd backend && go test ./internal/quiz -run TestGenerate`
- [ ] Names (unit): `cd backend && go test ./internal/quiz -run TestNormalizeName`
- [ ] Presenter (unit): `cd backend && go test ./internal/quiz -run TestPresent`
- [ ] Service (fake store): `cd backend && go test ./internal/quiz -run TestRunServe`
- [ ] Store (Postgres): `make db-migrate && cd backend && go test -tags=integration -race ./internal/quiz -run TestStoreServe`
- [ ] Contract: `make db-migrate && cd backend && go test -tags=integration ./internal/contract -run TestRunStart`
- [ ] `make check` passes.

## Phase 2: Answers, clock, end of run and sweep

**Depends on**: 1

### Context

- `backend/internal/quiz/service.go — State()`, `backend/internal/quiz/store.go — InRun()`, `backend/internal/contract/runs_integration_test.go`, `backend/cmd/what-the-flag/main.go — run()`. Integration criteria need `make db` running.

### What to build

- `backend/sqlc/queries/quiz.sql`: resolve, end run, late runs, both deletes; regenerated `backend/internal/quiz/internal/db/`.
- `backend/internal/quiz/service.go`: timeouts in `State`; `Answer`, `OnFinished` and the hook call, `Sweep`.
- `backend/internal/quiz/store.go`, `backend/internal/quiz/fake_store_test.go`: `Resolve`, `End`, `LateRuns`, `DeleteUnread`, `DeleteFinishedBefore`, `skipLocked`.
- `backend/internal/quiz/present.go — Presenter.Answer()` and the result view; `backend/internal/quiz/handler.go`: `POST /api/runs/{id}/answers` and its error rows.
- `backend/internal/app/app.go — Sweeper()`; `backend/cmd/what-the-flag/main.go — run()` starts and stops it.
- `backend/internal/quiz/service_test.go — TestRunAnswer`: a correct answer at 14 s scores and the next read serves position 1.
  A wrong answer ends `wrong` with `Last` set. Answers at 16.5 s count; at 17.001 s they are `timedOut`. A null option ends `wrong`.
  A read after expiry returns the result, ended `timeout` at `served_at + 17 s`. A repeat returns the stored result; a never-served position is `ErrNotCurrentQuestion`; option 4 is `ErrInvalidOption`.
  A 4-country pool ends `completed` after four correct answers. Hooks run once with name, score, reason and end time; a hook error is returned.
- `backend/internal/quiz/store_integration_test.go`: `TestStoreEnd`: a failing hook leaves the question open and `finished_at` NULL.
  `TestStoreAnswerConcurrent`: two concurrent answers write once and return equal results.
  `TestStoreSweep`: a late run ends `timeout` and its hook runs; an unread run over 1 h and a run finished over 7 days ago vanish; fresher ones stay.
- `backend/internal/contract/runs_integration_test.go — correctOption(t, runID, position)` reads `correct_index` with one query on the test pool.
  `TestRunAnswer`: two correct answers score 2; a wrong one ends the run with `correctOption` and `last`; a repeat returns the stored result.
  A never-served position is 409 `not_current_question`; option 4 is 400 `invalid_option`, field `option`. No JSON string equals a pool code.

### Acceptance criteria

- [ ] Service (fake store): `cd backend && go test ./internal/quiz -run TestRunAnswer`
- [ ] Store (Postgres): `make db-migrate && cd backend && go test -tags=integration -race ./internal/quiz -run 'TestStoreEnd|TestStoreAnswerConcurrent|TestStoreSweep'`
- [ ] Contract: `make db-migrate && cd backend && go test -tags=integration ./internal/contract -run TestRunAnswer`
- [ ] The sweeper stops with the server: with `make db` running, `set -a && . ./.env && set +a && cd backend && go build -o /tmp/wtf ./cmd/what-the-flag && (APP_PORT=18080 /tmp/wtf >/tmp/wtf.log 2>&1 & p=$!; curl -fsS --retry 15 --retry-connrefused --retry-delay 1 -o /dev/null localhost:18080/api/health; c=$?; kill -TERM $p; wait $p && [ $c = 0 ]) && tail -1 /tmp/wtf.log | grep -q 'server stopped'`
- [ ] `make check` passes.

## Phase 3: Name filter and rate limit

**Depends on**: 2

### Context

- `scripts/fetch-data-sources.sh`, `backend/cmd/importdata/`, `data/overrides.json`, `NOTICE`, `data/SOURCES.md` — the vendoring path of country-data.
- `backend/internal/quiz/name.go — LoadBlocklist()`, `backend/internal/quiz/handler.go`, `backend/internal/app/app.go — services()`.

### What to build

- `scripts/fetch-data-sources.sh`: `LDNOOBW_REV` and the `ldnoobw` source per the word-list decision; run it once for that source.
  Commit `data/sources/ldnoobw/de`, `data/sources/ldnoobw/en`, `data/sources/ldnoobw/LICENSE`.
- `data/overrides.json`: `allowedWords: []`. `NOTICE`: a block for LDNOOBW (CC-BY-4.0, copyright line quoted from its `LICENSE` or its README). `data/SOURCES.md`: its row.
- `backend/cmd/importdata/`: read both lists, apply `allowedWords`, write `backend/internal/quiz/blocklist/words.txt` and `LICENSE`; the directory joins `ownedDirs`.
- `backend/internal/quiz/name.go — LoadBlocklist()` with `//go:embed blocklist/words.txt`; `services()` passes it.
- `backend/internal/ratelimit/limiter.go — New(), Limiter.Allow(), ClientKey()`; `backend/internal/ratelimit/limiter_test.go — TestAllow` (burst, refill, `retryAfter`, pruning) and `TestClientKey` (forwarded IPv4, IPv6 /64, `RemoteAddr` fallback).
- `backend/internal/quiz/handler.go`: the limiter on `POST /api/runs`; `services()` creates it with burst 30 and 20 s.
- `backend/internal/contract/runs_integration_test.go — TestRunGuards`: a name with a listed word is 400 `invalid_name`.
  31 starts from one client get 30 × 201, then 429 `rate_limited` with a `Retry-After` header. A second client still gets 201.
- `docs/decisions.md`: `D10`: the client key is the last `X-Forwarded-For` hop, IPv6 per /64. Reason: Caddy sets that hop and a home network holds one /64.

### Acceptance criteria

- [ ] The generated word list is current: `make data-check`
- [ ] The list ships with its licence: `cmp data/sources/ldnoobw/LICENSE backend/internal/quiz/blocklist/LICENSE`
- [ ] `NOTICE` credits the list: `grep -q 'CC-BY-4.0' NOTICE && grep -q 'LDNOOBW' NOTICE`
- [ ] Limiter (unit): `cd backend && go test ./internal/ratelimit`
- [ ] Contract: `make db-migrate && cd backend && go test -tags=integration ./internal/contract -run TestRunGuards`
- [ ] `make check` passes.

## Phase 4: Name form, play page and result

**Depends on**: 3

### Context

- `frontend/src/lib/api.ts`, `frontend/src/lib/i18n/`, `frontend/src/test/fake-api.ts`, `frontend/src/test/render.tsx`, `frontend/src/app/router.tsx`, `frontend/src/features/landing/`.

### What to build

- shadcn `card`, `input` and `progress` via `cd frontend && pnpm dlx shadcn@latest add <name>`, only if missing from `frontend/src/components/ui/`; `frontend/package.json`, `frontend/pnpm-lock.yaml` as the CLI changes them.
- `frontend/src/features/play/api.ts`, `frontend/src/features/play/use-run.ts`, `frontend/src/features/play/play.tsx`, `frontend/src/features/play/play-page.tsx`.
- `frontend/src/features/play/question-card.tsx` (six modes, flag `<img>`, 2×2 grid), `frontend/src/features/play/countdown.tsx`, `frontend/src/features/play/run-result.tsx`.
- `frontend/src/features/play/messages.ts` (`defineMessages`: per-mode questions, reveal, result, end reasons, `run_not_found`, `not_current_question`, `invalid_option`).
- `frontend/src/features/landing/landing-page.tsx`, `frontend/src/features/landing/messages.ts`: the name form, `invalid_name` and `rate_limited` texts. `frontend/src/features/landing/api.ts` is deleted.
- `frontend/src/app/router.tsx`: `/play/:runId` to `PlayPage`.
- `frontend/src/test/fake-api.ts`: no default reply.
- `frontend/src/features/play/fake-run.ts — fakeRun(api, questions)`: a stateful run on top of `FakeApi.respond()`.
- `frontend/src/features/play/play.test.tsx` (test-controlled `now`, `waitFor`, no fake timers):
  - a correct answer reveals, then the next question shows;
  - a wrong answer shows the correct option and the result with the score;
  - zero remaining posts `option: null`;
  - resume keeps question and deadline;
  - "play again" posts the same name and navigates to the new run;
  - a language switch changes the texts and sends no request.
- `frontend/src/features/landing/landing-page.test.tsx`, replacing the tracer tests:
  - the stored name prefills the field;
  - submit posts the name and navigates to `/play/<id>`;
  - `invalid_name` shows under the field and `rate_limited` shows its text;
  - an unknown path shows `NotFoundPage`, and the footer links to `NOTICE`.

### Acceptance criteria

- [ ] Component: `pnpm --dir frontend exec vitest run src/features/play src/features/landing`
- [ ] No tracer remains: `! grep -rnE 'useHealth|getHealth|/api/me' frontend/src`
- [ ] With `make db`, `make db-migrate`, `make be` and `make fe` running, a run starts through the proxy: `curl -fsS -X POST -H 'Content-Type: application/json' -H 'Origin: http://localhost:5173' -d '{"name":"probe"}' localhost:5173/api/runs | jq -e .runId`
- [ ] `make check` passes.
