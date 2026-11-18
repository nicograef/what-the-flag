# Plan: Quiz and practice rounds

> Source PRD: docs/prds/prd-rebuild.md

## Goal

A visitor starts a practice round on the landing page and plays ten server-timed questions.
Every text travels in German and English; the frontend picks the reader's language.
The `quiz` package exposes sets, rounds, summaries and a finish hook for duels. Nothing here needs an account.

## Architectural decisions

### Go types (`backend/internal/quiz/model.go`)

- `Mode` (`string`): `flag_country`, `flag_capital`, `country_flag`, `country_capital`, `capital_flag`, `capital_country`; constants `ModeFlagToCountry` … `ModeCapitalToCountry`, slice `Modes`.
- `Kind` (`string`): `KindPractice` (`practice`), `KindDuel` (`duel`). Sizes `PracticeSize = 10`, `DuelSize = 10`.
- `Question struct{ Mode Mode; Target string; Options [4]string; Correct int }` (options are alpha-2 codes); `Set struct{ Questions []Question }`.
- quiz uses `country.Country` and `country.Names` directly. IDs are `github.com/google/uuid.UUID`.
- Errors: `ErrPoolTooSmall`, `ErrRoundNotFound`, `ErrNotCurrentQuestion`, `ErrInvalidOption`, `ErrRoundNotFinished`, `ErrNilTx`.

### Generation (`backend/internal/quiz/generate.go — Generate(pool []country.Country, n int, rnd *rand.Rand) (Set, error)`, `math/rand/v2`)

1. Shuffle a copy of the pool; the first `n` entries are the targets. `n > len(pool)` returns `ErrPoolTooSmall`. Each question draws its mode with `rnd.IntN(6)`.
2. Region candidates: the target's region minus the target, if the region holds ≥ `MinRegionPool = 8` pool countries.
3. Walk the shuffled region candidates, then the shuffled rest of the pool. Take the first 3 that pass every filter:
   - its answer text (name, primary capital or flag key) differs from all others in `De` and `En`;
   - modes with a capital prompt or capital answers: no capital (primary or other) is shared with the target or a picked one;
   - modes with a flag prompt or flag options: the candidate is in no `Lookalikes` of the target or a picked one.
4. Fewer than 3 survivors returns `ErrPoolTooSmall`. Options `[target, d1, d2, d3]` are shuffled; `Correct` is the target's index. Real regions hold 14 (Oceania) to 54 (Africa) pool countries. The whole-pool fallback serves small test pools only.

### Schema (`database/migrations/000002_quiz.up.sql`, wrapped in `BEGIN; … COMMIT;`)

| Table | Columns and constraints |
| --- | --- |
| `quiz_sets` | `id uuid PK DEFAULT uuidv7()`, `kind text NOT NULL CHECK (kind IN ('practice','duel'))`, `created_at timestamptz NOT NULL`; index `(kind, created_at)` |
| `questions` | `set_id uuid REFERENCES quiz_sets ON DELETE CASCADE`, `position smallint CHECK (position >= 0)`, `mode text NOT NULL CHECK (six modes)`, `target text NOT NULL`, `options text[] NOT NULL CHECK (cardinality(options) = 4)`, `correct_index smallint NOT NULL CHECK (0..3)`; PK `(set_id, position)` |
| `rounds` | `id uuid PK DEFAULT gen_random_uuid()`, `set_id uuid NOT NULL REFERENCES quiz_sets ON DELETE CASCADE`, `user_id uuid NULL`, `started_at timestamptz NOT NULL`, `finished_at timestamptz NULL`; `UNIQUE (set_id, user_id)` |
| `answers` | `round_id uuid REFERENCES rounds ON DELETE CASCADE`, `position smallint`, `served_at timestamptz NOT NULL`, `answered_at timestamptz NULL`, `option_index smallint NULL CHECK (0..3)`, `correct boolean NULL`; PK `(round_id, position)`; unique index `answers_one_open (round_id) WHERE correct IS NULL` |

- `rounds.id` is the practice credential: `gen_random_uuid()` gives 122 random bits. NULL users never conflict in the `UNIQUE`.
- The `kind` CHECK already admits `duel`; `user_id` gets its FK from `000003_accounts`.
- Serving `p` inserts its `answers` row (`served_at = now`): the row is the clock. A timeout stores `correct = false`, the rest NULL.
- Quiz timestamps come from the injected clock, truncated to µs; no SQL `now()`.

### Round state machine (limit 20 s, grace 2 s; "late" means `now > served_at + 22 s`)

Each read (`State`) or answer (`Answer`) runs in one transaction that first locks the `rounds` row `FOR UPDATE`. Then, in order:

1. Authorise: unknown round, or a round whose user is not `viewer`, returns `ErrRoundNotFound`. An `option` outside 0..3 returns `ErrInvalidOption`. Either writes nothing.
2. Materialise: an open, late question `p` is resolved as a timeout. If `p = N-1`, the round finishes with `finished_at = served_at + 22 s`.
3. Apply the event:

| State after step 2 | Event | Result |
| --- | --- | --- |
| playing, no open question | read | serve the next position (`served_at = now`); return it |
| playing, open `p` | read | return `p`, same deadline |
| finished | read | summary |
| playing, open `p` | answer(`p`, option or null) | `answered_at = now`, `option_index`, `correct = (option = correct_index)`; finish if `p = N-1` |
| any | answer(`q`), `q` resolved | the stored result for `q`, nothing written (retry, double click, late answer) |
| playing | answer(`q`), `q` not served or outside 0..N-1 | `ErrNotCurrentQuestion` |

- Concurrent answers to `p` serialise on the row lock; the second gets the stored result. A late answer returns `timedOut: true`.
- A reload after expiry serves `p+1` at once. An abandoned round stays `playing`: unserved questions have no clock.
- "Finish" sets `finished_at`, then calls the kind's hook in the same transaction; a hook error rolls back both. A null option counts as wrong.

### Service API (`backend/internal/quiz/service.go`)

Every method that takes a `pgx.Tx` returns `ErrNilTx` for a nil one. Methods without a `tx` run their own transaction.

| Signature | Behaviour |
| --- | --- |
| `NewService(store Store, pool []country.Country, now func() time.Time, rnd *rand.Rand) *Service` | `rnd` is guarded by a mutex |
| `CreateSet(ctx context.Context, tx pgx.Tx, kind Kind, size int) (uuid.UUID, error)` | generates and stores a set and its questions |
| `StartRound(ctx context.Context, tx pgx.Tx, setID, userID uuid.UUID) (uuid.UUID, error)` | `uuid.Nil` stores a NULL user. Otherwise `ON CONFLICT (set_id, user_id) DO NOTHING`, then select: idempotent, locks no row |
| `StartPractice(ctx context.Context) (uuid.UUID, error)` | one transaction: delete practice sets with `created_at < now − 7 × 24 h`, `CreateSet`, `StartRound` with `uuid.Nil`; returns the round id |
| `State(ctx context.Context, roundID, viewer uuid.UUID) (RoundState, error)` | read event |
| `Answer(ctx context.Context, roundID, viewer uuid.UUID, position int, option *int) (AnswerResult, error)` | answer event |
| `Summary(ctx context.Context, tx pgx.Tx, roundID uuid.UUID) (Summary, error)` | finished rounds only, else `ErrRoundNotFinished`; callers authorise |
| `OnFinished(kind Kind, h FinishHook)` | one hook per kind at wiring time; a second one panics. Practice has none |

| Type | Definition |
| --- | --- |
| `FinishHook` | `interface{ RoundFinished(ctx context.Context, tx pgx.Tx, r FinishedRound) error }` |
| `FinishedRound` | `struct{ RoundID, SetID, UserID uuid.UUID; Kind Kind; Correct int; TotalAnswerTime time.Duration; FinishedAt time.Time }` |
| `RoundState` | `struct{ RoundID uuid.UUID; Total int; Finished bool; Position int; Question *Question; Deadline, Now time.Time; Summary *Summary }` |
| `AnswerResult` | `struct{ Position int; Correct, TimedOut, Finished bool; Chosen *int; CorrectOption int }` |
| `Summary`, `SummaryItem` | `struct{ Total, Correct int; Items []SummaryItem }`, `struct{ Position int; Question Question; Chosen *int; Correct bool; AnswerTime *time.Duration }` |

- Lock order: quiz locks the round row; a hook locks its own row first. Inside the hook, `Summary(ctx, tx, r.RoundID)` sees the round finished.
- `Store` (declared in `service.go`): `InTx(ctx, func(pgx.Tx) error)`, `CreateSet`, `CreateRound`, `DeletePracticeBefore`, `LoadSummary`, each taking the caller's tx.
  `InRound(ctx, id, func(RoundTx) error)` locks the row; `RoundTx` offers `Load`, `Serve`, `Resolve`, `Finish`, `Tx() pgx.Tx`.
- `backend/internal/quiz/store.go — NewStore(db DB)`: `DB` is sqlc's `DBTX` plus `Begin(ctx) (pgx.Tx, error)`, met by a pool and `postgres.TestTx(t)`.
- sqlc: a `quiz` block in `backend/sqlc.yaml`, queries `backend/sqlc/queries/quiz.sql`, output `backend/internal/quiz/internal/db`.
- The in-memory fake (`backend/internal/quiz/fake_store_test.go`) holds rows in maps and passes a stub `pgx.Tx`. It mimics no lock and no rollback.

### HTTP (`backend/internal/quiz/handler.go`, presentation in `present.go`)

- `NewHandler(svc *Service, p *Presenter, viewer func(*http.Request) uuid.UUID) *Handler`, `(h *Handler) Register(mux *http.ServeMux)`.
- `backend/internal/app/app.go — New()` calls `country.Load()` (panic on error: the dataset is embedded), seeds ChaCha8 from `crypto/rand`, passes `time.Now`. Its viewer returns `uuid.Nil` (anonymous); duels phase 1 swaps in the accounts viewer.

| Route | Body | Response |
| --- | --- | --- |
| `POST /api/practice` | `{}` | 201 `{"roundId": "<uuid>"}` |
| `GET /api/rounds/{id}` | — | 200 round state |
| `POST /api/rounds/{id}/answers` | `{"position": 0, "option": 2}`; `option` null or absent = no answer | 200 answer result |

| Field | Type | Meaning |
| --- | --- | --- |
| `id`, `status`, `total`, `serverNow` | string, `"playing"`/`"finished"`, int, RFC 3339 with ms | round id, status, set size, server clock at response time |
| `question` | object or null: `position` (0-based), `mode`, `prompt`, `options`, `deadline` | null when finished |
| `question.prompt`, `question.options` | `{"type":"flag","flagKey":"…"}` or `{"type":"text","text":{"de":"…","en":"…"}}`; options: array of 4 | `text` is a `country.Names` |
| `question.deadline` | RFC 3339 with ms | `served_at + 20 s`; grace stays server-side |
| `summary` | object or null | `{"total","correct","items":[{"position","mode","prompt","options","correctOption","chosenOption","correct","answerTimeMs"}]}`; `chosenOption`, `answerTimeMs` nullable |
| answer result | object | `{"position","correct","timedOut","chosenOption","correctOption","finished"}` |

- A playing state carries no correct option, target or past answer. Flags travel as flag keys: no payload holds an alpha-2 code.
- Flag prompt for `flag_*`, flag options for `*_flag`, else text: a name or primary capital.
- `backend/internal/quiz/present.go — NewPresenter(pool []country.Country) *Presenter`, `Presenter.State(rs RoundState) RoundStateView`, `Presenter.Summary(s Summary) SummaryView` (duels reuse it).
- Error table for `httpx.MapError`: `ErrRoundNotFound` 404 `round_not_found` (also an unparsable `{id}`); `ErrNotCurrentQuestion` 409 `not_current_question`; `ErrInvalidOption` 400 `invalid_option`, field `option`.
- Contract tests: `backend/internal/contract/quiz_integration_test.go`; timeouts stay at service level. No handler test: the contract sees every route.

### Frontend (`frontend/src/features/play/`)

- `frontend/src/features/play/play.tsx — Play({ roundId, now?, onFinished? })`: the one play component; `onFinished(summary)` fires once. `now` defaults to `performance.now`.
- `frontend/src/features/play/api.ts — getRound(api, roundId)`, `answerQuestion(api, roundId, position, option)` with Zod schemas.
- `frontend/src/features/play/use-round.ts — useRound(roundId, now)` calls `useApiClient()`.
- Remaining = `(deadline − serverNow) − (now() − receivedAt)`, recomputed on a 100 ms tick; the wall clock is never read. The reveal lasts 1500 ms of `now()`, then a refetch serves the next question. At zero remaining the client posts `option: null`.
- Query key `['round', roundId]`, `staleTime: Infinity`, `refetchOnWindowFocus: false`, disabled during the reveal.
- Texts render `text[locale]`: a language switch sends no request. Flag `alt` is neutral ("Flag", "Option B"). Unknown codes use `errorMessage()`.

## Inventory

- `backend/internal/country — Load()`, `Catalogue.Pool()`, `Country`, `Names` (country-data) — the pool.
- `backend/internal/httpx — ReadJSON(), WriteJSON(), MapError()`, `backend/internal/postgres — TestPool(), TestTx()`, `backend/internal/app/app.go — New()` (foundation).
- `backend/internal/contract/harness_integration_test.go` (foundation) — server on the test pool, cookie jars, strict decoding.
- `frontend/src/lib/api.ts — useApiClient()`, `frontend/src/lib/i18n/ — useLocale(), defineMessages(), errorMessage()`, `frontend/src/test/ — FakeApi, renderRoute()` (foundation).

## Open questions / Risks

- Clean-up runs only when a practice round starts. An idle site keeps expired anonymous rows until then.
- The fake store checks no SQL. Locking, rollback and `ON CONFLICT` are proven only by the Postgres tests.

## Phase 1: Practice set and first question

**Depends on**: none

### Context

- See Inventory. Integration criteria need `make db` running.

### What to build

- `database/migrations/000002_quiz.up.sql`; `backend/sqlc.yaml` (quiz block); generated `backend/internal/quiz/internal/db/`.
- `backend/sqlc/queries/quiz.sql`: insert set, questions, round; delete practice sets before a cutoff; lock round; load questions and answers; serve.
- `backend/internal/quiz/model.go`, `backend/internal/quiz/generate.go`, `backend/internal/quiz/store.go`.
- `backend/internal/quiz/service.go`: `NewService`, `CreateSet`, `StartRound`, `StartPractice`, `State` without timeouts.
- `backend/internal/quiz/present.go — Presenter.State()`; `backend/internal/quiz/handler.go`: `POST /api/practice`, `GET /api/rounds/{id}`; `backend/internal/app/app.go — New()` wiring.
- `backend/internal/quiz/generate_test.go — TestGenerate`: real pool, `n = 197`, seeds 0–999, so every country is a target in every mode. A literal tiny pool pins the fallback, duplicate text, other capitals, look-alikes and `ErrPoolTooSmall`.
- `backend/internal/quiz/present_test.go — TestPresent`: prompt and option type and text per mode.
- `backend/internal/quiz/fake_store_test.go`; `backend/internal/quiz/service_test.go — TestRoundServe`: deadline `now + 20 s`, reload keeps it, nil tx, another user's round.
- `backend/internal/quiz/store_integration_test.go`: `TestStoreSet` (both kinds, rolled-back tx, 10 concurrent reads serve once), `TestStoreStartRound` (concurrent starts, `uuid.Nil`), `TestStorePracticeCleanup`.
- `backend/internal/contract/quiz_integration_test.go — TestQuizPractice`: create returns a round id; the first read serves position 0 with four options.
  A second read keeps the deadline. Unknown and unparsable ids are 404 `round_not_found`. No JSON string equals a pool code.

### Acceptance criteria

- [ ] Generation (unit): `cd backend && go test ./internal/quiz -run TestGenerate`
- [ ] Presenter (unit): `cd backend && go test ./internal/quiz -run TestPresent`
- [ ] Service (fake store): `cd backend && go test ./internal/quiz -run TestRoundServe`
- [ ] Store (Postgres): `make db-migrate && cd backend && go test -tags=integration -race ./internal/quiz -run 'TestStoreSet|TestStoreStartRound'`
- [ ] Only practice sets created over 7 days ago vanish, with rounds and answers: `make db-migrate && cd backend && go test -tags=integration ./internal/quiz -run TestStorePracticeCleanup`
- [ ] Contract: `make db-migrate && cd backend && go test -tags=integration ./internal/contract -run TestQuizPractice`
- [ ] `make check` passes.

## Phase 2: Answers, clock and summary

**Depends on**: 1

### Context

- `backend/internal/quiz/service.go — State()`, `backend/internal/quiz/store.go — InRound()`, `backend/internal/contract/quiz_integration_test.go`. Integration criteria need `make db` running.

### What to build

- `backend/sqlc/queries/quiz.sql`: resolve answer, finish round, load summary; regenerated `backend/internal/quiz/internal/db/`.
- `backend/internal/quiz/service.go`: timeouts in `State`; `Answer`, `Summary`, `OnFinished`, the hook call.
- `backend/internal/quiz/store.go`, `backend/internal/quiz/fake_store_test.go`: `Resolve`, `Finish`, `LoadSummary`.
- `backend/internal/quiz/present.go — Presenter.Summary()`, answer result view; `backend/internal/quiz/handler.go`: `POST /api/rounds/{id}/answers` and its error table.
- `backend/internal/quiz/service_test.go — TestRoundAnswer`: answers at 19 s, 21.5 s and 22.001 s; null option; a reload after expiry serves `p+1`.
  A last-question timeout finishes with `FinishedAt = served_at + 22 s`. Repeat, future position, option 4, finished round unchanged. The hook runs once with `Correct`, `TotalAnswerTime`, `FinishedAt`; its error is returned.
- `backend/internal/quiz/store_integration_test.go`: `TestStoreFinish` (a failing hook leaves the answer open and `finished_at` NULL; a hook reads `Summary` on its tx). `TestStoreAnswerConcurrent`: two concurrent answers write once and return equal results.
- `backend/internal/contract/quiz_integration_test.go — correctOption(t, roundID, index)` reads `correct_index` with one query on the test pool.
  `TestQuizAnswer`: the `correctOption` answer is correct; another is wrong with the same `correctOption`; a repeat returns the stored result.
  A future position is 409 `not_current_question`; option 4 is 400 `invalid_option`, field `option`. Ten answers finish; the summary counts them and holds no pool code.

### Acceptance criteria

- [ ] Service (fake store): `cd backend && go test ./internal/quiz -run TestRoundAnswer`
- [ ] Store (Postgres): `make db-migrate && cd backend && go test -tags=integration -race ./internal/quiz -run 'TestStoreFinish|TestStoreAnswerConcurrent'`
- [ ] Contract: `make db-migrate && cd backend && go test -tags=integration ./internal/contract -run TestQuizAnswer`
- [ ] `make check` passes.

## Phase 3: Play feature and practice page

**Depends on**: 2

### Context

- `frontend/src/lib/api.ts`, `frontend/src/lib/i18n/`, `frontend/src/test/fake-api.ts`, `frontend/src/test/render.tsx`, `frontend/src/app/router.tsx`, `frontend/src/features/landing/landing-page.tsx`.

### What to build

- shadcn `card` and `progress` via `cd frontend && pnpm dlx shadcn@latest add <name>`, only if missing from `frontend/src/components/ui/`; `frontend/package.json`, `frontend/pnpm-lock.yaml` as the CLI changes them.
- `frontend/src/features/play/api.ts`, `frontend/src/features/play/use-round.ts`, `frontend/src/features/play/play.tsx`.
- `frontend/src/features/play/question-card.tsx` (six modes, flag `<img>`, 2×2 grid), `frontend/src/features/play/countdown.tsx`, `frontend/src/features/play/round-summary.tsx`.
- `frontend/src/features/play/messages.ts` (`defineMessages`: per-mode questions, reveal, summary, `round_not_found`).
- `frontend/src/features/landing/api.ts — startPractice(api)`, `useStartPractice()`; `frontend/src/features/landing/landing-page.tsx` button; `frontend/src/features/landing/messages.ts` label.
- `frontend/src/app/router.tsx`: `/practice/:roundId` to `frontend/src/features/play/practice-page.tsx`, which renders `Play` and links to `/`.
- `frontend/src/features/play/fake-round.ts — fakeRound(api, set)`: a stateful round on top of `FakeApi.respond()`.
- `frontend/src/features/play/play.test.tsx` (test-controlled `now`, `waitFor`, no fake timers): reveal and advance; zero remaining posts `option: null`.
  Resume keeps question and deadline; summary; one `onFinished`; a language switch changes the texts and sends no request.
- `frontend/src/features/landing/landing-page.test.tsx`: the start button navigates to `/practice/<id>`.

### Acceptance criteria

- [ ] Component: `pnpm --dir frontend exec vitest run src/features/play src/features/landing`
- [ ] `make check` passes.
