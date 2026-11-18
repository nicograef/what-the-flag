# Plan: Duels

> Source PRD: docs/prds/prd-rebuild.md (section "Duels", routes `/api/duels*`, pages `/dashboard`, `/duels/:id`)

## Goal

A player challenges another player by username. Both play the same 10-question quiz set in any order.
The transaction that finishes the second round scores the duel once.
The dashboard lists the viewer's duels with viewer-relative status; `/duels/:id` plays the viewer's round or shows the result.

## Architectural decisions

- **Ownership.** This plan never touches `backend/internal/weekly/`, `frontend/src/features/weekly/`, `database/migrations/000006_*`, `Makefile` or `.github/workflows/*` (R21).
- **Schema** `database/migrations/000005_duels.up.sql`, table `duels`:
  - `id uuid PK DEFAULT uuidv7()`, `quiz_set_id uuid NOT NULL UNIQUE REFERENCES quiz_sets(id)`.
  - `challenger_id`, `opponent_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`; `CHECK (challenger_id <> opponent_id)`.
  - `challenger_round_id`, `opponent_round_id uuid NULL REFERENCES rounds(id)`: set by that side's first `POST /round`.
  - `challenger_correct`, `opponent_correct smallint NULL`, each `CHECK (<col> BETWEEN 0 AND 10)`: set when that side's round finishes.
  - `created_at`, `expires_at timestamptz NOT NULL`, `CHECK (expires_at > created_at)`; `completed_at timestamptz NULL`.
  - `lapsed boolean NOT NULL DEFAULT false`: read only by the pair index; status never reads it.
  - Indexes: `duels_challenger_created_idx (challenger_id, created_at DESC)`, `duels_opponent_created_idx (opponent_id, created_at DESC)`.
- **One open duel per pair.** A partial unique index on the unordered pair:
  `CREATE UNIQUE INDEX duels_open_pair_uniq ON duels (LEAST(challenger_id, opponent_id), GREATEST(challenger_id, opponent_id)) WHERE completed_at IS NULL AND NOT lapsed;`
- **Lazy expiry vs. the index.** `now()` is not immutable, so the index cannot test `expires_at`. The create transaction runs, in order:
  1. `quiz.Service — CreateSetTx(ctx, tx, quiz.KindDuel, quiz.DuelSize)`.
  2. `LapseExpiredPair(a, b, now)`: `UPDATE duels SET lapsed = true WHERE LEAST(…) = LEAST($a,$b) AND GREATEST(…) = GREATEST($a,$b) AND completed_at IS NULL AND NOT lapsed AND expires_at <= $now`.
  3. `InsertDuel`. A `23505` whose constraint is `duels_open_pair_uniq` maps to `ErrDuelExists` and rolls back the set too.
- **Concurrent creates.** Two creates for one pair, in either order: the second insert waits on the first's uncommitted index entry, then gets `23505`. A lapse that loses a row lock re-checks its `WHERE` under READ COMMITTED.
- **Clock.** `created_at`, `expires_at = created_at + 7×24h` and every status come from the injected clock, never a DB default.
- **Status** (pure function `status.go — deriveStatus(d Duel, viewer uuid.UUID, now time.Time) Status`, first match wins):
  1. `completed_at` set → `completed`; 2. `now >= expires_at` → `expired`; 3. viewer's `*_correct` set → `waiting`; 4. else → `your_turn`.
- **Scoring** `backend/internal/duel/score.go — Score(correctA, correctB int) (pointsA, pointsB int)`, per PRD:
  10 each for completing; strictly more correct adds 5 × own correct to that player only; 10 correct adds 25 to that player.

  | correctA:correctB | pointsA | pointsB | rule exercised |
  | --- | --- | --- | --- |
  | 10:10 | 35 | 35 | tie: no win bonus, both perfect |
  | 10:9 | 85 | 10 | 10 + 50 + 25 vs. completion only |
  | 7:7 | 10 | 10 | tie |
  | 0:0 | 10 | 10 | completion only |
  | 0:1 | 10 | 15 | win by one |
  | 3:8 | 10 | 50 | loser gets nothing extra |

- **Finishing hook.** `duel.Service — RoundFinished(ctx context.Context, tx pgx.Tx, r quiz.FinishedRound) error` implements `quiz.FinishHook`.
  `main.go` registers it with `quizService.OnFinished(quiz.KindDuel, duelService)`. In the quiz's finishing transaction it:
  1. `GetDuelByQuizSetForUpdate(r.SetID)`, first statement. No duel (cascaded away) or already completed: return nil.
  2. `r.UserID` is neither participant: return an error (rolls back).
  3. `SetCorrect` for the finisher's side only if still NULL.
  4. `r.FinishedAt >= expires_at`: return nil. Else, if both sides are recorded: `CompleteDuel` (`completed_at = r.FinishedAt`), then `Score`.
  5. `leaderboard.Service — Award(ctx, tx, user, leaderboard.KindDuel, duelID, int32(points))` per side.
- **Exactly once.** Lock order follows R4: quiz locks the round row, the hook then locks the duel row.
  Two simultaneous finishes lock different rounds, then serialise on the duel row.
  Under READ COMMITTED, `FOR UPDATE` returns the latest committed row, so the second finisher sees the first's count.
  Only the second finisher completes and awards. The ledger's unique key makes any repeat a no-op.
- **Half-played duel at expiry.** A round finished at or after `expires_at` records its count, never completes the duel and awards nothing.
  The duel reads `expired`; `POST /round` returns `duel_expired`. A round already started may still be finished through `/api/rounds/*`.
  A finish before `expires_at` completes the duel even when a lapse already ran; the pair then holds that completed duel plus the new one.
- **Starting a round** (`StartRound`): load the duel without a lock and check participant and expiry.
  Then call `quiz.Service — StartRound(ctx, setID, userID)` (idempotent, own transaction).
  Then `SetRoundID … WHERE <side>_round_id IS NULL`. No transaction holds the duel row while waiting on a round row, so no deadlock.
  The challenger's round starts when `/duels/<id>` opens after create, so the PRD's "offered at once" holds.
- **Transactions.** `service.go` declares `Store` with `InTx(ctx, fn func(tx pgx.Tx, s Store) error) error` and `WithTx(tx pgx.Tx) Store`.
  The fake runs `fn(nil, itself)` and returns itself from `WithTx`.
- **Consumer interfaces** (declared in `backend/internal/duel/service.go`):

  | Interface | Methods | Provider |
  | --- | --- | --- |
  | `Users` | `ByUsername(ctx, username string) (account.PublicUser, error)`, any letter case, `account.ErrUserNotFound`; `PublicByIDs(ctx, ids []uuid.UUID) (map[uuid.UUID]account.PublicUser, error)` | `account.Service` (R5) |
  | `Quiz` | `CreateSetTx(ctx, tx pgx.Tx, kind quiz.Kind, size int) (uuid.UUID, error)`; `StartRound(ctx, setID, userID uuid.UUID) (uuid.UUID, error)`; `Summary(ctx, roundID uuid.UUID) (quiz.Summary, error)` | `quiz.Service` (R4) |
  | `Ledger` | `Award(ctx, tx pgx.Tx, userID uuid.UUID, kind leaderboard.Kind, sourceID uuid.UUID, points int32) (bool, error)` | `leaderboard.Service` |

- **HTTP.** `duel.NewHandler(svc *Service, requireUser func(http.Handler) http.Handler) *Handler` (R5); `Register(mux)` wraps all four routes.
  The viewer is `account.UserID(ctx)`. Errors use `httpx.WriteError`. An unparsable `{id}` is `duel_not_found`.

  | Route | Body / result | Errors |
  | --- | --- | --- |
  | `POST /api/duels` | `{"opponent": "<username>"}` → 201 `{id}` | 400 `self_challenge` (field `opponent`), 404 `user_not_found` (field `opponent`), 409 `duel_exists` |
  | `GET /api/duels` | 200 `{duels: [DuelItem]}`, newest 20 by `created_at`, no pagination | — |
  | `GET /api/duels/{id}` | 200 `DuelDetail` | 404 `duel_not_found`, non-participants included |
  | `POST /api/duels/{id}/round` | 200 `{roundId}` | 404 `duel_not_found`, 409 `duel_expired` |

  - `DuelItem`: `id, status, opponent {username, emoji}, createdAt, expiresAt, points` (viewer's points, `null` unless `completed`).
  - `DuelDetail`: `DuelItem` fields plus `viewerRound`, `opponentRound`, `result`.
  - `viewerRound`: `null` until the viewer's count is recorded; then `quiz.Presenter.Summary()` in `httpx.LocaleFrom(ctx)`.
  - `opponentRound` and `result` are `null` unless `completed`. `result` = `{viewer: {correct, points}, opponent: {correct, points}}`.
  - No response carries a round id of the other player, the opponent's count before completion, or any question before the viewer played.
- **Frontend.**
  - `frontend/src/features/dashboard/`: `DashboardPage.tsx`, `ChallengeDialog.tsx`, `DuelList.tsx`, `DashboardNavLink.tsx`, `useDebouncedValue.ts`, `api.ts`, `messages.ts`, `DashboardPage.test.tsx`.
  - `frontend/src/features/duels/`: `DuelPage.tsx`, `DuelResult.tsx`, `api.ts`, `messages.ts`, `DuelPage.test.tsx`.
  - Weekly slot (R7): `DashboardPage` renders `<div className="grid gap-4">`; its first child is exactly `<section data-slot="weekly" />`. The weekly plan replaces that element.
  - Opponent search: 250 ms debounce; a request only when the query matches `^[A-Za-z0-9_]{1,20}$` (accounts' `invalid_query` rule). shadcn `Dialog` + `Command`.
  - Query keys (R20): list `['duels']`; detail `['duel', id, locale]`. Relative time uses `Intl.RelativeTimeFormat` in the active locale.
  - After `POST /api/duels` the dialog invalidates `['duels']` and navigates to `/duels/<id>`.
  - `DuelPage`: `your_turn` → `startDuelRound(id)`, then `Play({ roundId, onFinished })`; `onFinished` invalidates `['duel', id]`. Other statuses → `DuelResult`.
  - Messages are `{ de, en }` (R25).
  - Cross-feature imports: only `features/play/Play.tsx`, `features/auth/RequireUser.tsx` and `features/auth/useSession.ts`.
  - Tests use `frontend/src/test/render.tsx — renderRoute()` with a faked `ApiClient` (R18).
- **Settled by rulings.** Quiz sets orphaned by account deletion stay (R14). The cross-stack browser test lives in release-readiness (R15).

## Inventory

- `backend/cmd/what-the-flag/main.go — main()` — wiring choke file; adds the duel store, service, handler and hook.
- `backend/internal/account/ — Handler.RequireUser()`, `UserID()`, `PublicByIDs()`, `ByUsername()`, `PublicUser`, `ErrUserNotFound` — auth and lookups.
- `backend/internal/leaderboard/ — Service.Award()`, `KindDuel` — ledger write inside the hook's transaction.
- `backend/internal/quiz/ — CreateSetTx()`, `StartRound()`, `Summary()`, `OnFinished()`, `FinishedRound`, `Presenter.Summary()`, `KindDuel`, `DuelSize`.
- `backend/internal/httpx/ — WriteError()`, `LocaleFrom()`; `backend/internal/postgres/` — pool and integration-test helper.
- `frontend/src/app/router.tsx` — route table (choke file); `frontend/src/app/navbar.tsx — Navbar` — gets the Dashboard link.
- `frontend/src/lib/api.ts — ApiClient, ApiError, useApiClient()`; `frontend/src/lib/i18n/ — useMessages()`, `useLocale()`.
- `frontend/src/features/play/Play.tsx — Play({ roundId, onFinished })`; `frontend/src/features/auth/RequireUser.tsx`, `useSession.ts`.

## Open questions / Risks

- **Needed from quiz-practice (R4):** `quiz.Service — CreateSetTx(ctx, tx pgx.Tx, kind Kind, size int) (uuid.UUID, error)` and `FinishedRound.FinishedAt time.Time`. Not yet in that plan; re-check the names before phase 1.
- **Generated code.** `backend/internal/db/`, `main.go` and `router.tsx` are shared with the weekly lane. Regenerate sqlc and re-merge after every rebase.
- **List size.** Newest 20 only. An open duel drops off only after 20 newer duels within its seven days. Accepted.

## Phase 1: Duel lifecycle API

**Depends on**: none

### Context

- `database/migrations/000004_quiz.up.sql` — `quiz_sets`, `rounds` referenced by FKs.
- `backend/internal/quiz/service.go`, `backend/internal/account/service.go`, `backend/internal/leaderboard/service.go` — consumer targets.
- `backend/cmd/what-the-flag/main.go — main()` — wiring.

### What to build

- `database/migrations/000005_duels.up.sql` exactly as in Architectural decisions.
- `backend/sqlc/queries/duel.sql`: `LapseExpiredPair`, `InsertDuel`, `GetDuelForUser` (id and participant), `GetDuelByQuizSetForUpdate`, `ListDuelsForUser` (both roles, `created_at DESC LIMIT 20`), `SetRoundID`, `SetCorrect`, `CompleteDuel`.
  Regenerate `backend/internal/db/` with `cd backend && go tool sqlc generate`.
- `backend/internal/duel/score.go — Score()`; `backend/internal/duel/status.go — deriveStatus()`.
- `backend/internal/duel/store.go` — pgx store, `InTx`, `WithTx`; maps `23505` on `duels_open_pair_uniq` to `ErrDuelExists`.
- `backend/internal/duel/service.go` — `NewService(store, users, quiz, ledger, now func() time.Time)`, `Create`, `List`, `Get`, `StartRound`, `RoundFinished`.
  Errors: `ErrSelfChallenge`, `ErrUserNotFound`, `ErrDuelExists`, `ErrDuelNotFound`, `ErrDuelExpired`.
- `backend/internal/duel/handler.go — NewHandler()`, `Register()`: the four routes, error-code table, `DuelItem`/`DuelDetail` JSON.
- `backend/cmd/what-the-flag/main.go` — construct store, service, handler; `quizService.OnFinished(quiz.KindDuel, duelService)`.
- Tests: `backend/internal/duel/score_test.go`, `backend/internal/duel/status_test.go`, `backend/internal/duel/fake_store_test.go`, `backend/internal/duel/service_test.go`, `backend/internal/duel/store_test.go` (`//go:build integration`).
- The integration tests insert `users` and `quiz_sets` fixture rows with plain SQL and use a call-counting `Ledger` fake.
- Demo: two curl sessions create a duel, play both rounds via `/api/rounds/*`, read the result and `GET /api/me` points.

### Acceptance criteria

- [ ] Unit (pure): the six-row Score table passes: `cd backend && go test ./internal/duel -run TestScore`.
- [ ] Unit (pure): status precedence completed > expired > waiting > your_turn, for both viewer roles and at `now == expires_at`: `cd backend && go test ./internal/duel -run TestDeriveStatus`.
- [ ] Service: self-challenge (any letter case), unknown user and a duplicate open duel in reverse order are rejected; a create after the old duel expired succeeds: `cd backend && go test ./internal/duel -run TestServiceCreate`.
- [ ] Service: a non-participant gets `ErrDuelNotFound`; before playing both rounds and `result` are nil; while waiting only `viewerRound`; once completed both rounds and `result`: `cd backend && go test ./internal/duel -run TestServiceGetVisibility`.
- [ ] Service: the second finish completes and awards per `Score` to both; a repeated hook awards nothing; a finish at `expires_at` records the count, leaves the duel incomplete and awards nothing: `cd backend && go test ./internal/duel -run TestServiceRoundFinished`.
- [ ] Service: `StartRound` on an expired duel returns `ErrDuelExpired`; twice returns one round id: `cd backend && go test ./internal/duel -run TestServiceStartRound`.
- [ ] Integration: the pair index rejects a second open duel in reverse order and accepts one after `LapseExpiredPair` or `CompleteDuel`; `CHECK` rejects self; deleting a user cascades: `cd backend && go test -tags=integration -race ./internal/duel -run TestStoreConstraints`.
- [ ] Integration: two concurrent lapse-and-insert transactions for one pair commit exactly one duel; the other gets `ErrDuelExists`: `cd backend && go test -tags=integration -race ./internal/duel -run TestStoreConcurrentCreate`.
- [ ] Integration: two concurrent `RoundFinished` transactions on one duel complete it once and call `Award` exactly twice: `cd backend && go test -tags=integration -race ./internal/duel -run TestStoreConcurrentFinish`.
- [ ] `make check` passes.

## Phase 2: Duel page

**Depends on**: 1

### Context

- `frontend/src/features/play/Play.tsx — Play()` — the play component.
- `frontend/src/lib/api.ts`, `frontend/src/lib/i18n/`, `frontend/src/test/render.tsx — renderRoute()` — client, messages, test seam.
- `frontend/src/app/router.tsx` — route table; `frontend/src/features/auth/RequireUser.tsx` — protected-route wrapper.

### What to build

- `frontend/src/features/duels/api.ts` — `getDuel(id)`, `startDuelRound(id)` with Zod schemas for `DuelDetail`.
- `frontend/src/features/duels/messages.ts` — `{ de, en }` strings for statuses, waiting text, expired text, result labels.
- `frontend/src/features/duels/DuelPage.tsx` — loads the duel; `your_turn` starts or resumes and renders `Play`; else `DuelResult`.
- `frontend/src/features/duels/DuelResult.tsx` — header with both players and points; per-question rows with both chosen options and the correct option.
  Waiting shows own answers only; expired says no points were awarded and shows own answers if finished.
- `frontend/src/app/router.tsx` — `/duels/:id` inside `RequireUser`.
- Tests: `frontend/src/features/duels/DuelPage.test.tsx`.
- Demo: open `/duels/<id>` from a curl-created duel, play, see the waiting view, then the result after the opponent plays.

### Acceptance criteria

- [ ] Component: a completed duel renders both answers per question, the correct option and each player's points: `cd frontend && pnpm vitest run src/features/duels -t "completed"`.
- [ ] Component: a waiting duel renders own answers and no opponent answer: `cd frontend && pnpm vitest run src/features/duels -t "waiting"`.
- [ ] Component: a `your_turn` duel posts `/api/duels/<id>/round` and renders the first question: `cd frontend && pnpm vitest run src/features/duels -t "your turn"`.
- [ ] `make check` passes.

## Phase 3: Dashboard and challenge

**Depends on**: 2

### Context

- `frontend/src/app/router.tsx` — route table; `frontend/src/app/navbar.tsx — Navbar` — player links.
- `frontend/src/components/ui/` — shadcn components present after earlier plans.
- `frontend/src/features/auth/useSession.ts — useSession()` — shows the nav link only when logged in.

### What to build

- shadcn `dialog`, `command`, `badge` via `cd frontend && pnpm dlx shadcn@latest add <name>`, each only when missing from `frontend/src/components/ui/`; `frontend/package.json` and `frontend/pnpm-lock.yaml` updated.
- `frontend/src/features/dashboard/api.ts` — `listDuels()`, `createDuel(username)`, `searchUsers(query)` (`GET /api/users?query=`).
- `frontend/src/features/dashboard/messages.ts`, `frontend/src/features/dashboard/useDebouncedValue.ts`.
- `frontend/src/features/dashboard/ChallengeDialog.tsx` — debounced search list; selecting a user creates the duel and navigates to `/duels/<id>`.
  It shows the `duel_exists`, `self_challenge` and `user_not_found` messages.
- `frontend/src/features/dashboard/DuelList.tsx` — opponent emoji and name, status badge, relative time, points chip when completed; each row links to `/duels/<id>`.
- `frontend/src/features/dashboard/DashboardPage.tsx` — grid: weekly slot first, challenge button, duel list.
- `frontend/src/features/dashboard/DashboardNavLink.tsx`; `frontend/src/app/navbar.tsx` renders it.
- `frontend/src/app/router.tsx` — `/dashboard` inside `RequireUser`.
- Tests: `frontend/src/features/dashboard/DashboardPage.test.tsx`.
- Demo: log in, challenge a user from the dialog, land in the round, return to `/dashboard` and see `waiting`.

### Acceptance criteria

- [ ] Component: the list renders one badge each for `your_turn`, `waiting`, `completed` (with points chip) and `expired`: `cd frontend && pnpm vitest run src/features/dashboard -t "statuses"`.
- [ ] Component: typing a prefix searches once after the debounce; picking a user posts the duel and lands on `/duels/<id>`; `duel_exists` shows its message: `cd frontend && pnpm vitest run src/features/dashboard -t "challenge"`.
- [ ] Component: `section[data-slot="weekly"]` is the first child of the grid: `cd frontend && pnpm vitest run src/features/dashboard -t "weekly slot"`.
- [ ] `make check` passes.
