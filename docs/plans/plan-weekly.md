# Plan: Weekly challenge

> Source PRD: `docs/prds/prd-rebuild.md` (section "Weekly challenge")

## Goal

Every user plays one weekly challenge of 20 questions per ISO week in `Europe/Berlin`.
Finishing before the week ends awards 10 points per correct answer. A weekly leaderboard ranks the current and past weeks.
The `/weekly` page and a dashboard card expose it.

## Architectural decisions

| Topic | Decision |
| --- | --- |
| Week | ISO week of `t.In(Europe/Berlin)`. `start` is Monday 00:00 Berlin, `end` the next Monday 00:00 Berlin, exclusive. |
| Week bounds | Built with `time.Date(y, m, d, 0, 0, 0, 0, berlin)` and `d + 7`, never `Add(7 * 24h)`: DST weeks last 167 or 169 hours. |
| Week id | Text form `YYYY-Www`, e.g. `2026-W47`, in URLs and JSON. `ParseWeek` rejects a week the ISO year lacks. |
| Time zone data | `import _ "time/tzdata"` in `backend/internal/weekly/week.go`. Tests and the Alpine image read one embedded database. |
| Module boundary | `weekly` never queries `quiz_sets`, `rounds`, `answers`, `users` or `ledger_entries`. It calls the quiz, account and leaderboard services. |
| Own results | Table `weekly_entries` holds each player's round and result. The weekly leaderboard reads only this table. |
| Ranking | SQL `rank() OVER (ORDER BY correct DESC, total_ms ASC)` over finished entries: equal pairs share a rank, the next skips (1, 1, 3). Display order adds `user_id` as tie-break. |
| Result | `correct` and `total_ms` come from `quiz.FinishedRound`: `Correct` and `TotalAnswerTime` (a timeout counts 22 s, set by quiz). |
| Points | `leaderboard.Service — Award(ctx, tx, userID, leaderboard.KindWeekly, challengeID, 10 × correct)` in the finishing transaction. Zero correct awards nothing. |
| Round per week | One `weekly_entries` row per (challenge, user). Quiz start-or-resume returns the same round. Round and entry commit in one transaction. |
| Week end (R10, PRD) | Starting needs the current week. A round with `FinishedAt >= ends_at` records no result and awards nothing. |
| Start errors | `POST /api/weekly/round` for a week other than the current one: 409 `week_ended`. On a finished entry: 409 `already_played`. |
| Lazy creation | Both `GET /api/weekly` and the leaderboard for the current week ensure the current challenge exists. |
| Past weeks | Field `pastWeeks` of `GET /api/weekly`: weeks with a challenge before the current one, newest first, at most 52. |
| Unknown week | `?week=` naming a past week without a challenge, or a future week: 404 `week_not_found`. Malformed: 400 `invalid_week`, `field: "week"`. |
| Leaderboard size | `LeaderboardLimit = 100` rows, plus the viewer's row in `viewer` when the viewer finished. No pagination. |
| Account deletion (R14) | Entries cascade with the user and the round. The shared weekly quiz set stays. |
| Consumer interfaces | In `service.go`. `Quiz`: `CreateSet(ctx context.Context, tx pgx.Tx, kind quiz.Kind, size int) (uuid.UUID, error)`, `StartRound(ctx context.Context, tx pgx.Tx, setID, userID uuid.UUID) (uuid.UUID, error)`. `Users`: `PublicByIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]account.PublicUser, error)`. `Ledger`: `Award(ctx context.Context, tx pgx.Tx, userID uuid.UUID, kind leaderboard.Kind, sourceID uuid.UUID, points int32) (bool, error)`. |
| JSON | camelCase fields, as quiz and leaderboard use. Responses hold no localised text, so query keys carry no locale (R20). |

### Lazy creation (race-safe)

`Store.EnsureChallenge(ctx, year, week int, start, end time.Time, createSet func(context.Context, pgx.Tx) (uuid.UUID, error)) (Challenge, error)`:

1. `SELECT` the row for (iso_year, iso_week). Found: return it.
2. Else begin a transaction. Call `createSet(ctx, tx)`, i.e. `quiz.Service — CreateSet(ctx, tx, quiz.KindWeekly, quiz.WeeklySize)`, for the quiz set id.
3. `INSERT ... (iso_year, iso_week, quiz_set_id, starts_at, ends_at) ON CONFLICT (iso_year, iso_week) DO NOTHING RETURNING *`.
4. Row returned: commit and return it. No row: a concurrent winner committed first. Roll back, then `SELECT` again and return that row.

The insert blocks while a concurrent creator's row is uncommitted. Under READ COMMITTED, step 4's new `SELECT` sees the committed winner.
The loser's rollback removes its quiz set, so no orphan exists. A winner that rolls back frees the key and the blocked insert succeeds.

### Finish hook

`Service.RoundFinished(ctx, tx pgx.Tx, r quiz.FinishedRound) error` implements `quiz.FinishHook`, registered for `quiz.KindWeekly`:

1. `SELECT e.challenge_id, e.finished_at, c.ends_at FROM weekly_entries e JOIN weekly_challenges c ... WHERE e.round_id = $1 FOR UPDATE OF e`. No row: return nil.
2. `r.FinishedAt >= ends_at` or entry already finished: return nil.
3. `UPDATE weekly_entries SET correct, total_ms, finished_at WHERE round_id = $1 AND finished_at IS NULL`.
4. One row changed and `r.Correct > 0`: `Award`. The ledger's unique key makes a repeat a no-op.

R4's "hook locks its own aggregate row" is the entry row here. A challenge-row lock would serialise every finish of the week.

### Schema `database/migrations/000006_weekly.up.sql`

- `weekly_challenges`: `id uuid PK default uuidv7()`, `iso_year int not null`, `iso_week int not null check (iso_week between 1 and 53)`, `quiz_set_id uuid not null unique references quiz_sets on delete restrict`, `starts_at timestamptz not null`, `ends_at timestamptz not null`, `created_at timestamptz not null default now()`, `unique (iso_year, iso_week)`.
- `weekly_entries`: `challenge_id uuid not null references weekly_challenges`, `user_id uuid not null references users on delete cascade`, `round_id uuid not null unique references rounds on delete cascade`, `started_at timestamptz not null`, `correct int null`, `total_ms int null`, `finished_at timestamptz null`, `primary key (challenge_id, user_id)`, `check (num_nulls(correct, total_ms, finished_at) in (0, 3))`.
- Index `weekly_entries (challenge_id, correct desc, total_ms) where finished_at is not null`.

### HTTP (all wrapped in the `requireUser` middleware)

| Route | Response |
| --- | --- |
| `GET /api/weekly` | `{week, startsAt, endsAt, state: "not_started"\|"in_progress"\|"finished", roundId?, correct?, totalMs?, pastWeeks: [week]}` |
| `POST /api/weekly/round` | body `{week}`; 200 `{roundId}`; 409 `week_ended` or `already_played`; 400 `invalid_week` |
| `GET /api/weekly/leaderboard?week=` | `{week, startsAt, endsAt, rows: [{rank, username, emoji, correct, totalMs, isViewer}], viewer: {rank, correct, totalMs} \| null}`; no `week` means current |

## Inventory

- `backend/internal/account — UserID(ctx)`, `account.Handler — RequireUser()`, `account.Service — PublicByIDs()` — auth and leaderboard names (R5).
- `backend/internal/leaderboard — Service.Award()`, `KindWeekly` — points inside the caller's transaction.
- `backend/internal/quiz — Service.CreateSet()`, `Service.StartRound()`, `Service.OnFinished()`, `FinishHook`, `FinishedRound`, `KindWeekly`, `WeeklySize` (R4).
- `backend/internal/httpx` — `ReadJSON()`, `WriteJSON()`, `Error` envelope.
- `backend/internal/postgres — TestPool()` — integration-test pool.
- `backend/cmd/what-the-flag/main.go` — wiring (choke file).
- `frontend/src/lib/api.ts — useApiClient()`, `frontend/src/test/render.tsx — renderRoute()` — client and the only test seam (R18).
- `frontend/src/features/play/play.tsx — Play({ roundId, onFinished })` — the shared play component.
- `frontend/src/features/auth/require-user.tsx` — protected-route wrapper.
- `frontend/src/app/router.tsx` — route table (choke file).
- `frontend/src/features/dashboard/dashboard-page.tsx` — renders `<section data-slot="weekly" />` as the first grid child (R7).

## Open questions / Risks

- Phase 5 needs the duels plan's dashboard phase ("Dashboard and challenge") landed. The programme orders it after that phase.
- `backend/internal/db/`, `main.go` and `router.tsx` are shared with the duels lane. Regenerate with `cd backend && go tool sqlc generate` after every rebase.

## Phase 1: Week and challenge

**Depends on**: none

### Context

- `backend/internal/quiz — Service.CreateSet()` — weekly set creation inside the caller's transaction.
- `backend/internal/account — UserID()`, `account.Handler — RequireUser()` — caller identity and route guard.
- `backend/cmd/what-the-flag/main.go` — wiring.

### What to build

- `database/migrations/000006_weekly.up.sql` — both tables and the index above.
- `backend/internal/weekly/week.go` — `WeekOf(t time.Time) (year, week int, start, end time.Time)`, `ParseWeek(s string) (year, week int, err error)`, `FormatWeek(year, week int) string`, the tzdata import.
- `backend/internal/weekly/week_test.go` — table tests with the literal rows below.
- `backend/sqlc/queries/weekly.sql` — challenge by week, insert challenge `ON CONFLICT DO NOTHING`, entry by (challenge, user), past weeks.
- `backend/internal/db/` — regenerated with `cd backend && go tool sqlc generate`.
- `backend/internal/weekly/store.go` — `Store.EnsureChallenge()` per "Lazy creation", `Store.PastWeeks()`, `Store.Entry()`.
- `backend/internal/weekly/service.go` — `Store` and `Quiz` interfaces, injected clock, `Service.Current(ctx, userID)`: week, bounds, state, past weeks. No entry means `not_started`.
- `backend/internal/weekly/handler.go` — `NewHandler(svc, requireUser func(http.Handler) http.Handler)`, `Handler.Register()` with `GET /api/weekly`.
- `backend/internal/weekly/store_integration_test.go` — `//go:build integration`. `TestStore_EnsureChallengeConcurrent`: 8 goroutines on one run-unique week (random `iso_year` ≥ 3000) return one id. Their `createSet` inserts a test-marked `quiz_sets` row; exactly one such row survives.
- `backend/cmd/what-the-flag/main.go` — construct store, service, handler; call `Register`.

| Input (UTC) | Berlin | Week | start (UTC) | end (UTC) |
| --- | --- | --- | --- | --- |
| 2026-12-31T11:00Z | Thu 12:00 | 2026-W53 | 2026-12-27T23:00Z | 2027-01-03T23:00Z |
| 2027-01-03T22:59Z | Sun 23:59 | 2026-W53 | 2026-12-27T23:00Z | 2027-01-03T23:00Z |
| 2027-01-03T23:00Z | Mon 00:00 | 2027-W01 | 2027-01-03T23:00Z | 2027-01-10T23:00Z |
| 2027-03-28T10:00Z | Sun 12:00, spring forward | 2027-W12 | 2027-03-21T23:00Z | 2027-03-28T22:00Z |
| 2027-03-28T22:00Z | Mon 00:00 | 2027-W13 | 2027-03-28T22:00Z | 2027-04-04T22:00Z |
| 2027-10-31T11:00Z | Sun 12:00, fall back | 2027-W43 | 2027-10-24T22:00Z | 2027-10-31T23:00Z |

`ParseWeek` rows: `2026-W47` → (2026, 47); `2026-W53` → (2026, 53); `2027-W53`, `2026-W00`, `2026-W5`, `2026-47` rejected.

### Acceptance criteria

- [ ] `WeekOf` and `ParseWeek` match the tables (unit): `cd backend && go test ./internal/weekly -run 'TestWeekOf|TestParseWeek'`
- [ ] Migration applies: `make db-migrate` exits 0 and prints a `6/u weekly` line
- [ ] Concurrent creation yields one challenge and one set (integration): `cd backend && go test -tags=integration -race ./internal/weekly -run TestStore_EnsureChallengeConcurrent`
- [ ] `make check` passes

## Phase 2: Play the round and award points

**Depends on**: 1

### Context

- `backend/internal/quiz — Service.StartRound()`, `Service.OnFinished()`, `FinishHook`, `FinishedRound` — round start in the caller's transaction and the finish hook.
- `backend/internal/leaderboard — Service.Award()` — points in the finishing transaction.
- `backend/internal/weekly/service.go — Service.Current()` — phase 1 state logic.

### What to build

- `backend/sqlc/queries/weekly.sql` — insert entry `ON CONFLICT (challenge_id, user_id) DO NOTHING`, entry by round `FOR UPDATE OF e`, finish entry `WHERE round_id = $1 AND finished_at IS NULL`.
- `backend/internal/db/` — regenerated.
- `backend/internal/weekly/store.go` — `Store.InTx()`, `Store.AddEntry()`, `Store.LockEntryByRound()`, `Store.FinishEntry()` returning whether a row changed.
- `backend/internal/weekly/service.go` — `Service.StartRound(ctx, userID, week string) (uuid.UUID, error)`: start errors from the decisions table. Else one transaction: `Quiz.StartRound(ctx, tx, setID, userID)` (start or resume), entry insert, commit. `Service.RoundFinished()` per "Finish hook". `Ledger` interface.
- `backend/internal/weekly/service_test.go` — in-memory fakes for store, quiz and ledger, injected clock. `TestService_Round` cases: same round twice while in progress; `already_played` after finish; `week_ended` for last week; `invalid_week`; finish at `ends_at` records nothing; hook run twice awards once; zero correct awards nothing.
- `backend/internal/weekly/store_integration_test.go` — `TestStore_FinishEntryOnce`: a second `FinishEntry` on one round reports no change.
- `backend/internal/weekly/handler.go` — `POST /api/weekly/round`; `GET /api/weekly` reports `in_progress` and `finished`.
- `backend/cmd/what-the-flag/main.go` — `quizService.OnFinished(quiz.KindWeekly, weeklyService)`.

### Acceptance criteria

- [ ] Start, week-end and award rules hold (service): `cd backend && go test ./internal/weekly -run TestService_Round`
- [ ] Finish updates an entry once (integration): `cd backend && go test -tags=integration -race ./internal/weekly -run TestStore_FinishEntryOnce`
- [ ] `make check` passes

## Phase 3: Weekly leaderboard

**Depends on**: 2

### Context

- `backend/internal/account — Service.PublicByIDs()` — username and emoji by user ids.
- `backend/internal/weekly/week.go — ParseWeek()`, `WeekOf()` — the `?week=` value and the current week.

### What to build

- `backend/sqlc/queries/weekly.sql` — ranked finished entries of a challenge, `rank()` as in the decisions table, `ORDER BY rank, user_id LIMIT $2`; the viewer's ranked row from the same CTE.
- `backend/internal/db/` — regenerated.
- `backend/internal/weekly/store.go` — `Store.Ranking(ctx, challengeID, viewerID, limit)`, `Store.ChallengeByWeek()` without creation.
- `backend/internal/weekly/service.go` — `Users` interface, `Service.Leaderboard(ctx, viewerID, week string)`: 400 and 404 rules, current week ensured, `LeaderboardLimit` rows, viewer row, names from `PublicByIDs`. A user missing from the map (deleted meanwhile) is left out, as on the all-time leaderboard.
- `backend/internal/weekly/service_test.go` — `TestService_Leaderboard`: malformed week 400; future and missing past week 404; viewer row marked `isViewer`.
- `backend/internal/weekly/store_integration_test.go` — `TestStore_Ranking` with limit 2: ranks 1, 1, 3 for a tie; lower time first at equal correct; unfinished entries absent; viewer outside the limit still returned.
- `backend/internal/weekly/handler.go` — `GET /api/weekly/leaderboard`.

### Acceptance criteria

- [ ] Week validation and viewer marking hold (service): `cd backend && go test ./internal/weekly -run TestService_Leaderboard`
- [ ] Ranking query ranks, orders and filters (integration): `cd backend && go test -tags=integration -race ./internal/weekly -run TestStore_Ranking`
- [ ] `make check` passes

## Phase 4: Weekly page and card

**Depends on**: 3

### Context

- `frontend/src/lib/api.ts — useApiClient()` and `frontend/src/test/render.tsx — renderRoute()` — client and test seam.
- `frontend/src/features/play/play.tsx — Play()` — plays the round.
- `frontend/src/features/auth/require-user.tsx` — protects `/weekly`.
- `frontend/src/app/router.tsx` — route table.

### What to build

- `frontend/src/features/weekly/api.ts` — Zod schemas; `getWeekly()`, `startWeeklyRound(week)`, `getWeeklyLeaderboard(week?)`.
- `frontend/src/features/weekly/messages.ts` — `{ de, en }` strings.
- `frontend/src/features/weekly/week-countdown.tsx` — time left to `endsAt`; refetches `getWeekly` at zero.
- `frontend/src/features/weekly/weekly-leaderboard.tsx` — rank table, viewer row highlighted, viewer row appended when outside the top rows.
- `frontend/src/features/weekly/week-selector.tsx` — current week plus `pastWeeks`, kept in the `?week=` search param.
- `frontend/src/features/weekly/weekly-page.tsx` — `not_started`: START button, countdown, leaderboard. `in_progress`: `Play`; `onFinished` refetches. `finished`: result and leaderboard. A past week shows its leaderboard only.
- `frontend/src/features/weekly/weekly-card.tsx` — root `<section data-slot="weekly">`, rendered in every query state, so the duels slot test stays green. Content: START, continue, or the result; link to `/weekly`.
- `frontend/src/features/weekly/weekly-page.test.tsx` — `renderRoute('/weekly', { api })` with `api` from `createApiClient({ fetch: fakeFetch, getLocale })`: one case per state and one for a past week.
- `frontend/src/app/router.tsx` — `/weekly` inside the protected routes.

### Acceptance criteria

- [ ] Page renders every state and a past week (component): `cd frontend && pnpm exec vitest run src/features/weekly`
- [ ] `make check` passes

## Phase 5: Dashboard mount

**Depends on**: 4

### Context

- `frontend/src/features/dashboard/dashboard-page.tsx` — the empty weekly slot (R7).
- `frontend/src/features/weekly/weekly-card.tsx` — the card from phase 4.

### What to build

- `frontend/src/features/dashboard/dashboard-page.tsx` — replace the `<section data-slot="weekly" />` element with `<WeeklyCard />`. Nothing else changes.

### Acceptance criteria

- [ ] The card replaces the slot: `grep -c '<WeeklyCard />' frontend/src/features/dashboard/dashboard-page.tsx` prints `1`
- [ ] The duels dashboard tests, the weekly-slot case included, still pass (component): `cd frontend && pnpm exec vitest run src/features/dashboard`
- [ ] `make check` passes
