# Plan: Quiz and practice rounds

> Source PRD: docs/prds/prd-rebuild.md

## Goal

A visitor starts a practice round on the landing page and plays ten server-timed questions in German or English.
The `quiz` package exposes sets, rounds, summaries and a finish hook for the duel and weekly plans.

## Architectural decisions

### Go types (`backend/internal/quiz/model.go`)

| Type | Definition |
| --- | --- |
| `Mode` | `string`: `flag_country`, `flag_capital`, `country_flag`, `country_capital`, `capital_flag`, `capital_country` (`ModeFlagToCountry` … `ModeCapitalToCountry`, slice `Modes`) |
| `Kind` | `string`: `KindPractice`, `KindDuel`, `KindWeekly` (`practice`, `duel`, `weekly`) |
| `Text` | `struct{ DE, EN string }`; `(Text) In(l httpx.Locale) string` (R2: quiz maps `country.Names` to `Text`) |
| `Country` | `struct{ Code, Region, FlagKey string; Name, Capital Text; OtherCapitals []Text; Lookalikes []string }` |
| `Question` | `struct{ Mode Mode; Target string; Options [4]string; Correct int }`: options are alpha-2 codes |
| `Set` | `struct{ Questions []Question }` |

- `catalogue.go — FromCatalogue(pool []country.Country) []Country`. Only it and `generate_test.go` import `internal/country`. Sizes: `PracticeSize = 10`, `DuelSize = 10`, `WeeklySize = 20`.
- IDs are `github.com/google/uuid.UUID` (R3); sqlc emits them through the `backend/sqlc.yaml` override.

### Generation (`generate.go — Generate(pool []Country, n int, rnd *rand.Rand) (Set, error)`, `math/rand/v2`)

1. Shuffle a copy of the pool; the first `n` entries are the targets. `n > len(pool)` returns `ErrPoolTooSmall`.
2. Each question draws its mode with `rnd.IntN(6)`.
3. Region candidates: the target's region minus the target, if the region holds ≥ `MinRegionPool = 8` pool countries.
4. Walk the shuffled region candidates, then the shuffled rest of the pool. Take the first 3 that pass every filter:
   - answer text (name, primary capital or flag key, per mode) differs from the target's and each picked one's, in `DE` and `EN`;
   - modes with a capital prompt or capital answers: no capital (primary or other) is shared with the target or a picked one;
   - modes with a flag prompt or flag options (R13): the candidate is in no `Lookalikes` of the target or a picked one.
5. Fewer than 3 survivors returns `ErrPoolTooSmall`. Options `[target, d1, d2, d3]` are shuffled; `Correct` is the target's index.
- Satisfiability: real regions hold 14 (Oceania) to 54 (Africa) pool countries, so every target fills 3 region distractors in every mode. The fallback serves small test pools.

### Schema (`database/migrations/000004_quiz.up.sql`)

| Table | Columns and constraints |
| --- | --- |
| `quiz_sets` | `id uuid PK DEFAULT uuidv7()`, `kind text NOT NULL CHECK (kind IN ('practice','duel','weekly'))`, `created_at timestamptz NOT NULL`; index `(kind, created_at)` |
| `questions` | `set_id uuid REFERENCES quiz_sets ON DELETE CASCADE`, `position smallint CHECK (position >= 0)`, `mode text NOT NULL CHECK (six modes)`, `target text NOT NULL`, `options text[] NOT NULL CHECK (cardinality(options) = 4)`, `correct_index smallint NOT NULL CHECK (0..3)`; PK `(set_id, position)` |
| `rounds` | `id uuid PK DEFAULT uuidv7()`, `set_id uuid NOT NULL REFERENCES quiz_sets ON DELETE CASCADE`, `user_id uuid NULL REFERENCES users ON DELETE CASCADE`, `started_at timestamptz NOT NULL`, `finished_at timestamptz NULL`; unique index `rounds_set_user_uniq (set_id, user_id) WHERE user_id IS NOT NULL` |
| `answers` | `round_id uuid REFERENCES rounds ON DELETE CASCADE`, `position smallint`, `served_at timestamptz NOT NULL`, `answered_at timestamptz NULL`, `option_index smallint NULL CHECK (0..3)`, `correct boolean NULL`; PK `(round_id, position)`; unique index `answers_one_open (round_id) WHERE correct IS NULL` |

- Serving question `p` inserts its `answers` row with `served_at = now`. The row is the clock; a reload keeps it.
- `correct IS NULL` means open; `answers_one_open` allows one open question per round. A timeout stores `correct = false`, `option_index` and `answered_at` NULL.
- Every timestamp comes from the injected clock, truncated to microseconds, so the fake and Postgres compare alike. No SQL `now()`.
- A practice round id is the credential; `uuidv7()` holds 62 random bits. Quiz sets orphaned by account deletion stay (R14). Only practice sets are cleaned up.

### Round state machine (limit 20 s, grace 2 s; "late" means `now > served_at + 22 s`)

Each read (`State`) or answer (`Answer`) runs in one transaction that first locks the `rounds` row `FOR UPDATE`. Then, in order:

1. Authorise: unknown round, or a round with a user other than `viewer`, returns `ErrRoundNotFound` and writes nothing.
2. Answer only: `option` outside 0..3 returns `ErrInvalidOption`, nothing written.
3. Materialise: an open, late question `p` is resolved as a timeout; finish if `p = N-1`.
4. Apply the event:

| State after step 3 | Event | Result |
| --- | --- | --- |
| playing, no open question | read | serve the next position (`served_at = now`); return it |
| playing, open `p` | read | return `p`, same deadline |
| finished | read | summary |
| playing, open `p` | answer(`p`, option or null) | `answered_at = now`, `option_index`, `correct = (option = correct_index)`; finish if `p = N-1` |
| any | answer(`q`), `q` resolved | the stored result for `q`, nothing written (retry, double click, late answer) |
| playing | answer(`q`), `q` not served or outside 0..N-1 | `ErrNotCurrentQuestion` |

- Two concurrent answers to `p` serialise on the row lock. The first writes; the second gets the same stored result.
- A late answer to `p` returns `timedOut: true`. A reload after expiry times out `p` and serves `p+1` at once. An abandoned round stays `playing`: unserved questions have no clock.
- "Finish" sets `rounds.finished_at = now`, then calls the set kind's `FinishHook` in the same transaction. A hook error rolls back both. A null option is a deliberate non-answer: wrong, with its time recorded. The client sends it when its countdown hits zero.
- Answer time = `answered_at − served_at`. A timeout counts 22 s in `FinishedRound.TotalAnswerTime` and has no `AnswerTime`.

### Service API (`backend/internal/quiz/service.go`); callers: handler, duel, weekly

A `tx pgx.Tx` parameter is the caller's transaction; `nil` means quiz runs its own (R4).

| Signature | Behaviour |
| --- | --- |
| `NewService(store Store, pool []Country, now func() time.Time, rnd *rand.Rand) *Service` | `rnd` is guarded by a mutex |
| `(s *Service) CreateSet(ctx context.Context, tx pgx.Tx, kind Kind, size int) (uuid.UUID, error)` | generates and stores a set and its questions |
| `(s *Service) StartPractice(ctx context.Context) (uuid.UUID, error)` | practice set of 10 plus a round without user, one transaction; returns the round id |
| `(s *Service) StartRound(ctx context.Context, tx pgx.Tx, setID, userID uuid.UUID) (uuid.UUID, error)` | start or resume the user's round; idempotent; locks no row |
| `(s *Service) State(ctx context.Context, roundID, viewer uuid.UUID) (RoundState, error)` | read event |
| `(s *Service) Answer(ctx context.Context, roundID, viewer uuid.UUID, position int, option *int) (AnswerResult, error)` | answer event |
| `(s *Service) Summary(ctx context.Context, tx pgx.Tx, roundID uuid.UUID) (Summary, error)` | finished rounds only, else `ErrRoundNotFinished`; no viewer check, callers authorise |
| `(s *Service) OnFinished(kind Kind, h FinishHook)` | one hook per kind at wiring time; a second one panics |
| `(s *Service) DeleteExpiredPractice(ctx context.Context) (int64, error)` | deletes practice sets with `created_at < now − 7 × 24 h` |

| Type | Definition |
| --- | --- |
| `FinishHook` | `interface{ RoundFinished(ctx context.Context, tx pgx.Tx, r FinishedRound) error }` |
| `FinishedRound` | `struct{ RoundID, SetID, UserID uuid.UUID; Kind Kind; Correct int; TotalAnswerTime time.Duration; FinishedAt time.Time }` |
| `RoundState` | `struct{ RoundID uuid.UUID; Total int; Finished bool; Position int; Question *Question; Deadline, Now time.Time; Summary *Summary }` |
| `AnswerResult` | `struct{ Position int; Correct, TimedOut, Finished bool; Chosen *int; CorrectOption int }` |
| `Summary`, `SummaryItem` | `struct{ Total, Correct int; Items []SummaryItem }`, `struct{ Position int; Question Question; Chosen *int; Correct bool; AnswerTime *time.Duration }` |

- The hook takes an explicit `pgx.Tx`: the final answer and the duel or weekly result commit or fail together.
- Lock order (R4): quiz locks the round row; the hook locks the duel row or the user's weekly entry row first thing. Quiz never locks a row a hook holds.
- Inside the hook, `Summary(ctx, tx, r.RoundID)` already sees the round as finished. `viewer` is `uuid.Nil` for an anonymous request.
- `Store` (declared in `service.go`): `CreateSet`, `CreateRound` (`INSERT … ON CONFLICT ON rounds_set_user_uniq DO NOTHING`, then select), `LoadSummary`, `DeleteSetsBefore`, `InRound(ctx, id, func(RoundTx) error)`.
  Each takes the caller's `pgx.Tx` where the service passes one. `RoundTx` offers `Load`, `Serve`, `Resolve`, `Finish`, `Tx() pgx.Tx`.

### HTTP (`backend/internal/quiz/handler.go`, presentation in `present.go`)

`NewHandler(svc *Service, p *Presenter, viewer func(*http.Request) (uuid.UUID, bool)) *Handler`, `(h *Handler) Register(mux *http.ServeMux)`.
`main.go` passes `accountHandler.OptionalUser` as `viewer` (R5).

| Route | Body | Response |
| --- | --- | --- |
| `POST /api/practice` | `{}` | 201 `{"roundId": "<uuid>"}` |
| `GET /api/rounds/{id}` | — | 200 round state |
| `POST /api/rounds/{id}/answers` | `{"position": 0, "option": 2}`; `option` null or absent = no answer | 200 answer result |

| Field | Type | Meaning |
| --- | --- | --- |
| `id`, `status`, `total`, `serverNow` | string, `"playing"`/`"finished"`, int, RFC 3339 with ms | round id, status, set size, server clock at response time |
| `question` | object or null | null when finished |
| `question.position`, `question.mode` | int, `Mode` | 0-based index and mode |
| `question.prompt`, `question.options` | `{"kind":"flag","flagKey":"…"}` or `{"kind":"text","text":"…"}`; options: array of 4 | localised by `httpx.LocaleFrom(ctx)` |
| `question.deadline` | RFC 3339 with ms | `served_at + 20 s`; grace stays server-side |
| `summary` | object or null | `{"total","correct","items":[{"position","mode","prompt","options","correctOption","chosenOption","correct","answerTimeMs"}]}`; `chosenOption`, `answerTimeMs` nullable |
| answer result | object | `{"position","correct","timedOut","chosenOption","correctOption","finished"}` |

- A playing state carries no correct option, target, code or past answer. `correctOption` appears only for a resolved question.
- Flags travel as flag keys only (R12); texts are names or primary capitals. No payload holds an alpha-2 code. Prompt and option kinds per mode: flag prompt for `flag_*`, flag options for `*_flag`, text otherwise.
- `present.go — NewPresenter(pool []Country) *Presenter`, `(p *Presenter) State(rs RoundState, l httpx.Locale) RoundStateView`, `(p *Presenter) Summary(s Summary, l httpx.Locale) SummaryView`. Duels and weekly reuse `SummaryView`.
- Error codes: `round_not_found` 404 (also an unparsable `{id}`), `not_current_question` 409, `invalid_option` 400 with field `option`.

### Clean-up and frontend

- `cleanup.go — RunPracticeCleanup(ctx context.Context, svc *Service, log *slog.Logger)`: once at start, then every 24 h on a `time.Ticker`, until `ctx` ends.
- `frontend/src/features/play/play.tsx — Play({ roundId, onFinished? })`: the one play component. `onFinished(summary)` fires once.
- Clock: each response records `receivedAt = performance.now()`. Remaining = `(deadline − serverNow) − (performance.now() − receivedAt)`, polled every 100 ms. The client's wall clock is never read, so its skew has no effect. One-way latency stays inside the 2 s grace.
- The reveal shows for 1500 ms; the refetch after it serves the next question. At zero remaining the client posts `option: null`.
- Round query key `['round', roundId, locale]` (R20); `staleTime: Infinity`, `refetchOnWindowFocus: false`, `retry: false`.
  The query is disabled during the reveal, so no refetch serves the next question early.
- Flag `alt` is a neutral message ("Flag", "Option B"). Tests use `frontend/src/test/render.tsx — renderRoute(path, { api })` with `api` from `createApiClient({ fetch: fakeFetch, getLocale })` (R18); `fake-round-server.ts` supplies `fakeFetch`.

## Inventory

- `backend/internal/country — Load()`, `Catalogue.Pool()`, `Country`, `Names` — pool, names, capitals, region, flag key, look-alikes.
- `backend/internal/httpx — ReadJSON()`, `WriteJSON()`, `Error`, `WriteError()`, `Locale`, `LocaleFrom()`; `backend/internal/postgres — NewPool()`, `TestPool()`.
- `backend/internal/account — Handler.OptionalUser()` — viewer function; `users` table for the FK.
- `backend/cmd/what-the-flag/main.go`, `frontend/src/app/router.tsx` — wiring and routes (choke files); `frontend/src/lib/api.ts — useApiClient()`, `frontend/src/lib/i18n/ — useLocale()`, `useMessages()`, `frontend/src/test/render.tsx — renderRoute()`.
- `frontend/src/features/landing/landing-page.tsx — LandingPage`, `frontend/src/features/landing/api.ts` — start button host.

## Open questions / Risks

- Cross-plan order: migration `000004` references `users` (accounts `000002`), and the viewer is `account.Handler — OptionalUser()`. Accounts lands first.

## Phase 1: Practice set and first question

**Depends on**: none

### Context

- `backend/internal/country/`, `backend/internal/httpx/`, `backend/internal/account/handler.go — OptionalUser()`, `backend/internal/postgres/` — see Inventory.

### What to build

- `database/migrations/000004_quiz.up.sql` with all four tables; `backend/internal/quiz/model.go`, `backend/internal/quiz/catalogue.go`, `backend/internal/quiz/generate.go`.
- `backend/sqlc/queries/quiz.sql`: insert set, questions, round; lock round; load questions and answers; serve. Regenerated `backend/internal/db/`.
- `backend/internal/quiz/store.go`, `backend/internal/quiz/service.go` (`NewService`, `CreateSet`, `StartPractice`, `State` without timeouts), `backend/internal/quiz/present.go`, `backend/internal/quiz/handler.go` (`POST /api/practice`, `GET /api/rounds/{id}`).
- `backend/cmd/what-the-flag/main.go`: `country.Load()`, a ChaCha8 source seeded from `crypto/rand`, store, service, presenter, handler, `Register`.
- Tests: `backend/internal/quiz/generate_test.go`, `backend/internal/quiz/fake_store_test.go`, `backend/internal/quiz/service_test.go`, `backend/internal/quiz/handler_test.go`, `backend/internal/quiz/store_integration_test.go` (`//go:build integration`).
- `generate_test.go` runs the real pool with `n = 197` over seeds 0–999, so every country is a target in every mode. A literal tiny pool pins the whole-pool fallback, duplicate text, other capitals, look-alikes and `ErrPoolTooSmall`.

### Acceptance criteria

- [ ] Unit (pure): `cd backend && go test ./internal/quiz -run TestGenerate` passes. It checks every Generation rule, real distractors from the target's region, every (target, mode) pair and index seen, and one seed yields one set.
- [ ] Service: `cd backend && go test ./internal/quiz -run TestRoundServe` passes: first read serves position 0 with deadline `now + 20 s`; a reload returns the same deadline.
- [ ] Handler: `cd backend && go test ./internal/quiz -run TestHandlerState` passes: flag and text prompts in `de` and `en`; no JSON string equals a pool code; unparsable id is 404.
- [ ] Integration: `cd backend && go test -tags=integration -race ./internal/quiz -run TestStoreSet` passes. Set and round round-trip; a rolled-back caller tx leaves no set; 10 concurrent reads leave one answer row.
- [ ] `make check` passes.

## Phase 2: Answers, clock and summary

**Depends on**: 1

### Context

- `backend/internal/quiz/service.go — State()`, `backend/internal/quiz/store.go — InRound()` — read event and locked round transaction.

### What to build

- `backend/sqlc/queries/quiz.sql`: resolve answer, finish round, load summary; regenerated `backend/internal/db/`.
- `backend/internal/quiz/service.go`: authorisation and timeout materialisation in `State`; `Answer`, `Summary`, `OnFinished`, the hook call on finish.
- `backend/internal/quiz/store.go`, `backend/internal/quiz/fake_store_test.go`: `Resolve`, `Finish`, `LoadSummary`, `Tx()`; the fake discards changes when `fn` errors.
- `backend/internal/quiz/present.go`, `backend/internal/quiz/handler.go`: `POST /api/rounds/{id}/answers`, summary JSON, error mapping.
- Tests: `backend/internal/quiz/service_test.go`, `backend/internal/quiz/handler_test.go`, `backend/internal/quiz/store_integration_test.go`.

### Acceptance criteria

- [ ] Service: `cd backend && go test ./internal/quiz -run TestRoundAnswer` passes. Cases: answers at 19 s, 21.5 s and 22.001 s; null option; reload after expiry serves `p+1`. Further cases: repeat answer returns the stored result, future position, option 4, finished round unchanged. Hook: runs once with `Correct`, `TotalAnswerTime`, `FinishedAt`; its error rolls back; none for practice.
- [ ] Handler: `cd backend && go test ./internal/quiz -run TestHandlerAnswer` passes: answer result and summary JSON; `invalid_option` carries field `option`; `not_current_question` is 409.
- [ ] Integration: `cd backend && go test -tags=integration -race ./internal/quiz -run 'TestStoreFinish|TestStoreAnswerConcurrent'` passes. A failing hook leaves the last answer open and `finished_at` NULL. A hook reads `Summary` on its tx. Two concurrent answers write once and return equal results.
- [ ] `make check` passes.

## Phase 3: Play feature and practice page

**Depends on**: 2

### Context

- `frontend/src/lib/api.ts`, `frontend/src/lib/i18n/`, `frontend/src/test/render.tsx`, `frontend/src/app/router.tsx` — client, locale, test seam, routes.
- `frontend/src/features/landing/landing-page.tsx` — gets the start button.

### What to build

- shadcn `button`, `card`, `progress` via `cd frontend && pnpm dlx shadcn@latest add <name>`, only those missing from `frontend/src/components/ui/`; `frontend/package.json`, `frontend/pnpm-lock.yaml` as the CLI changes them.
- `frontend/src/features/play/api.ts`: `getRound()`, `answerQuestion()`, Zod schemas of the wire format.
- `frontend/src/features/play/use-round.ts`: round query, answer mutation, monotonic countdown.
- `frontend/src/features/play/play.tsx`, `frontend/src/features/play/question-card.tsx` (six modes, flag `<img>`, 2×2 option grid).
- `frontend/src/features/play/countdown.tsx`, `frontend/src/features/play/round-summary.tsx`, `frontend/src/features/play/messages.ts` (per-mode questions, reveal, summary).
- `frontend/src/features/landing/api.ts — startPractice()`, `frontend/src/features/landing/landing-page.tsx` button, `frontend/src/features/landing/messages.ts` label.
- `frontend/src/app/router.tsx`: `/practice/:roundId` to `frontend/src/features/play/practice-page.tsx`, which renders `Play` and links to `/`.
- Tests: `frontend/src/features/play/fake-round-server.ts`, `frontend/src/features/play/play.test.tsx` (fake timers), `frontend/src/features/landing/landing-page.test.tsx` (start button).

### Acceptance criteria

- [ ] Component: `cd frontend && pnpm exec vitest run src/features/play src/features/landing` passes. Cases: start navigates to `/practice/<id>`; reveal and advance; zero posts `option: null`; resume; summary; one `onFinished`; locale switch keeps the question.
- [ ] `make check` passes.

## Phase 4: User rounds and practice clean-up

**Depends on**: 2

### Context

- `backend/internal/quiz/service.go — StartPractice()`, `backend/cmd/what-the-flag/main.go` — round creation to extend; wiring for the clean-up loop.

### What to build

- `backend/sqlc/queries/quiz.sql`: insert-or-get user round, delete sets before a cutoff; regenerated `backend/internal/db/`.
- `backend/internal/quiz/service.go`: `StartRound`, `DeleteExpiredPractice`; `backend/internal/quiz/store.go`, `backend/internal/quiz/fake_store_test.go`: user `CreateRound`, `DeleteSetsBefore`.
- `backend/internal/quiz/cleanup.go — RunPracticeCleanup()`; `backend/cmd/what-the-flag/main.go` starts it.
- Tests: `backend/internal/quiz/service_test.go`, `backend/internal/quiz/store_integration_test.go`.

### Acceptance criteria

- [ ] Service: `cd backend && go test ./internal/quiz -run TestRoundOwner` passes. Start twice returns one round; the owner reads it. Another user and anonymous get `ErrRoundNotFound`, and their reads serve nothing.
- [ ] Integration: `cd backend && go test -tags=integration -race ./internal/quiz -run TestStoreStartRound` passes: concurrent starts return one round; a rolled-back caller tx leaves none.
- [ ] Integration: `cd backend && go test -tags=integration -race ./internal/quiz -run TestStoreCleanup` passes: only practice sets older than 7 days vanish, with their rounds and answers.
- [ ] Integration: `cd backend && go test -tags=integration -race ./internal/quiz -run TestStoreUserCascade` passes: deleting a user deletes their rounds and answers.
- [ ] `make check` passes.
