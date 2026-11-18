# Plan: Duels

> Source PRD: docs/prds/prd-rebuild.md (sections "Duels", "Leaderboard and points"; routes `/api/duels*`, `/api/leaderboard`; pages `/dashboard`, `/duels/:id`, `/leaderboard`)

## Goal

A player challenges another player by username. Both play the same 10-question set in any order.
The transaction that finishes the second round scores the duel once and writes both awards to the ledger.
`/dashboard` lists the viewer's duels; `/duels/:id` plays or shows the result; `/leaderboard` ranks players by total.

## Architectural decisions

### User rounds (package `quiz`, phase 1)

- `quiz.Service — StartRound(ctx, tx, setID, userID) (uuid.UUID, error)`: `INSERT … ON CONFLICT (set_id, user_id) DO NOTHING`, then select. Idempotent, locks no row.
- `quiz.Service — RoundOf(ctx, tx, setID, userID) (uuid.UUID, error)`: the user's round of that set, else `quiz.ErrRoundNotFound`.
- `app.New()` passes `account — OptionalUser()` as the quiz handler's viewer, so a player reads only their own round. `000003_accounts` holds the `rounds.user_id` FK.

### Ledger and leaderboard (package `leaderboard`)

- `database/migrations/000004_ledger.up.sql`, wrapped in `BEGIN; … COMMIT;`, table `ledger_entries`:
  `user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE`, `source_kind text NOT NULL CHECK (source_kind IN ('duel'))`, `source_id uuid NOT NULL`,
  `points integer NOT NULL CHECK (points > 0)`, `created_at timestamptz NOT NULL DEFAULT now()` (display only), `PRIMARY KEY (user_id, source_kind, source_id)`.
- One entry per user and source, so a repeated award inserts nothing. `source_id` holds the duel id by value, without a FK.
- A deleted user's rows cascade; the opponent's rows stay.
- `leaderboard.Service — Award(ctx, tx, userID, kind, sourceID, points) error`: `INSERT … ON CONFLICT DO NOTHING` on the caller's tx.
  A nil tx, an unknown kind or points ≤ 0 return an error. `leaderboard.Kind` has one value, `KindDuel = "duel"`.
- Phase 4: `GET /api/leaderboard` behind `requireUser` → `{entries: [{rank, username, emoji, points, isViewer}], viewer: {rank, points}}`.
- Entries: top 100 by total, then user id; `RANK()` gives equal totals one rank. A viewer without entries gets `rank: null`, `points: 0`.
- Viewer rank: `1 + count(users with a higher total)`. SQL reads only `ledger_entries`; names come from `PublicByIDs()` behind `leaderboard.Users`.
- `GET /api/me` gains `points` through `account.PointsTotaler`, declared in account and met by `leaderboard.Service — Total()`.

### Duel schema (`database/migrations/000005_duels.up.sql`, wrapped in `BEGIN; … COMMIT;`)

| Column | Definition |
| --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT uuidv7()` |
| `quiz_set_id` | `uuid NOT NULL UNIQUE REFERENCES quiz_sets(id)` |
| `challenger_id`, `opponent_id` | `uuid NOT NULL REFERENCES users ON DELETE CASCADE`; `CHECK (challenger_id <> opponent_id)` |
| `challenger_correct`, `opponent_correct` | `smallint NULL CHECK (… BETWEEN 0 AND 10)`; set when that side's round finishes |
| `created_at`, `expires_at`; `completed_at` | `timestamptz NOT NULL`, `CHECK (expires_at > created_at)`; `timestamptz NULL` |

- Indexes `duels_challenger_created_idx (challenger_id, created_at DESC)` and `duels_opponent_created_idx (opponent_id, created_at DESC)`.
- No pair rule: two players may hold several open duels. Rounds are found through `quiz.RoundOf`, not stored on the duel.
  `created_at`, `expires_at = created_at + 7 × 24 h` and every status come from the injected clock. Expiry is derived, never written.

### Status and points

- `backend/internal/duel/status.go — deriveStatus(d Duel, viewer uuid.UUID, now time.Time) Status`, first match wins:
  `completed_at` set → `completed`; `now >= expires_at` → `expired`; viewer's count set → `waiting`; else `your_turn`.
- `backend/internal/duel/score.go — Score(correctA, correctB int) (pointsA, pointsB int)`: 10 each; strictly more correct adds 5 per correct; 10 correct adds 25.

| correctA:correctB | pointsA | pointsB | Rule exercised |
| --- | --- | --- | --- |
| 10:10 | 35 | 35 | tie, both perfect |
| 10:9 | 85 | 10 | 10 + 50 + 25 against completion only |
| 7:7 | 10 | 10 | tie |
| 0:0 | 10 | 10 | completion only |
| 0:1 | 10 | 15 | win by one |
| 3:8 | 10 | 50 | the loser gets nothing extra |

### Finish hook and transactions

- `duel.Service — RoundFinished(ctx, tx, r quiz.FinishedRound) error` is the `quiz.KindDuel` hook, registered in `app.New()`. In the quiz's finishing tx:
  1. `GetDuelBySetForUpdate(r.SetID)`, the first statement: it locks the duel row. No duel or already completed: return nil.
  2. `r.UserID` is no participant: return an error, which rolls the finish back.
  3. Record the finisher's count if still NULL.
  4. `r.FinishedAt >= expires_at`: return nil. Both counts set: `completed_at = r.FinishedAt`, `Score()`, then `Award()` per side.
- Exactly once: quiz locks the round row, the hook then the duel row. Two last finishes serialise on the duel row.
  Under READ COMMITTED the second sees the first's count, so only it completes and awards. The ledger key absorbs any repeat.
- A timed-out finish uses `served_at + 22 s` as `FinishedAt`. After expiry a finish records its count but never completes or awards.
- A method taking a `pgx.Tx` rejects a nil one. Others open a tx via `pgx.BeginFunc` on a `Begin`-capable sqlc `DBTX` (pool, or `TestTx`).
- `Create`: `IDByUsername` (any letter case), self check, then one tx: `quiz.CreateSet(ctx, tx, quiz.KindDuel, quiz.DuelSize)` and `InsertDuel`.
- `StartRound`: one tx: load the duel unlocked, check participant and expiry, `quiz.StartRound`. No duel lock is held while quiz writes.

### Duel HTTP (`backend/internal/duel/handler.go`)

- `NewHandler(svc *Service, requireUser func(http.Handler) http.Handler) *Handler`; `Register(mux)` wraps all four routes in `requireUser`.
  The viewer is `account.UserID(ctx)`. Errors go through `httpx.MapError`; an unparsable `{id}` is `duel_not_found`.

| Route | Body → result | Errors |
| --- | --- | --- |
| `POST /api/duels` | `{"opponent": "<username>"}` → 201 `{id}` | 400 `self_challenge`, 404 `user_not_found` (both field `opponent`) |
| `GET /api/duels` | 200 `{duels: [DuelItem]}`, newest 50 by `created_at` | — |
| `GET /api/duels/{id}` | 200 `DuelDetail` | 404 `duel_not_found`, also for non-participants |
| `POST /api/duels/{id}/round` | 200 `{roundId}` | 404 `duel_not_found`, 409 `duel_expired` |

- `DuelItem`: `id`, `status`, `opponent {username, emoji}`, `createdAt`, `expiresAt`, `points` (the viewer's from `Score()`, `null` unless `completed`).
- `DuelDetail` adds `viewerRound`: `null` until the viewer's count is recorded, then quiz's summary JSON with `{"de", "en"}` texts.
  It adds `opponentRound` and `result`, both `null` unless `completed`. `result` is `{viewer: {correct, points}, opponent: {correct, points}}`.
- No response carries the other player's round id, their count before completion, or a question before the viewer played it.

### Code layout and tests

- sqlc: `backend/sqlc.yaml` gains `sql:` blocks `leaderboard` and `duel`. Each reads `database/migrations`, its `backend/sqlc/queries/<domain>.sql`, writes `internal/<domain>/internal/db`.
- `Score` and `deriveStatus` get unit tests. Service tests use real Postgres, the real `quiz`, `account` and `leaderboard` services, and a settable clock.
  Each test inserts fresh users with plain SQL. Ledger aggregate tests run inside `postgres.TestTx(t)`.
- Frontend tests use `renderRoute(path, { api })` with `FakeApi`. API functions take `(api, …args)`; texts render `text[locale]`.
- Query keys: `['duels']`, `['duel', id]`, `['leaderboard']`; no locale. Relative times use `Intl.RelativeTimeFormat` in the active locale.

## Inventory

- `backend/internal/app/app.go — New(deps Deps)` — wiring of stores, services, handlers and the duel hook.
- `backend/internal/account/ — RequireUser`, `UserID()`, `OptionalUser()`, `Service.IDByUsername()`, `Service.PublicByIDs()`, `PublicUser`, `ErrUserNotFound`.
- `backend/internal/quiz/ — Service.CreateSet()`, `Service.Summary()`, `Service.OnFinished()`, `FinishedRound`, `KindDuel`, `DuelSize`, summary JSON.
- `backend/internal/httpx/ — MapError()`; `backend/internal/postgres/testpool.go — TestPool()`, `TestTx()`; `backend/internal/contract/` — harness, `registerUser`, `correctOption()`.
- `frontend/src/app/router.tsx`, `frontend/src/app/navbar.tsx — Navbar`, `frontend/src/lib/api.ts — useApiClient()`, `frontend/src/features/play/play.tsx — Play({ roundId, onFinished })`; `frontend/src/features/auth/ — RequireUser`, `useSession()`, `AFTER_LOGIN`, me schema.

## Open questions / Risks

- Integration criteria assume `make db` and `make db-migrate` ran. Phase agents re-read the landed names of earlier plans first.
- The duel list shows the newest 50. An open duel drops off only after 50 newer duels within its seven days. Accepted.
- A deleted account cascades its duels; their quiz sets stay as orphans. Only practice sets are cleaned up. Accepted.

## Phase 1: Duel lifecycle API with user rounds, scoring and ledger

**Depends on**: none

### Context

- `backend/internal/quiz/service.go`, `backend/internal/app/app.go`, `backend/sqlc.yaml` — user rounds, wiring, sqlc blocks; see Inventory.

### What to build

- `backend/sqlc/queries/quiz.sql`: `InsertUserRound`, `GetRoundBySetUser`. `backend/internal/quiz/service.go — StartRound()`, `RoundOf()`; `backend/internal/quiz/store.go`.
- `database/migrations/000004_ledger.up.sql`; `backend/sqlc/queries/leaderboard.sql — InsertLedgerEntry`; `backend/internal/leaderboard/service.go — NewService()`, `Kind`, `Award()`.
- `database/migrations/000005_duels.up.sql`; `backend/sqlc/queries/duel.sql`: `InsertDuel`, `GetDuelForUser`, `GetDuelBySetForUpdate`, `ListDuelsForUser` (both roles, newest 50), `SetCorrect`, `CompleteDuel`.
- `backend/sqlc.yaml`: the `leaderboard` and `duel` blocks; regenerate with `cd backend && go tool sqlc generate`.
- `backend/internal/duel/{score,status,store}.go`; `backend/internal/duel/service.go — NewService()`, `Create`, `List`, `Get`, `StartRound`, `RoundFinished`.
  Errors `ErrSelfChallenge`, `ErrDuelNotFound`, `ErrDuelExpired`; `account.ErrUserNotFound` passes through.
- `backend/internal/duel/handler.go`: the four routes, the error table, `DuelItem` and `DuelDetail` JSON.
- `backend/internal/app/app.go`: the account viewer for quiz, leaderboard and duel construction, `OnFinished(quiz.KindDuel, duelService)`.
- Tests: `backend/internal/quiz/store_integration_test.go`, `backend/internal/leaderboard/service_integration_test.go`, `backend/internal/duel/{score,status,service_integration}_test.go`.
- `backend/internal/contract/duels_integration_test.go`, users A, B and C from `registerUser`:
  - A challenges B by B's name in upper case; both lists show `your_turn`. A answers all ten with `correctOption`, then reads `waiting`;
  - B reading A's round gets 404 `round_not_found`. B answers all ten wrongly; both details read `completed` with 85 and 10 points;
  - A challenging A is 400 `self_challenge`, an unknown name 404 `user_not_found`, both with field `opponent`;
  - C reading the duel or starting its round gets 404 `duel_not_found`, as does an unparsable id.

### Acceptance criteria

- [ ] The Score table and the status precedence hold, for both roles and at `now == expires_at` (unit): `cd backend && go test ./internal/duel -run 'TestScore|TestDeriveStatus'`
- [ ] Starting twice returns one round; `RoundOf` finds it; another user gets `ErrRoundNotFound`; concurrent starts make one row; a nil tx errors: `cd backend && go test -tags=integration -race ./internal/quiz -run 'TestRoundOwner|TestStoreStartRound'`
- [ ] A repeated award inserts nothing; nil tx, unknown kind and zero points error; a rolled-back tx leaves no row: `cd backend && go test -tags=integration -race ./internal/leaderboard -run TestAward`
- [ ] Self-challenge in any case and unknown users are rejected; outsiders get `ErrDuelNotFound`; round visibility follows the status: `cd backend && go test -tags=integration -race ./internal/duel -run 'TestServiceCreate|TestServiceGet'`
- [ ] `StartRound` twice returns one round id; on an expired duel it returns `ErrDuelExpired`: `cd backend && go test -tags=integration -race ./internal/duel -run TestServiceStartRound`
- [ ] The second finish completes and awards per `Score`; a repeat awards nothing; a finish at `expires_at` records only the count: `cd backend && go test -tags=integration -race ./internal/duel -run TestServiceRoundFinished`
- [ ] Two concurrent last finishes complete the duel once and leave exactly two ledger rows: `cd backend && go test -tags=integration -race ./internal/duel -run TestConcurrentFinish`
- [ ] Deleting a player removes the duel and their ledger rows; the opponent's rows stay: `cd backend && go test -tags=integration -race ./internal/duel -run TestDeleteUserKeepsOpponentPoints`
- [ ] The duel routes keep their wire shape and codes: `cd backend && go test -tags=integration -race ./internal/contract -run TestDuel`
- [ ] `make check` passes

## Phase 2: Duel page

**Depends on**: 1

### Context

- `frontend/src/features/play/play.tsx — Play()`, `frontend/src/test/fake-api.ts — FakeApi`, `frontend/src/app/router.tsx` — see Inventory.

### What to build

- `frontend/src/features/duels/api.ts`: `getDuel(api, id)`, `startDuelRound(api, id)`, Zod schemas for `DuelDetail`, hooks `useDuel(id)`, `useStartDuelRound(id)`.
- `frontend/src/features/duels/messages.ts`: statuses, waiting and expired texts, result labels, `duel_not_found`, `duel_expired`.
- `frontend/src/features/duels/duel-page.tsx`: `your_turn` starts or resumes the round and renders `Play`; other statuses render `DuelResult`.
  `onFinished` invalidates `['duel', id]` and `['duels']`.
- `frontend/src/features/duels/duel-result.tsx`: both players with emoji and points; per question both choices and the correct option.
  `waiting` shows own answers only. `expired` says no points were awarded and shows own answers if played.
- `frontend/src/app/router.tsx`: `/duels/:id` inside `RequireUser`.
- Test: `frontend/src/features/duels/duel-page.test.tsx`.

### Acceptance criteria

- [ ] Completed shows both answers and points; waiting shows own answers only; `your_turn` posts the round and shows question 1: `cd frontend && pnpm exec vitest run src/features/duels`
- [ ] `make check` passes

## Phase 3: Dashboard and challenge

**Depends on**: 2

### Context

- `frontend/src/app/navbar.tsx — Navbar`, `frontend/src/components/ui/`, `frontend/src/features/auth/redirects.ts — AFTER_LOGIN`.

### What to build

- shadcn `dialog`, `command`, `badge` via `cd frontend && pnpm dlx shadcn@latest add <name>`, each only when missing; `frontend/package.json`, `frontend/pnpm-lock.yaml`.
- `frontend/src/features/dashboard/api.ts`: `listDuels(api)`, `createDuel(api, username)`, `searchUsers(api, query)` (`GET /api/users?query=`, up to 20).
  Beside it `messages.ts` and `use-debounced-value.ts` (250 ms).
- `frontend/src/features/dashboard/challenge-dialog.tsx`: shadcn `Dialog` + `Command`; a search runs only for `^[A-Za-z0-9_]{1,20}$`.
  Picking a user posts the duel, invalidates `['duels']` and navigates to `/duels/<id>`. `self_challenge` and `user_not_found` show their messages.
- `frontend/src/features/dashboard/duel-list.tsx`: opponent emoji and name, status badge, relative time, points when completed; rows link to `/duels/<id>`.
- `frontend/src/features/dashboard/dashboard-page.tsx` (challenge button above the list); `dashboard-nav-link.tsx`, which `navbar.tsx` shows when logged in.
- `frontend/src/app/router.tsx`: `/dashboard` inside `RequireUser`. `frontend/src/features/auth/redirects.ts`: `AFTER_LOGIN = '/dashboard'`.
  `frontend/src/features/auth/login-page.test.tsx` then expects `/dashboard` after login.
- Test: `frontend/src/features/dashboard/dashboard-page.test.tsx`, including a `/login` submit that lands on the dashboard.

### Acceptance criteria

- [ ] One badge per status; a debounced search; a pick lands on `/duels/<id>`; `user_not_found` shows; login lands on `/dashboard`: `cd frontend && pnpm exec vitest run src/features/dashboard`
- [ ] `make check` passes

## Phase 4: All-time leaderboard

**Depends on**: 3

### Context

- `backend/internal/leaderboard/service.go — Award()` (phase 1), `backend/internal/account/handler.go` — the me body; see Inventory.

### What to build

- `backend/sqlc/queries/leaderboard.sql`: `UserTotal`, `TopTotals` (`RANK()`, top 100), `CountHigherTotals`; regenerate sqlc.
- `backend/internal/leaderboard/service.go`: `Users` interface, `Total()`, `Board(ctx, viewer)`. `backend/internal/leaderboard/handler.go`: `GET /api/leaderboard`.
- `backend/internal/account/service.go — PointsTotaler`; `backend/internal/account/handler.go`: `points` in the `GET /api/me` body.
- `backend/internal/app/app.go`: the leaderboard handler and its users; the totaler for account. Test: `backend/internal/leaderboard/service_integration_test.go`.
- `backend/internal/contract/leaderboard_integration_test.go`: a fresh user reads `viewer` rank `null`, points 0, and me points 0.
  After a duel won 10:0, the winner's `viewer.points` and me `points` are 85.
- `backend/internal/contract/accounts_integration_test.go`: the expected me struct gains `points`, since decoding rejects unknown fields.
- `frontend/src/features/leaderboard/`: `api.ts`, `messages.ts`, `leaderboard-page.tsx`, `leaderboard-page.test.tsx`.
  The page lists rank, emoji, name and points. It marks the viewer's row, or pins it below when outside the top 100.
- `frontend/src/app/router.tsx`: `/leaderboard` inside `RequireUser`; `frontend/src/app/navbar.tsx`: its link when logged in.
  `frontend/src/features/auth/api.ts` adds `points` to the me schema; `frontend/src/features/profile/profile-page.tsx` shows it.

### Acceptance criteria

- [ ] Equal totals share a rank, the next skips; the viewer's rank matches its entry; a viewer without points gets `null`: `cd backend && go test -tags=integration -race ./internal/leaderboard -run TestBoard`
- [ ] The leaderboard route and me `points` keep their wire shape: `cd backend && go test -tags=integration -race ./internal/contract -run 'TestLeaderboard|TestAccount'`
- [ ] Shared ranks render; the viewer's row is marked or pinned; the navbar link works; the profile shows the total: `cd frontend && pnpm exec vitest run src/features/leaderboard src/features/profile`
- [ ] `make check` passes
