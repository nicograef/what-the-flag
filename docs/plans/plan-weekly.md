# Plan: Weekly challenge

> Source PRD: `docs/prds/prd-rebuild.md` (section "Weekly challenge")

## Goal

Every user plays one weekly challenge of 20 questions per ISO week in `Europe/Berlin`.
Finishing awards 10 points per correct answer. A weekly leaderboard ranks the current and past weeks.
The `/weekly` page and a dashboard card expose it.

## Architectural decisions

| Topic | Decision |
| --- | --- |
| Week | ISO week of `t.In(Europe/Berlin)`. `starts_at` is Monday 00:00 Berlin, `ends_at` the next Monday 00:00 Berlin, exclusive. |
| Week id | Text form `YYYY-Www`, e.g. `2026-W47`, in URLs and JSON. Parsed by `weekly — ParseWeek()`. |
| Time zone data | `import _ "time/tzdata"` in `backend/internal/weekly/week.go`. Tests and the Alpine image read one embedded database; no Dockerfile edit. |
| Module boundary | `weekly` never queries `quiz_sets`, `rounds`, `answers` or `users`. It calls the quiz, account and leaderboard services. |
| Own results | Table `weekly_entries` holds each player's round and result. The leaderboard reads only this table. |
| Ranking | Store returns finished entries ordered by `correct DESC, total_ms ASC`. Pure `weekly — assignRanks()` gives equal pairs one rank (1, 1, 3). |
| Total time | Sum of the summary's per-answer times. A timed-out answer counts 22 000 ms, so a timeout never beats an answer. |
| Points | `leaderboard.Award` in the finishing transaction: kind `weekly`, source id = challenge id, points = 10 × correct. Zero correct awards nothing. |
| Round per week | One `weekly_entries` row per (challenge, user); quiz start-or-resume returns the same round. |
| Late start | `POST /api/weekly/round` carries `{"week":"YYYY-Www"}`. A week other than the current one returns 409 `week_ended`. |
| Round open at week end | It may still be finished, but a finish at or after `ends_at` records no result and awards nothing. |
| Already played | `POST /api/weekly/round` on a finished entry returns 409 `already_played`. |
| Past weeks | Field `past_weeks` of `GET /api/weekly`: weeks with a challenge before the current one, newest first, at most 52. |
| Unknown week | `?week=` with no challenge, or a future week, returns 404 `week_not_found`. A malformed value returns 400, `field: "week"`. |
| Leaderboard size | Top 100 rows plus the viewer's row in `viewer` when finished; no pagination. |

### Lazy creation (race-safe)

`weekly — Store.EnsureChallenge()` runs one transaction, in this order:

1. `SELECT` the row for (iso_year, iso_week). Found with a quiz set: commit and return it.
2. `INSERT ... (iso_year, iso_week, starts_at, ends_at) ON CONFLICT (iso_year, iso_week) DO NOTHING RETURNING id`.
3. Row returned (winner): create the weekly quiz set inside this transaction, `UPDATE` its `quiz_set_id`, commit.
4. No row (loser): the insert blocked until the winner committed. `SELECT` the row again and return it.

The loser never creates a quiz set, so no orphan exists. A winner that rolls back frees the key; the blocked loser's insert then succeeds and it becomes the winner.
`quiz_set_id` is nullable only so step 2 can claim the week first. It is non-null outside the creating transaction; the store returns an error on a null.

### Schema `database/migrations/000006_weekly.up.sql`

- `weekly_challenges`: `id uuid PK default uuidv7()`, `iso_year int not null`, `iso_week int not null check 1..53`, `quiz_set_id uuid null unique references quiz_sets on delete restrict`, `starts_at timestamptz not null`, `ends_at timestamptz not null`, `created_at timestamptz not null default now()`, `unique (iso_year, iso_week)`.
- `weekly_entries`: `challenge_id uuid references weekly_challenges`, `user_id uuid references users on delete cascade`, `round_id uuid not null unique references rounds on delete cascade`, `started_at timestamptz not null`, `correct int null`, `total_ms int null`, `finished_at timestamptz null`, `primary key (challenge_id, user_id)`, `check ((correct is null) = (finished_at is null))`.
- Index `weekly_entries (challenge_id, correct desc, total_ms) where finished_at is not null`.

### HTTP (all behind `account — RequireUser`)

| Route | Response |
| --- | --- |
| `GET /api/weekly` | `{week, starts_at, ends_at, state: not_started\|in_progress\|finished, round_id?, correct?, total_ms?, past_weeks: [week]}` |
| `POST /api/weekly/round` | body `{week}`; `{round_id}`; 409 `week_ended` or `already_played` |
| `GET /api/weekly/leaderboard?week=` | `{week, starts_at, ends_at, rows: [{rank, username, emoji, correct, total_ms, is_viewer}], viewer?}`; no `week` means current |

## Inventory

- `backend/internal/account — RequireUser()`, user id from context, username + emoji lookup by ids — auth and leaderboard names.
- `backend/internal/leaderboard — Award()` — points inside the caller's transaction.
- `backend/internal/quiz` — create weekly set (20 questions), start-or-resume round, finished summary, finish hook.
- `backend/internal/httpx` — JSON, error envelope, Origin check.
- `backend/internal/postgres` — pool and integration-test helper.
- `backend/cmd/what-the-flag/main.go` — wiring (choke file).
- `frontend/src/lib/api.ts` — the single API client the feature calls and tests fake.
- `frontend/src/features/play/` — play component taking `roundId` and `onFinished`.
- `frontend/src/app/router.tsx` — route table (choke file).
- `frontend/src/features/dashboard/` — `/dashboard` page with a weekly card slot (duels plan).

## Open questions / Risks

- Names of the account, leaderboard and quiz contracts come from plans written in parallel. Re-check every name against the landed code before phase 1.
- `EnsureChallenge` needs the quiz set creation to accept the caller's transaction (`db.DBTX`). If quiz-practice lands without it, add that parameter in quiz's service as phase 1's first step.
- The finish hook must pass the transaction, round id, set id, user id and finish time. The summary read must also accept that transaction. Re-check both before phase 2.
- The mount in phase 5 depends on the duels lane's dashboard phase. The programme orders it after that phase. If `frontend/src/features/dashboard/` is missing at this plan's base, phases 1–4 land and phase 5 waits; nothing else depends on it.
- `backend/internal/db/` is generated and shared. Regenerate it with `cd backend && go tool sqlc generate` after every rebase onto the duels lane.
- Late finish recording nothing (decision above) is stricter than the PRD wording. Recommended; the alternative counts any finish, which lets a player pause between questions past the week's end.

## Phase 1: Week and challenge

**Depends on**: none

### Context

- `backend/internal/quiz` — weekly quiz set creation inside a transaction.
- `backend/internal/account — RequireUser()` — guards the route.
- `backend/cmd/what-the-flag/main.go` — wiring.

### What to build

- `database/migrations/000006_weekly.up.sql` — both tables and the index above.
- `backend/internal/weekly/week.go` — `WeekOf(t time.Time) (year, week int, start, end time.Time)`, `ParseWeek(s string) (year, week int, err error)`, `FormatWeek(year, week int) string`, the tzdata import.
- `backend/internal/weekly/week_test.go` — table test, literal rows below (UTC in, Berlin week out).
- `backend/sqlc/queries/weekly.sql` — select challenge by week, claim insert, set quiz set, list past weeks.
- `backend/internal/db/` — regenerated with `cd backend && go tool sqlc generate`.
- `backend/internal/weekly/store.go` — `Store.EnsureChallenge()` per "Lazy creation", `Store.PastWeeks()`, `Store.Entry()`.
- `backend/internal/weekly/service.go` — store and quiz interfaces, injected clock, `Service.Current(ctx, userID)` returning week, bounds, state and past weeks. Without an entry the state is `not_started`.
- `backend/internal/weekly/handler.go` — `Handler.Register()` with `GET /api/weekly`.
- `backend/internal/weekly/store_integration_test.go` — `//go:build integration`: duplicate week insert fails; two concurrent `EnsureChallenge` calls return one id and create one quiz set.
- `backend/cmd/what-the-flag/main.go` — construct store, service, handler; call `Register`.

| Input (UTC) | Year-week | start (UTC) | end (UTC) |
| --- | --- | --- | --- |
| 2026-12-31T11:00Z | 2026-W53 | 2026-12-27T23:00Z | 2027-01-03T23:00Z |
| 2027-01-03T11:00Z | 2026-W53 | 2026-12-27T23:00Z | 2027-01-03T23:00Z |
| 2027-01-03T23:30Z (Mon 00:30 Berlin) | 2027-W01 | 2027-01-03T23:00Z | 2027-01-10T23:00Z |
| 2027-03-28T10:00Z (spring forward) | 2027-W12 | 2027-03-21T23:00Z | 2027-03-28T22:00Z |
| 2027-10-31T11:00Z (fall back) | 2027-W43 | 2027-10-24T22:00Z | 2027-10-31T23:00Z |

`ParseWeek` rows: `2026-W47` → (2026, 47); `2026-W53` valid; `2027-W53`, `2026-W00`, `2026-47` rejected.

### Acceptance criteria

- [ ] `WeekOf` and `ParseWeek` match the tables (unit): `cd backend && go test ./internal/weekly -run 'TestWeekOf|TestParseWeek'`
- [ ] Migration applies on a fresh database: `make db-migrate`
- [ ] Unique week and concurrent creation hold (integration): `cd backend && go test -tags=integration -race ./internal/weekly -run 'TestStore_UniqueWeek|TestStore_EnsureChallengeConcurrent'`
- [ ] `make check` passes

## Phase 2: Play the round and award points

**Depends on**: 1

### Context

- `backend/internal/quiz` — start-or-resume, finished summary, finish hook.
- `backend/internal/leaderboard — Award()` — points in the finishing transaction.
- `backend/internal/weekly/service.go — Service.Current()` — phase 1 state logic.

### What to build

- `backend/sqlc/queries/weekly.sql` — insert entry `ON CONFLICT DO NOTHING`, finish entry `UPDATE ... WHERE round_id = $1 AND finished_at IS NULL`, challenge by quiz set id.
- `backend/internal/db/` — regenerated.
- `backend/internal/weekly/store.go` — `Store.AddEntry()`, `Store.FinishEntry()` returning whether a row changed.
- `backend/internal/weekly/service.go` — `Service.StartRound(ctx, userID, week)`: 409 rules from the decisions table, else quiz start-or-resume and entry insert. `Service.OnRoundFinished(ctx, tx, round)`: ignore non-weekly sets and finishes at or after `ends_at`; else compute correct and total time, `FinishEntry`, then `Award` only when a row changed.
- `backend/internal/weekly/service_test.go` — in-memory fakes for store, quiz and ledger, injected clock. Cases: same round twice while in progress; `already_played` after finish; `week_ended` for last week; late finish records nothing; finish hook run twice awards once; timeout counts 22 000 ms.
- `backend/internal/weekly/handler.go` — `POST /api/weekly/round`; `GET /api/weekly` now reports `in_progress` and `finished`.
- `backend/cmd/what-the-flag/main.go` — register `Service.OnRoundFinished` with the quiz finish hook.

### Acceptance criteria

- [ ] Round and award rules hold (service): `cd backend && go test ./internal/weekly -run TestService_Round`
- [ ] Finish records the entry and one ledger row (integration): `cd backend && go test -tags=integration -race ./internal/weekly -run TestStore_FinishEntryOnce`
- [ ] `make check` passes

## Phase 3: Weekly leaderboard

**Depends on**: 2

### Context

- `backend/internal/account` — username + emoji lookup by user ids.
- `backend/internal/weekly/week.go — ParseWeek()` — the `?week=` value.

### What to build

- `backend/sqlc/queries/weekly.sql` — finished entries of a challenge ordered by `correct DESC, total_ms ASC, user_id`.
- `backend/internal/db/` — regenerated.
- `backend/internal/weekly/store.go` — `Store.Ranking()`, `Store.ChallengeByWeek()` without creation.
- `backend/internal/weekly/service.go` — pure `assignRanks()`, `Service.Leaderboard(ctx, viewerID, week)`: 404 and 400 rules, top 100, viewer row, names from the account lookup.
- `backend/internal/weekly/service_test.go` — extend: ties share a rank and skip the next; equal correct ranks lower time first; unfinished entries absent; viewer marked.
- `backend/internal/weekly/store_integration_test.go` — extend: ranking query order and the finished-only filter.
- `backend/internal/weekly/handler.go` — `GET /api/weekly/leaderboard`.

### Acceptance criteria

- [ ] Ranking rules hold (service): `cd backend && go test ./internal/weekly -run TestService_Leaderboard`
- [ ] Ranking query orders and filters (integration): `cd backend && go test -tags=integration -race ./internal/weekly -run TestStore_Ranking`
- [ ] `make check` passes

## Phase 4: Weekly page and card

**Depends on**: 3

### Context

- `frontend/src/lib/api.ts` — client and its test fake.
- `frontend/src/features/play/` — play component (`roundId`, `onFinished`).
- `frontend/src/app/router.tsx` — route table.

### What to build

- `frontend/src/features/weekly/api.ts` — Zod schemas; `getWeekly()`, `startWeeklyRound(week)`, `getWeeklyLeaderboard(week?)`.
- `frontend/src/features/weekly/messages.ts` — `{ de, en }` strings.
- `frontend/src/features/weekly/Countdown.tsx` — time left to `ends_at`; refetches `getWeekly` at zero.
- `frontend/src/features/weekly/WeeklyLeaderboard.tsx` — rank table, viewer row highlighted.
- `frontend/src/features/weekly/WeekSelector.tsx` — current week plus `past_weeks`, stored in the `?week=` search param.
- `frontend/src/features/weekly/WeeklyPage.tsx` — `not_started`: START button, countdown, leaderboard. `in_progress`: play component; `onFinished` refetches. `finished`: result and leaderboard. A past week shows its leaderboard only.
- `frontend/src/features/weekly/WeeklyCard.tsx` — START or continue, or the played result; link to `/weekly`.
- `frontend/src/features/weekly/WeeklyPage.test.tsx` — real query client, faked API client, one case per state.
- `frontend/src/app/router.tsx` — `/weekly` for players.

### Acceptance criteria

- [ ] Page renders all three states (component): `cd frontend && pnpm exec vitest run src/features/weekly`
- [ ] `make check` passes

## Phase 5: Dashboard mount

**Depends on**: 4, and the duels lane's dashboard phase (see Risks)

### Context

- `frontend/src/features/dashboard/` — the `/dashboard` page component and its weekly card slot.
- `frontend/src/features/weekly/WeeklyCard.tsx` — the card from phase 4.

### What to build

- The dashboard page file in `frontend/src/features/dashboard/` — one-line edit that renders `<WeeklyCard />` in the slot.

### Acceptance criteria

- [ ] The card is mounted: `grep -rn '<WeeklyCard' frontend/src/features/dashboard`
- [ ] `make check` passes
