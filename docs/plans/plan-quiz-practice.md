# Plan: Quiz and practice rounds

> Source PRD: docs/prds/prd-rebuild.md

## Goal

A visitor starts a practice round on the landing page and plays ten server-timed questions in German or English. The `quiz` package exposes sets, rounds and a finish hook for the duel and weekly plans.

## Architectural decisions

### Go types (`backend/internal/quiz/model.go`)

| Type | Definition |
| --- | --- |
| `Mode` | `string`: `flag_country`, `flag_capital`, `country_flag`, `country_capital`, `capital_flag`, `capital_country` (`ModeFlagToCountry` … `ModeCapitalToCountry`, slice `Modes`) |
| `Kind` | `string`: `KindPractice`, `KindDuel`, `KindWeekly` (`practice`, `duel`, `weekly`) |
| `Text` | `struct{ De, En string }`; `(Text) In(locale string) string` |
| `Country` | `struct{ Code, Region, FlagKey string; Name, Capital Text; OtherCapitals []Text }` |
| `Question` | `struct{ Mode Mode; Target string; Options [4]string; Correct int }`: options are alpha-2 codes |
| `Set` | `struct{ Questions []Question }` |

- `catalogue.go — FromCatalogue()` maps the pool; no other quiz file imports `internal/country`. Sizes: `PracticeSize = 10`, `DuelSize = 10`, `WeeklySize = 20`.

### Generation (`generate.go — Generate(pool []Country, n int, rnd *rand.Rand) (Set, error)`, `math/rand/v2`)

1. Shuffle a copy of the pool; the first `n` entries are the targets. `n > len(pool)` returns `ErrPoolTooSmall`.
2. Each question draws its mode with `rnd.IntN(6)`.
3. Region candidates: pool countries of the target's region except the target, when the region holds ≥ `MinRegionPool = 8` pool countries.
4. Walk the shuffled region candidates, then the shuffled rest of the pool. Take the first 3 that pass every filter:
   - its answer text differs from the target's and each picked one, in `de` and `en`;
   - capital-answer modes: the candidate's primary capital is none of the target's `OtherCapitals`, in either language;
   - capital-prompt modes: the candidate's primary capital differs from the target's, so the prompt stays unambiguous.
5. Fewer than 3 survivors returns `ErrPoolTooSmall`. Options `[target, d1, d2, d3]` are shuffled; `Correct` is the target's index.
6. Answer text is the country name, primary capital or flag key, per mode. Real regions hold 14 to 54 pool countries.

### Schema (`database/migrations/000004_quiz.up.sql`)

| Table | Columns and constraints |
| --- | --- |
| `quiz_sets` | `id uuid PK DEFAULT uuidv7()`, `kind text NOT NULL CHECK (kind IN ('practice','duel','weekly'))`, `created_at timestamptz NOT NULL`; index `(kind, created_at)` |
| `questions` | `set_id uuid REFERENCES quiz_sets ON DELETE CASCADE`, `position smallint CHECK (position >= 0)`, `mode text NOT NULL CHECK (six modes)`, `target text NOT NULL`, `options text[] NOT NULL CHECK (cardinality(options) = 4)`, `correct_index smallint NOT NULL CHECK (0..3)`; PK `(set_id, position)` |
| `rounds` | `id uuid PK DEFAULT uuidv7()`, `set_id uuid NOT NULL REFERENCES quiz_sets ON DELETE CASCADE`, `user_id uuid NULL REFERENCES users ON DELETE CASCADE`, `started_at timestamptz NOT NULL`, `finished_at timestamptz NULL`; unique index `(set_id, user_id) WHERE user_id IS NOT NULL` |
| `answers` | `round_id uuid REFERENCES rounds ON DELETE CASCADE`, `position smallint`, `served_at timestamptz NOT NULL`, `answered_at timestamptz NULL`, `option_index smallint NULL CHECK (0..3)`, `correct boolean NULL`; PK `(round_id, position)` |

- Serving question `p` inserts its `answers` row with `served_at = now` (`ON CONFLICT DO NOTHING`). The row is the clock; a reload keeps it.
- `correct IS NULL` means open. A timeout stores `correct = false`, `option_index` and `answered_at` NULL.
- Every timestamp comes from the service's injected clock. A practice round id is the credential; `uuidv7()` holds 62 random bits.

### Round state machine (limit 20 s, grace 2 s; "late" means `now > served_at + 22 s`)

| State | Event | Guard | Result |
| --- | --- | --- | --- |
| playing, no open question | read | next position < N | insert answer row `served_at = now`; return it |
| playing, open `p` | read | not late | return `p` with the same deadline |
| playing, open `p` | read | late | resolve `p` as timeout; then finish if `p = N-1`, else serve `p+1` |
| playing, open `p` | answer(`p`, option or null) | not late | `answered_at = now`, `option_index = option`, `correct = (option = correct_index)`; finish if `p = N-1` |
| playing, open `p` | answer(`p`, …) | late | resolve `p` as timeout; finish if last; response `timedOut: true` |
| playing | answer(`q`) | `q` is not the open position (also: already answered, not yet served) | `ErrNotCurrentQuestion` (409), state unchanged except a late timeout |
| any | answer | option outside 0..3 | `ErrInvalidOption` (400, field `option`) |
| finished | read | — | summary |
| finished | answer | — | `ErrRoundFinished` (409), nothing written |

- Each read or answer runs in one transaction that locks the `rounds` row `FOR UPDATE`.
- "Finish" sets `rounds.finished_at = now` and runs the set kind's `FinishHook` in that transaction.
- A null option is a deliberate non-answer: wrong, with its time recorded. The client sends it when its countdown hits zero.
- Answer time = `answered_at − served_at`; a timeout counts as 22 s in `FinishedRound.TotalAnswerTime`.

### Service API (`backend/internal/quiz/service.go`), callers: handler, duel, weekly

| Signature | Behaviour |
| --- | --- |
| `NewService(store Store, pool []Country, now func() time.Time, rnd *rand.Rand) *Service` | `rnd` is guarded by a mutex |
| `(s *Service) CreateSet(ctx, kind Kind, size int) (uuid.UUID, error)` | generates and stores a set |
| `(s *Service) StartPractice(ctx) (uuid.UUID, error)` | practice set of 10 plus a round with no user; returns the round id |
| `(s *Service) StartRound(ctx, setID, userID uuid.UUID) (uuid.UUID, error)` | start or resume the user's round; idempotent |
| `(s *Service) State(ctx, roundID, viewer uuid.UUID) (RoundState, error)` | read event of the state machine |
| `(s *Service) Answer(ctx, roundID, viewer uuid.UUID, position int, option *int) (AnswerResult, error)` | answer event |
| `(s *Service) Summary(ctx, roundID uuid.UUID) (Summary, error)` | finished rounds only, else `ErrRoundNotFinished`; no viewer check, callers authorise |
| `(s *Service) OnFinished(kind Kind, h FinishHook)` | registers one hook per kind at wiring time; a second one panics |
| `(s *Service) DeleteExpiredPractice(ctx) (int64, error)` | deletes practice sets with `created_at < now − 7 days` |
| `FinishHook` | `interface{ RoundFinished(ctx context.Context, tx pgx.Tx, r FinishedRound) error }` |
| `FinishedRound` | `{RoundID, SetID, UserID uuid.UUID; Kind Kind; Correct int; TotalAnswerTime time.Duration}` |
| `Summary`, `SummaryItem` | `{Total, Correct int; Items []SummaryItem}`, `{Position int; Question Question; Chosen *int; Correct bool; AnswerTime *time.Duration}` |

- Why a hook with an explicit `pgx.Tx`: the final answer and the duel score must commit or fail together. The type shows the contract; a context-carried transaction hides it.
- A hook error rolls back the final answer; the client gets 500. Quiz locks only the round row, so a hook comparing two rounds locks its own row (the duel) first.
- `viewer` is `uuid.Nil` for an anonymous request. A round with a user is visible only to that user; otherwise `ErrRoundNotFound` (404).
- `Store` declares `CreateSet`, `CreateRound` (insert or return existing), `InRound(ctx, id, func(RoundTx) error)` and `DeleteSetsBefore`. `RoundTx` offers `Load`, `Serve`, `Resolve`, `Finish` and `Tx() pgx.Tx`.

### HTTP (`backend/internal/quiz/handler.go`, presentation in `present.go`)

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
| `question.prompt`, `question.options` | `{"kind":"flag","flagKey":"…"}` or `{"kind":"text","text":"…"}`; options: array of 4 | localised by `Accept-Language`; no country codes |
| `question.deadline` | RFC 3339 with ms | `served_at + 20 s`; grace stays server-side |
| `summary` | object or null | `{"total","correct","items":[{"position","mode","prompt","options","correctOption","chosenOption","correct","answerTimeMs"}]}`; `chosenOption`, `answerTimeMs` nullable |
| answer result | object | `{"position","correct","timedOut","chosenOption","correctOption","finished"}` |

- Prompt and option kinds per mode: flag prompt for `flag_*`, flag options for `*_flag`, text otherwise. Text is a country name or primary capital.
- `present.go — Presenter.State()`, `Presenter.Summary()` and their exported view types serve duel and weekly results too.
- Error codes: `round_not_found` 404 (also an unparsable `{id}`), `round_finished` 409, `not_current_question` 409, `invalid_option` 400.
- The handler gets the viewer from an injected `func(*http.Request) (uuid.UUID, bool)`.

### Clean-up and frontend

- `cleanup.go — RunPracticeCleanup(ctx, svc, log)` runs once at start, then every 24 h on a `time.Ticker`, until `ctx` ends.
- `frontend/src/features/play/Play.tsx — Play({ roundId, onFinished? })`: the one play component. `onFinished(summary)` fires once.
- Clock offset = `serverNow − Date.now()` at receipt. Remaining = `deadline − (Date.now() + offset)`, polled every 100 ms.
- The reveal shows for 1500 ms; the refetch after it serves the next question. At zero remaining the client posts `option: null`.
- Flag `alt` is a neutral message ("Flag", "Option B"). Tests stub `fetch` with a scripted round fake. So `frontend/src/lib/api.ts` and its Zod parsing run for real.

## Inventory

- `backend/internal/country/` — pool, names, primary and other capitals, region, flag key.
- `backend/internal/httpx/`, `backend/internal/postgres/` — JSON, error envelope, locale accessor; pool and integration-test helper.
- `backend/internal/account/` — optional-user accessor wired as the viewer function; `users` table for the FK.
- `backend/cmd/what-the-flag/main.go`, `frontend/src/app/router.tsx`, `frontend/src/lib/api.ts`, `frontend/src/lib/i18n/` — wiring, routes, API client, `useMessages()`.

## Open questions / Risks

- Look-alike flags (Monaco/Indonesia, Chad/Romania) can share one `*_flag` question. Recommended: accept it; else add a look-alike exclusion list to `Generate`.
- The foundation names the landing component and the locale accessor; this plan assumes `LandingPage.tsx` and a `httpx` locale function returning `"de"` or `"en"`.
- IDs are `github.com/google/uuid.UUID`. If the foundation's sqlc config emits `pgtype.UUID`, `store.go` converts at the boundary.

## Phase 1: Practice set and first question

**Depends on**: none

### Context

- `backend/internal/country/`, `backend/internal/httpx/`, `backend/internal/account/`, `backend/internal/postgres/`, `backend/cmd/what-the-flag/main.go` — see Inventory.

### What to build

- `database/migrations/000004_quiz.up.sql` with all four tables; `backend/internal/quiz/model.go`, `backend/internal/quiz/catalogue.go`, `backend/internal/quiz/generate.go`.
- `backend/sqlc/queries/quiz.sql`: insert set, questions, round; lock round; load questions and answers; serve. Regenerated `backend/internal/db/`.
- `backend/internal/quiz/store.go`, `backend/internal/quiz/service.go` (`NewService`, `CreateSet`, `StartPractice`, `State`), `backend/internal/quiz/present.go`, `backend/internal/quiz/handler.go` (`POST /api/practice`, `GET /api/rounds/{id}`).
- `backend/cmd/what-the-flag/main.go`: build the service with a ChaCha8 source seeded from `crypto/rand`, register the handler.
- Tests: `backend/internal/quiz/generate_test.go`, `backend/internal/quiz/fake_store_test.go`, `backend/internal/quiz/service_test.go`, `backend/internal/quiz/handler_test.go`, `backend/internal/quiz/store_integration_test.go`.
- `backend/internal/quiz/generate_test.go` runs the real catalogue over seeds 0–999. A literal tiny pool pins fallback, duplicate text and other capitals.

### Acceptance criteria

- [ ] Unit (pure): `cd backend && go test ./internal/quiz -run TestGenerate` passes every rule of Generation above. It also sees all modes and indices, and one seed yields one set.
- [ ] Service: `cd backend && go test ./internal/quiz -run TestRoundServe` passes: first read serves position 0, a reload returns the same deadline.
- [ ] Handler: `cd backend && go test ./internal/quiz -run TestHandlerState` passes: flag and text prompt JSON in `de` and `en`, no codes in the body.
- [ ] Integration: `cd backend && go test -tags=integration -race ./internal/quiz -run TestStoreSet` passes: set, questions and round round-trip; concurrent serves leave one answer row.
- [ ] `make check` passes.

## Phase 2: Answers, clock and summary

**Depends on**: 1

### Context

- `backend/internal/quiz/service.go — State()`, `backend/internal/quiz/store.go — InRound()` — read event and locked round transaction.

### What to build

- `backend/sqlc/queries/quiz.sql`: resolve answer, finish round; regenerated `backend/internal/db/`.
- `backend/internal/quiz/service.go`: `Answer`, timeout materialisation in `State`, `Summary`, `OnFinished`, the `FinishHook` call on finish.
- `backend/internal/quiz/store.go`, `backend/internal/quiz/fake_store_test.go`: `Resolve`, `Finish`, `Tx()`; the fake discards changes when `fn` errors.
- `backend/internal/quiz/present.go`, `backend/internal/quiz/handler.go`: `POST /api/rounds/{id}/answers`, summary JSON, error mapping.
- Tests: `backend/internal/quiz/service_test.go`, `backend/internal/quiz/handler_test.go`, `backend/internal/quiz/store_integration_test.go`.

### Acceptance criteria

- [ ] Service: `cd backend && go test ./internal/quiz -run TestRoundAnswer` passes. Cases: answers at 19 s, 21.5 s and 22.001 s; null option; reload after expiry.
  Further cases: double answer, wrong position, option 4, finished immutability, hook runs once, hook error rolls back.
- [ ] Handler: `cd backend && go test ./internal/quiz -run TestHandlerAnswer` passes: answer result and summary JSON, `invalid_option` carries field `option`.
- [ ] Integration: `cd backend && go test -tags=integration -race ./internal/quiz -run TestStoreFinish` passes: a failing hook leaves the last answer open and `finished_at` NULL.
- [ ] Demo: `curl -s -X POST -H 'Content-Type: application/json' -H 'Origin: http://localhost:8080' localhost:8080/api/rounds/<id>/answers -d '{"position":0,"option":1}'` prints an answer result with `correctOption`.
- [ ] `make check` passes.

## Phase 3: Play feature and practice page

**Depends on**: 2

### Context

- `frontend/src/lib/api.ts`, `frontend/src/lib/i18n/`, `frontend/src/app/router.tsx` — API client, messages, route table.
- `frontend/src/features/landing/LandingPage.tsx` — gets the start button.

### What to build

- shadcn `button`, `card` and `progress`, each added with `pnpm dlx shadcn@latest add <name>` only when missing from `frontend/src/components/ui/`.
- `frontend/src/features/play/api.ts`: `getRound()`, `answerQuestion()`, Zod schemas of the wire format.
- `frontend/src/features/play/useRound.ts`: query, answer mutation, clock offset.
- `frontend/src/features/play/Play.tsx`, `frontend/src/features/play/QuestionCard.tsx` (six modes, flag `<img>`, 2×2 option grid).
- `frontend/src/features/play/Countdown.tsx`, `frontend/src/features/play/RoundSummary.tsx`, `frontend/src/features/play/messages.ts` (per-mode questions, reveal, summary).
- `frontend/src/features/landing/api.ts — startPractice()`, `frontend/src/features/landing/LandingPage.tsx` button, `frontend/src/features/landing/messages.ts` label.
- `frontend/src/app/router.tsx`: route `/practice/:roundId` to `frontend/src/features/play/PracticePage.tsx`, which renders `Play` and links to `/`.
- Tests: `frontend/src/features/play/fakeRoundServer.ts`, `frontend/src/features/play/Play.test.tsx` (fake timers).

### Acceptance criteria

- [ ] Component: `cd frontend && pnpm vitest run src/features/play` passes: reveal and advance, timeout posts `option: null`, resume, summary, one `onFinished`.
- [ ] Demo: `make up`, then the landing button opens `/practice/<roundId>` and ten questions play to the summary.
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

- [ ] Service: `cd backend && go test ./internal/quiz -run TestRoundOwner` passes: start twice returns one round, owner reads it, another user and anonymous get `ErrRoundNotFound`.
- [ ] Integration: `cd backend && go test -tags=integration -race ./internal/quiz -run TestStoreCleanup` passes: only practice sets older than 7 days vanish, with their rounds and answers.
- [ ] Integration: `cd backend && go test -tags=integration -race ./internal/quiz -run TestStoreUserCascade` passes: deleting a user deletes their rounds and answers.
- [ ] `make check` passes.
