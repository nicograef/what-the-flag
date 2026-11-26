# Plan: Quiz

> Source PRD: docs/prds/prd-rebuild.md (Domain modules, Question rules, Quiz and run rules, Leaderboards, Sharing, Abuse protection, HTTP contract, Frontend)

## Goal

A visitor enters a name and plays a run until the first wrong or late answer, from easy to hard questions.
Every run plays a stored quiz that a challenge link replays. A global and a per-quiz leaderboard rank the runs.
The quiz engine is a pure Go domain core; Postgres and HTTP are adapters around it.

## Architectural decisions

### Packages and boundary

| Package | Holds | May import |
| --- | --- | --- |
| `backend/internal/quiz` | Domain core: types, generation, name rules, run state machine, ports, `Service` | stdlib, `internal/country`, `github.com/google/uuid`, `golang.org/x/text/unicode/norm` |
| `backend/internal/quiz/postgres` | Repository and leaderboard adapter, sqlc output in `internal/quiz/postgres/internal/db` | pgx, sqlc output, `internal/quiz` |
| `backend/internal/quiz/httpapi` | Handler, presenter, error table | `net/http`, `internal/httpx`, `internal/ratelimit`, `internal/quiz` |
| `backend/internal/ratelimit` | Token buckets per client key | stdlib |

- `backend/.golangci.yml` gains a `depguard` rule `quiz-domain` for files in `internal/quiz/*.go`. It denies `net/http`, `github.com/jackc/pgx`, `internal/httpx`, `internal/postgres` and `internal/quiz/postgres`.
- `AGENTS.md` § Backend: a domain is a pure core in `internal/<domain>/` with adapters `internal/<domain>/postgres` and `internal/<domain>/httpapi`.
  The contract file stays `internal/contract/<domain>_integration_test.go`, here `quiz_integration_test.go`.
- `backend/internal/app/app.go — New()` loads the catalogue, builds the adapters and the service, and registers `httpapi`.
  It panics if `country.Load()` fails, since the dataset is embedded.

### Question types and tiers (`backend/internal/quiz/question.go`)

- `type Attr string`: `AttrName`, `AttrFlag`, `AttrCapital`, `AttrRegion`, `AttrLanguage`, `AttrCurrency`.
- `type QuestionType struct{ Prompt, Answer Attr; Tier int }`; `var Types []QuestionType` holds exactly these 15:

| Tier | Types (prompt → answer) |
| --- | --- |
| 1 | flag → name, name → flag, name → region |
| 2 | name → capital, capital → name, flag → region, name → currency |
| 3 | flag → capital, capital → flag, name → language, capital → region |
| 4 | flag → currency, flag → language, capital → currency, capital → language |

- A type's id is `<prompt>_<answer>`, e.g. `flag_capital`. The API sends it so the client words the question.
- Country-valued answers (name, flag, capital) have four countries as options. Value-valued answers (region, language, currency) have four codes.
- `Question struct{ Type QuestionType; Target string; Options [4]string; Correct int }`: `Target` is an alpha-2 code; options are alpha-2 codes or attribute codes.

### Generation (`backend/internal/quiz/generate.go`)

- `Generate(cat Catalogue, position int, used map[string]bool, rnd Rand) (Question, error)`, a pure function.
  `Catalogue` is a port over `country.Catalogue`: `Pool()`, `Label()`. `Rand` is a port: `IntN(n int) int`, `Shuffle(n int, swap func(i, j int))`.
- Progression: `maxTier = min(4, 1 + position/5)`, `maxFame = min(3, 1 + position/8)`.
  The target is drawn from unused countries with `Fame ≤ maxFame`, else from all unused ones. The type is drawn from types with `Tier ≤ maxTier`.
- No unused country left returns `ErrQuizExhausted`; the run then ends `completed`.
- Country-valued answers:
  - Candidates are the target's region minus the target if it holds ≥ 8 pool countries, then the rest of the pool, each shuffled.
  - Take the first 3 whose answer text differs from all picked texts in both languages.
  - A flag prompt or flag answer also skips any candidate in the `Lookalikes` of the target or a picked one.
- Value-valued answers: the correct option is one random value of the target. Distractors are 3 values the target does not have.
  They come from countries of the target's region first, then the whole pool, with distinct labels.
- Fewer than 3 distractors fall back to another allowed type; none left returns `ErrPoolTooSmall`.
  Options are shuffled; `Correct` is the correct option's index.

### Name rules (`backend/internal/quiz/name.go`)

- `NormalizeName(raw string) (string, error)`: NFKC (`norm.NFKC`), trim, collapse whitespace runs to one space.
  It returns `ErrInvalidName` when the result is empty, holds over 20 runes, or holds a rune other than these:
  letters, combining marks, digits, space, `_`, `-`, `.`.

### Run state machine (`backend/internal/quiz/run.go`)

`Limit = 15 * time.Second`, `Grace = 2 * time.Second`, `MinAnswer = 300 * time.Millisecond`. "Late" means `now > servedAt + Limit + Grace`.

- `Run` holds id, quiz id, name, creator flag, score, start and end time, end reason, hidden flag and its answers.
- `Answer` holds position, `ServedAt`, `AnsweredAt`, `Option *int` and `Correct *bool`; at most one is open (`Correct == nil`).
- `(r *Run) Expire(now)`: an open, late answer becomes `Correct = false`, the rest nil. The run ends `timeout` at `servedAt + 17 s`.
- `(r *Run) Serve(position, now)`: opens the answer at `position == r.Score`; only while playing with no open answer.
- `(r *Run) Answer(position int, option *int, correctIndex int, now time.Time) (Outcome, error)`, after `Expire`:

| State | Event | Result |
| --- | --- | --- |
| playing, open `p` | answer `p`, correct, at ≥ 300 ms | `Correct = true`, `Score + 1` |
| playing, open `p` | answer `p`, correct, under 300 ms | `Correct = false`, the run ends `wrong` at `now` |
| playing, open `p` | answer `p`, wrong option | `Correct = false`, the run ends `wrong` at `now` |
| playing, open `p` | answer `p`, null option | `Correct = false`, the run ends `timeout` at `now`, `timedOut: true` |
| any | answer `q`, `q` resolved | the stored outcome, nothing changes |
| any | answer `q`, `q` never served | `ErrNotCurrentQuestion` |
| any | option outside 0..3 | `ErrInvalidOption` |

- An answer arriving after expiry gets the stored timeout outcome with `timedOut: true`.

### Ports and service (`backend/internal/quiz/service.go`)

| Port | Methods |
| --- | --- |
| `Repository` | `CreateQuiz(ctx, now) (QuizID, error)`; `CreateRun(ctx, Run) error`; `QuizExists(ctx, QuizID) (bool, error)`; `InRun(ctx, RunID, func(UnitOfWork) error) error` |
| `UnitOfWork` (one transaction, run row locked) | `Run() *Run`; `Question(position) (Question, bool, error)`; `AddQuestion(position, Question) (Question, error)`; `Targets() (map[string]bool, error)`; `SaveRun(*Run) error` |
| `Leaderboards` | `Global(ctx, now, own *RunID) ([]Entry, error)`; `Quiz(ctx, QuizID, now, own *RunID) ([]Entry, error)`; `Creator(ctx, QuizID, now) (CreatorView, error)`; `Ranks(ctx, RunID, now) (Ranks, error)` |
| `Clock`, `Rand` | `Now() time.Time`; see Generation |

- `AddQuestion` stores the question unless another run stored that position first. It returns the stored one either way, so two runs on one quiz always agree.
- `Service` methods: `Start(ctx, name string, quiz *QuizID) (RunID, QuizID, error)`, `State(ctx, RunID) (RunState, error)`, `Answer(ctx, RunID, position int, option *int) (Outcome, error)`, `Challenge(ctx, QuizID, own *RunID)`, `Global(ctx, own *RunID)`.
- `Start` without a quiz creates one and a creator run. With a quiz it creates a non-creator run; an unknown quiz is `ErrQuizNotFound`.
- `State` runs `InRun`: expire, then serve the next position, using the stored question or generating and adding one.
- Errors: `ErrInvalidName`, `ErrQuizNotFound`, `ErrRunNotFound`, `ErrNotCurrentQuestion`, `ErrInvalidOption`, `ErrQuizExhausted`, `ErrPoolTooSmall`.
- `backend/internal/quiz/memory_test.go`: an in-memory `Repository` and `Leaderboards` for the core's tests; no lock, no rollback.

### Schema (`database/migrations/000002_quiz.up.sql`, wrapped in `BEGIN; … COMMIT;`)

| Table | Columns and constraints |
| --- | --- |
| `quizzes` | `id uuid PK DEFAULT gen_random_uuid()`, `created_at timestamptz NOT NULL` |
| `quiz_questions` | `quiz_id uuid REFERENCES quizzes`, `position smallint CHECK (position >= 0)`, `type text NOT NULL CHECK (15 ids)`, `target text NOT NULL`, `options text[] NOT NULL CHECK (cardinality(options) = 4)`, `correct_index smallint NOT NULL CHECK (correct_index BETWEEN 0 AND 3)`; PK `(quiz_id, position)` |
| `runs` | `id uuid PK DEFAULT gen_random_uuid()`, `quiz_id uuid NOT NULL REFERENCES quizzes`, `name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 20)`, `creator boolean NOT NULL`, `started_at timestamptz NOT NULL`, `score integer NOT NULL DEFAULT 0 CHECK (score >= 0)`, `finished_at timestamptz NULL`, `end_reason text NULL CHECK (end_reason IN ('wrong','timeout','completed'))`, `hidden boolean NOT NULL DEFAULT false`, `CHECK ((finished_at IS NULL) = (end_reason IS NULL))`; unique index `runs_one_creator (quiz_id) WHERE creator`; index `(quiz_id, score DESC)` |
| `run_answers` | `run_id uuid REFERENCES runs`, `position smallint`, `served_at timestamptz NOT NULL`, `answered_at timestamptz NULL`, `option_index smallint NULL CHECK (option_index BETWEEN 0 AND 3)`, `correct boolean NULL`; PK `(run_id, position)`; unique index `run_answers_one_open (run_id) WHERE correct IS NULL` |

- No `ON DELETE CASCADE`: nothing is deleted automatically. The owner hides, never deletes.
- Timestamps come from the injected clock, truncated to µs; no SQL `now()`.

### Leaderboard queries (`backend/sqlc/queries/quiz.sql`)

- An effective result counts an expired open answer as ended. `ended_at = coalesce(finished_at, served_at + interval '17 seconds')` when that instant is before `@now`.
  A run without an answer row, or with an open answer not yet late, is not ended.
- Global: ended, `creator`, not `hidden`. Quiz: ended runs of that quiz, not `hidden`.
- Order `score DESC, ended_at ASC, id ASC`; `rank() OVER (ORDER BY score DESC)`; at most 100 rows.
- `own` marks the requester's row with `"own": true`. A run's ranks are computed the same way; `global` is null for non-creators.
- Creator view: the creator run's name, score and whether it has ended.

### Rate limit (`backend/internal/ratelimit/`)

- `New(burst int, every time.Duration, now func() time.Time) *Limiter`, `(l *Limiter) Allow(key string) (ok bool, retryAfter time.Duration)`. Full buckets are pruned at most once a minute.
- `ClientKey(r *http.Request) string`: the last `X-Forwarded-For` entry, else the host of `RemoteAddr`. IPv6 is masked to its /64.
  Caddy's `reverse_proxy` sets that header from the client connection; verify against the Caddy docs at execution.
- `POST /api/runs` checks a per-key limiter (burst 60, one more every 5 s) and a global one under key `""` (burst 600, one more every 100 ms).
- A refusal is 429 `rate_limited` with `Retry-After` in whole seconds, rounded up. It runs before the body is read.

### HTTP (`backend/internal/quiz/httpapi`)

| Route | Body or query | Response |
| --- | --- | --- |
| `POST /api/runs` | `{"name": "…", "quizId": "…"?}` | 201 `{"runId", "quizId"}` |
| `GET /api/runs/{id}` | — | 200 run state |
| `POST /api/runs/{id}/answers` | `{"position": 0, "option": 2}`; `option` null = no answer | 200 outcome |
| `GET /api/quizzes/{id}` | optional `run=<id>` | 200 `{"id", "creator": {"name", "score", "ended"}, "top": [...]}` |
| `GET /api/leaderboard` | optional `run=<id>` | 200 `{"top": [...]}` |

| Field | Meaning |
| --- | --- |
| run state | `{"id","quizId","name","status","score","serverNow","question","result"}`; `status` is `playing` or `finished` |
| `question` | null or `{"position","type","prompt","options","deadline"}`; `deadline = served_at + 15 s` |
| `prompt`, each option | `{"kind":"flag","flagKey":"…"}` or `{"kind":"text","text":{"de","en"}}` |
| `result` | null or `{"score","endReason","last","quizRank","globalRank"}`; `last` is null or the missed question with `correctOption` and `chosenOption`; `globalRank` is null for non-creators |
| outcome | `{"position","correct","timedOut","chosenOption","correctOption","finished","score"}` |
| a `top` row | `{"rank","name","score","own"}`; `own` only when `run` names that row |

- A playing state carries no correct option and no target. No payload holds an alpha-2 code: flags travel as flag keys, texts as labels.
- `run` in a query that is unknown or unparsable is ignored. No response carries another run's id.

| Error | Status | Code | Field |
| --- | --- | --- | --- |
| `ErrInvalidName` | 400 | `invalid_name` | `name` |
| `ErrQuizNotFound`, also an unparsable `{id}` or `quizId` | 404 | `quiz_not_found` | |
| `ErrRunNotFound`, also an unparsable `{id}` | 404 | `run_not_found` | |
| `ErrNotCurrentQuestion` | 409 | `not_current_question` | |
| `ErrInvalidOption` | 400 | `invalid_option` | `option` |
| rate limit refusal | 429 | `rate_limited` | |

### Frontend

| Feature | Files | Route |
| --- | --- | --- |
| `play` | `api.ts`, `use-run.ts`, `name-form.tsx`, `home-page.tsx`, `play-page.tsx`, `question-card.tsx`, `countdown.tsx`, `run-result.tsx`, `share-button.tsx`, `personal-best.ts`, `messages.ts` | `/`, `/play/:runId` |
| `challenge` | `api.ts`, `challenge-page.tsx`, `messages.ts` | `/q/:quizId` |
| `leaderboard` | `api.ts`, `leaderboard-page.tsx`, `ranking-table.tsx`, `messages.ts` | `/leaderboard` |

- `NameForm({ quizId? })` owns `startRun` from play's `api.ts`. The challenge page renders it, so every call stays in its feature.
  It is prefilled from `localStorage` key `wtf.name` and notes that the name appears publicly. `invalid_name` shows under the field.
- `rate_limited` maps in `frontend/src/lib/i18n/error-messages.ts`, since two features can meet it.
- Remaining = `(deadline − serverNow) − (performance.now() − receivedAt)`, recomputed on a 100 ms tick; the wall clock is never read.
  A correct answer is revealed for 800 ms, then a refetch serves the next question. At zero remaining the client posts `option: null`.
- Query key `['run', runId]`, `staleTime: Infinity`, `refetchOnWindowFocus: false`, disabled during the reveal.
- `RunResult` shows the score, the end reason, the missed question with both options marked, and the quiz and global ranks.
  It also shows the personal best and "new personal best" from `localStorage` key `wtf.best`, plus "play again" (same name, fresh quiz) and the share button.
- `ShareButton`: `navigator.share({ text, url })` when present, else `navigator.clipboard.writeText`. Text per locale: "I answered {score} questions about the world. Can you beat it?". The url is `/q/<quizId>`.
- The challenge page shows the creator's name and score, or "{name} is still playing". Below are the quiz's ranking and the name form.
- `RankingTable` serves both the challenge and the global list; the `own` row is highlighted.
- Navbar: a leaderboard link before the language switch. Tests spy on `performance.now`; no `now` prop.
- `frontend/index.html`: Open Graph and Twitter card tags with a fixed title, description and `frontend/public/og.png` (1200×630).
- The landing tracer (`frontend/src/features/landing/api.ts — getHealth()`) and `FakeApi`'s default `GET /api/me` reply go.

### Owner commands

- `database/stats.sql`: runs per day for 14 days, the share of runs from challenge links, the share of names with more than one run, the median score, and the 20 fastest mean answer times with run ids.
- `make stats` and `make hide RUN=<uuid>` (`UPDATE runs SET hidden = true`) run `psql` in the dev `postgres` container. They sit in `CLASS_developer`.
- `make prod-stats` and `make prod-hide RUN=<uuid>` do the same through `docker-compose.prod.yml`. They sit in `CLASS_production`.

## Inventory

- `backend/internal/country — Catalogue.Pool(), Catalogue.Label(), Country` (country-attributes) — the pool and labels.
- `backend/internal/httpx — ReadJSON(), WriteJSON(), MapError()`, `backend/internal/postgres — TestPool(), TestTx()`, `backend/internal/app/app.go — New()`, `backend/.golangci.yml` (foundation).
- `backend/internal/contract/harness_integration_test.go — newServer(), newClient(), decode(), expectError()` (foundation). Its TLS server and cookie jar exist for a cookie that no longer exists.
- `frontend/src/lib/api.ts`, `frontend/src/lib/i18n/`, `frontend/src/test/ — FakeApi, renderRoute()`, `frontend/src/app/{router,navbar,messages}.tsx` (foundation).

## Open questions / Risks

- Tier and fame thresholds are guesses. `make stats` shows where runs end; the constants move after the beta.
- A determined bot with a lookup table still plays perfectly. The PRD accepts that; `make hide` removes it.
- The rate limiter lives in process memory. A restart resets it; one backend instance runs.
- `math/rand/v2` in the `Rand` adapter can trip gosec G404. A scoped `//nolint:gosec` names the reason: ChaCha8 seeded from `crypto/rand`, no secret depends on it.

## Phase 1: Domain core

**Depends on**: none

### Context

- `backend/internal/country — Catalogue`, `backend/.golangci.yml`, `AGENTS.md` § Backend.

### What to build

- `backend/internal/quiz/question.go`, `generate.go`, `name.go`, `run.go`, `service.go`, `errors.go`, `ports.go`.
- `backend/internal/quiz/memory_test.go`: in-memory `Repository` and `Leaderboards`.
- `backend/.golangci.yml`: the `quiz-domain` depguard rule. `AGENTS.md` § Backend: the domain and adapter layout.
- `backend/internal/quiz/generate_test.go — TestGenerate`: the real catalogue, 2000 runs of positions 0 to the pool size, each with its own seed.
  For every question:
  - 4 distinct options, and `Options[Correct]` is the target or one of its values;
  - no distractor is true for the target;
  - distinct texts per language;
  - no look-alike pair in a flag type;
  - the tier ≤ `maxTier` and the fame ≤ `maxFame` while unused famous countries remain;
  - no target repeats within a run.
  Every one of the 15 types occurs. A literal 5-country catalogue pins `ErrQuizExhausted`, the fallback to another type and `ErrPoolTooSmall`.
- `backend/internal/quiz/name_test.go — TestNormalizeName`: one table covering:
  - length 0, 1, 20 and 21 runes;
  - an NFD umlaut, full-width letters and a Hindi name;
  - whitespace collapsing and a forbidden rune.
- `backend/internal/quiz/run_test.go — TestRun`: one table over the state machine rows, the 300 ms rule, expiry at 17 s, a late answer's stored timeout, and completion at `ErrQuizExhausted`.
- `backend/internal/quiz/service_test.go — TestService`: on the in-memory adapters:
  - `Start` with and without a quiz, and an unknown quiz;
  - `State` serves position 0, keeps it on a second read and serves a new position after a correct answer;
  - a second run on the quiz gets the first run's stored questions.

### Acceptance criteria

- [ ] Core (unit): `cd backend && go test ./internal/quiz`
- [ ] The boundary holds: `cd backend && ! go list -deps ./internal/quiz | grep -qE '^(net/http|github.com/jackc/pgx)'`
- [ ] depguard catches a violation: `f=backend/internal/quiz/zz_probe.go; printf 'package quiz\n\nimport _ "net/http"\n' > $f; ! (cd backend && golangci-lint run ./internal/quiz/...); rc=$?; rm $f; exit $rc`
- [ ] `make check` passes.

## Phase 2: Postgres and HTTP adapters

**Depends on**: 1

### Context

- `backend/internal/quiz — ports.go, service.go`, `backend/internal/app/app.go — New()`, `backend/internal/contract/harness_integration_test.go`. Integration criteria need `make db` running.

### What to build

- `database/migrations/000002_quiz.up.sql`; `backend/sqlc.yaml` (quiz block, output `internal/quiz/postgres/internal/db`); `backend/sqlc/queries/quiz.sql` without the leaderboard queries.
- `backend/internal/quiz/postgres/repository.go — NewRepository(db DB)`; `backend/internal/quiz/postgres/rand.go` (ChaCha8 from `crypto/rand`, guarded by a mutex); `Clock` via `time.Now`.
- `backend/internal/quiz/httpapi/handler.go`, `present.go`, `errors.go`: the three run routes without the rate limit; `backend/internal/app/app.go — New()` wiring.
- `backend/internal/contract/harness_integration_test.go`: `httptest.NewServer` without TLS and cookie jar; comments true again.
- `backend/internal/quiz/postgres/repository_integration_test.go`:
  - `TestAddQuestionRace`: two transactions add one position; both return the same question;
  - `TestInRunConcurrent`: 10 concurrent reads of one run serve position 0 once.
- `backend/internal/contract/quiz_integration_test.go — correctOption(t, runID, position)` reads `correct_index` with one query on the test pool.
  - `TestRun`: start, read position 0, two correct answers score 2, a wrong one ends the run with `last` and `correctOption`. A repeat returns the stored outcome.
  - `TestRunErrors`: a blank name, an unknown `quizId`, an unknown and an unparsable run id, a never-served position and option 4 each give their error row.
  - `TestRunOnQuiz`: a second run with the first run's `quizId` gets the same first question.
  - No JSON string in these tests equals a pool code.
- `docs/decisions.md`: `D09`: questions are generated when first served and stored per quiz. Reason: a shared quiz stays identical, and stored questions show where people fail.

### Acceptance criteria

- [ ] Adapter (Postgres): `make db-migrate && cd backend && go test -tags=integration -race ./internal/quiz/postgres`
- [ ] Contract: `make db-migrate && cd backend && go test -tags=integration ./internal/contract -run 'TestRun'`
- [ ] `make check` passes.

## Phase 3: Leaderboards, challenge view, rate limit and owner commands

**Depends on**: 2

### Context

- `backend/sqlc/queries/quiz.sql`, `backend/internal/quiz/postgres/`, `backend/internal/quiz/httpapi/`, `Makefile — CLASS_developer, CLASS_production`. Integration criteria need `make db` running.

### What to build

- `backend/sqlc/queries/quiz.sql`: the leaderboard, ranks and creator queries; `backend/internal/quiz/postgres/leaderboards.go`.
- `backend/internal/quiz/service.go`: ranks in the result, `Challenge`, `Global`; `httpapi`: `GET /api/quizzes/{id}`, `GET /api/leaderboard`, ranks in `result`.
- `backend/internal/ratelimit/limiter.go` and `limiter_test.go — TestAllow` (burst, refill, `retryAfter`, pruning), `TestClientKey` (forwarded IPv4, IPv6 /64, `RemoteAddr`).
  The limiters on `POST /api/runs`.
- `database/stats.sql`; `Makefile`: `stats`, `hide`, `prod-stats`, `prod-hide`.
- `backend/internal/quiz/postgres/leaderboards_integration_test.go`, on `postgres.TestTx(t)`, with its own runs at scores ≥ 10000:
  - equal scores share a rank, and ties order by earlier end;
  - the 101st row is cut;
  - a hidden run and an unended run are absent;
  - a non-creator is absent from the global list;
  - an open answer older than 17 s counts as ended at `served_at + 17 s`;
  - `own` marks only the requester's row.
- `backend/internal/contract/quiz_integration_test.go`:
  - `TestChallenge`: the creator's view, `"ended": false` while it plays, then its score; a challenger's run appears on the quiz list only.
  - `TestRateLimit`: 61 starts from one client give 60 × 201, then 429 `rate_limited` with `Retry-After`; a second client still gets 201.
- `docs/decisions.md`: `D10`: the client key is the last `X-Forwarded-For` hop, IPv6 per /64. Reason: Caddy sets that hop, and one home or school network holds one /64.

### Acceptance criteria

- [ ] Leaderboards (Postgres): `make db-migrate && cd backend && go test -tags=integration -race ./internal/quiz/postgres -run Leaderboard`
- [ ] Limiter (unit): `cd backend && go test ./internal/ratelimit`
- [ ] Contract: `make db-migrate && cd backend && go test -tags=integration ./internal/contract -run 'TestChallenge|TestRateLimit'`
- [ ] Owner commands run: `make stats >/dev/null && ! make hide RUN=not-a-uuid 2>/dev/null`
- [ ] `! make help | grep -q UNCLASSIFIED`
- [ ] `make check` passes.

## Phase 4: Play feature

**Depends on**: 3

### Context

- `frontend/src/lib/api.ts`, `frontend/src/lib/i18n/`, `frontend/src/test/`, `frontend/src/app/router.tsx`, `frontend/src/features/landing/`.

### What to build

- shadcn `card`, `input` and `progress` via `cd frontend && pnpm dlx shadcn@latest add <name>`, only if missing; `frontend/package.json`, `frontend/pnpm-lock.yaml` as the CLI changes them.
- `frontend/src/features/play/` per the frontend decisions, except the challenge use of `NameForm`.
- `frontend/src/app/router.tsx`: `/` to `HomePage`, `/play/:runId` to `PlayPage`. `frontend/src/features/landing/` keeps only `not-found-page.tsx` and its messages.
- `frontend/src/lib/i18n/error-messages.ts`: `rate_limited`. `frontend/src/test/fake-api.ts`: no default reply.
- `frontend/src/features/play/fake-run.ts — fakeRun(api, questions)`: a stateful run on top of `FakeApi.respond()`.
- `frontend/src/features/play/play.test.tsx` (`vi.spyOn(performance, "now")`, `waitFor`, no fake timers):
  - a correct answer reveals, then the next question shows;
  - a wrong answer shows the missed question and the result with both ranks;
  - zero remaining posts `option: null`;
  - resume keeps question and deadline;
  - a new personal best is stored and announced;
  - "play again" posts the same name without `quizId`;
  - share calls `navigator.share`, else the clipboard, with the `/q/<quizId>` url;
  - a language switch changes the texts and sends no request.
- `frontend/src/features/play/home-page.test.tsx`:
  - the stored name prefills the field;
  - submit navigates to `/play/<id>`;
  - `invalid_name` shows under the field and `rate_limited` its text;
  - an unknown path shows `NotFoundPage`, and the footer links to `NOTICE`.

### Acceptance criteria

- [ ] Component: `pnpm --dir frontend exec vitest run src/features/play`
- [ ] No tracer remains: `! grep -rnE 'useHealth|getHealth|/api/me' frontend/src`
- [ ] With `make db`, `make db-migrate`, `make be` and `make fe` running: `curl -fsS -X POST -H 'Content-Type: application/json' -H 'Origin: http://localhost:5173' -d '{"name":"probe"}' localhost:5173/api/runs | jq -e '.runId and .quizId'`
- [ ] `make check` passes.

## Phase 5: Challenge page, leaderboard page and link preview

**Depends on**: 4

### Context

- `frontend/src/features/play/name-form.tsx`, `frontend/src/features/play/run-result.tsx`, `frontend/src/app/{router,navbar,messages}.tsx`, `frontend/index.html`, `frontend/public/`.

### What to build

- shadcn `table` via the CLI, only if missing.
- `frontend/src/features/challenge/` and `frontend/src/features/leaderboard/` per the frontend decisions; `RankingTable` lives in `leaderboard/` and the challenge page imports it.
- `frontend/src/app/router.tsx`: `/q/:quizId`, `/leaderboard`. `frontend/src/app/navbar.tsx` and `messages.ts`: the leaderboard link.
- `frontend/src/features/play/run-result.tsx`: links to `/leaderboard?run=<id>` and `/q/<quizId>?run=<id>`.
- `frontend/index.html`: the Open Graph and Twitter card tags; `frontend/public/og.png`, 1200×630, the brand on a plain background.
- `frontend/src/features/challenge/challenge-page.test.tsx`:
  - the creator's score, or the "still playing" text;
  - the quiz ranking with the `own` row highlighted;
  - the name form starts a run with that `quizId`;
  - an unknown quiz shows its `quiz_not_found` text.
- `frontend/src/features/leaderboard/leaderboard-page.test.tsx`: the global list, the `own` row from `?run=`, an empty list's hint, and the navbar link leading there.

### Acceptance criteria

- [ ] Component: `pnpm --dir frontend exec vitest run src/features/challenge src/features/leaderboard`
- [ ] Preview tags: `grep -q 'property="og:image"' frontend/index.html && test -f frontend/public/og.png`
- [ ] `make check` passes.
