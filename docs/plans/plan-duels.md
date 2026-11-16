# Plan: Duels

> Source PRD: docs/prds/prd-rebuild.md (section "Duels", routes `/api/duels*`, pages `/dashboard`, `/duels/:id`)

## Goal

A player challenges another player by username. Both play the same 10-question quiz set in any order.
The transaction that finishes the second round scores the duel once.
The dashboard lists the viewer's duels with viewer-relative status; `/duels/:id` plays the viewer's round or shows the per-question result.
Runs after foundation, country-data, accounts and quiz-practice; in parallel with the weekly plan.

## Architectural decisions

- **Ownership.** This plan never touches `backend/internal/weekly/`, `frontend/src/features/weekly/` or `database/migrations/000006_*`.
- **Schema** `database/migrations/000005_duels.up.sql`, table `duels`:
  - `id uuid PK DEFAULT uuidv7()`, `quiz_set_id uuid NOT NULL UNIQUE REFERENCES quiz_sets(id)`.
  - `challenger_id`, `opponent_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`; `CHECK (challenger_id <> opponent_id)`.
  - `challenger_round_id`, `opponent_round_id uuid NULL REFERENCES rounds(id)`: set on first start-or-resume.
  - `challenger_correct`, `opponent_correct smallint NULL CHECK (BETWEEN 0 AND 10)`: set when that side's round finishes.
  - `created_at`, `expires_at timestamptz NOT NULL`, `CHECK (expires_at > created_at)`; `completed_at timestamptz NULL`.
  - `lapsed boolean NOT NULL DEFAULT false`: housekeeping flag for the index only; status never reads it.
  - Indexes: `duels_challenger_created_idx (challenger_id, created_at DESC)`, `duels_opponent_created_idx (opponent_id, created_at DESC)`.
- **One open duel per pair.** The partial unique index:
  `CREATE UNIQUE INDEX duels_open_pair_uniq ON duels (LEAST(challenger_id, opponent_id), GREATEST(challenger_id, opponent_id)) WHERE completed_at IS NULL AND NOT lapsed;`
- **Lazy expiry vs. the index.** `now()` is not immutable, so the index cannot test `expires_at`. The create transaction first runs `LapseExpiredPair`: `UPDATE duels SET lapsed = true` for the pair where `completed_at IS NULL AND expires_at <= $now`. Then it inserts. A `23505` on `duels_open_pair_uniq` maps to `duel_exists`, which also settles two concurrent creates.
- **Clock.** `created_at` and `expires_at = created_at + 7×24h` come from the injected clock, not a DB default. Status, expiry and completion all compare against that clock.
- **Status** (pure function `deriveStatus(d Duel, viewer uuid.UUID, now time.Time) Status`, first match wins):
  1. `completed_at` set → `completed`; 2. `now >= expires_at` → `expired`; 3. viewer's `*_correct` set → `waiting`; 4. else → `your_turn`.
- **Scoring** `backend/internal/duel/score.go — Score(correctA, correctB int) (pointsA, pointsB int)`: 10 each for completing; strict winner adds 5 × own correct; 10 correct adds 25.

  | correctA:correctB | pointsA | pointsB |
  | --- | --- | --- |
  | 10:10 | 35 | 35 |
  | 10:9 | 85 | 10 |
  | 7:7 | 10 | 10 |
  | 0:0 | 10 | 10 |
  | 3:8 | 10 | 50 |

- **Finishing hook** `Service.RoundFinished(ctx, tx, round)` is registered for quiz set kind `duel`. In the quiz's finishing transaction it:
  1. `SELECT … FOR UPDATE` the duel by `quiz_set_id`. No duel or already completed: return nil.
  2. Record the finisher's `*_correct`. If `now >= expires_at`: return nil.
  3. If both sides are recorded: set `completed_at`, compute `Score`, call `leaderboard.Award(tx, user, "duel", duelID, points)` per side.
  The row lock serialises two simultaneous finishes; the ledger unique key makes a repeat a no-op.
- **Expiry mid-round.** A round finished after `expires_at` records its count but never completes the duel or awards points.
- **Transactions.** `service.go` declares `TxRunner { InTx(ctx, func(tx pgx.Tx) error) error }` and `Store.WithTx(tx) Store`. Fakes run `fn(nil)` and return themselves. Create runs quiz-set creation, lapse, insert and the challenger's start-or-resume in one transaction.
- **Consumer interfaces** (declared in `backend/internal/duel/service.go`, satisfied by the landed packages):
  - `Users`: `ByUsername(ctx, name) (User, error)`, `PublicByIDs(ctx, ids) (map[uuid.UUID]PublicUser, error)` (username, emoji).
  - `Quiz`: `CreateSet(ctx, tx, kind "duel", n 10) (setID, error)`, `StartOrResume(ctx, tx, setID, userID) (roundID, error)`, `Summary(ctx, roundID, locale) (RoundSummary, error)`.
  - `Ledger`: `Award(ctx, tx, userID, kind, sourceID, points) error`.
- **HTTP** (all behind `account.RequireUser`; errors use the foundation envelope):

  | Route | Body / result | Errors |
  | --- | --- | --- |
  | `POST /api/duels` | `{"opponent": "<username>"}` → 201 `{id, roundId}` | 422 `self_challenge` (field `opponent`), 404 `user_not_found` (field `opponent`), 409 `duel_exists` |
  | `GET /api/duels` | 200 `{duels: [DuelItem]}`, newest 20 by `created_at`, no pagination | — |
  | `GET /api/duels/{id}` | 200 `DuelDetail` | 404 `duel_not_found` for non-participants too |
  | `POST /api/duels/{id}/round` | 200 `{roundId}` | 404 `duel_not_found`, 409 `duel_expired` |

  - `DuelItem`: `id, status, opponent {username, emoji}, createdAt, expiresAt, points` (viewer's points, `null` unless completed).
  - `DuelDetail`: `DuelItem` fields plus `challenger, viewerRound, opponentRound, result`.
  - `viewerRound`: `null` until the viewer's round finished, then the quiz finished-round summary.
  - `opponentRound`: `null` unless `completed`. `result`: `null` unless `completed`, else `{viewer: {correct, points}, opponent: {correct, points}}`.
  - Before the viewer has played, the response holds no question, option or answer. `expired` keeps the viewer's own round only.
- **Frontend.**
  - `frontend/src/features/dashboard/`: `DashboardPage.tsx`, `ChallengeDialog.tsx`, `DuelList.tsx`, `useDebouncedValue.ts`, `api.ts`, `messages.ts`, `DashboardPage.test.tsx`.
  - `frontend/src/features/duels/`: `DuelPage.tsx`, `DuelResult.tsx`, `api.ts`, `messages.ts`, `DuelResult.test.tsx`.
  - Weekly slot: `DashboardPage` renders `<div className="grid gap-4">` whose first child is `<section aria-labelledby="weekly-heading" data-slot="weekly" />`, left empty. The weekly plan replaces that element with its card. Nothing else in `DashboardPage.tsx` changes for it.
  - Opponent search: 250 ms debounce, query only for ≥ 1 character, shadcn `Dialog` + `Command`.
  - Duel list query sets `refetchOnWindowFocus: true` explicitly. Relative time uses `Intl.RelativeTimeFormat` with the active locale.
  - After `POST /api/duels` the dialog navigates to `/duels/<id>`; that page shows the challenger's round at once.
  - `DuelPage`: `your_turn` → `POST /round`, then the play component with `roundId` and `onFinished` (invalidates the duel query). Other statuses → `DuelResult`.
  - Zod schemas for duel responses live in each feature's `api.ts`. No feature imports another feature's internals except the play component.

## Inventory

- `backend/cmd/what-the-flag/main.go — main()` — wiring; adds the duel service, handler and quiz hook.
- `backend/internal/account/ — RequireUser(), user id from context, lookup by username` — auth and opponent lookup.
- `backend/internal/leaderboard/ — Award()` — ledger write inside the hook's transaction.
- `backend/internal/quiz/ — set creation, start-or-resume, finished-round summary, finish hook registration` — duel rounds.
- `backend/internal/httpx/` — JSON read/write, error envelope, locale from context.
- `backend/internal/postgres/` — pool and the integration-test helper.
- `frontend/src/app/router.tsx` — route table (choke file).
- `frontend/src/app/` navbar component — gets the Dashboard link.
- `frontend/src/lib/api.ts` — the single API client and `ApiError`.
- `frontend/src/lib/i18n/ — useMessages()` — localised strings and active locale.
- `frontend/src/features/play/` — the play component (`roundId`, `onFinished`).

## Open questions / Risks

- **Names drift.** Re-check these against landed code before phase 1: "Consumer interfaces", `RequireUser`, the hook registration.
  Also the protected-route element and the faked API client helper. Adapt the adapters, not the decisions.
- **Needed from accounts:** `PublicByIDs` (batch username + emoji). If it has not landed, phase 1 adds it to `backend/internal/account/service.go` and `backend/sqlc/queries/account.sql`.
- **Needed from quiz:** `CreateSet` and `StartOrResume` accept the caller's `pgx.Tx`. The hook receives set id, user id and correct count.
  If not, phase 1 adds the tx-accepting variants in `backend/internal/quiz/service.go`.
- **Generated code.** `backend/internal/db/` and `main.go`/`router.tsx` are shared with the weekly plan. Regenerate sqlc and re-merge those after every rebase.
- **List size.** Newest 20 only. An active duel drops off only after more than 20 newer duels within its seven days. Accepted.
- **Orphaned quiz sets.** Deleting a user cascades the duel; its quiz set and the other player's round remain. Recommended: accept (no PII). Alternative: quiz-practice's cleanup also deletes sets with no duel.
- **Cross-stack browser test** (PRD Testing Decisions). Recommended: a separate e2e plan owns it, since no browser runner is fixed. Alternative: a fifth phase here.

## Phase 1: Duel lifecycle API

**Depends on**: none

### Context

- `database/migrations/000004_quiz.up.sql` — `quiz_sets`, `rounds` referenced by FKs.
- `backend/internal/quiz/service.go` — set creation, start-or-resume, finish hook type.
- `backend/internal/account/service.go`, `backend/internal/leaderboard/service.go` — consumer targets.
- `backend/cmd/what-the-flag/main.go — main()` — wiring.

### What to build

- `database/migrations/000005_duels.up.sql` exactly as in Architectural decisions.
- `backend/sqlc/queries/duel.sql`: `LapseExpiredPair`, `InsertDuel`, `GetDuel`, `GetDuelByQuizSetForUpdate`, `ListDuelsForUser` (both roles, `created_at DESC LIMIT 20`), `SetRoundID`, `SetCorrect`, `CompleteDuel`. Regenerate `backend/internal/db/` with `cd backend && go tool sqlc generate`.
- `backend/internal/duel/score.go — Score()`; `backend/internal/duel/status.go — deriveStatus()`.
- `backend/internal/duel/store.go` — pgx store, `WithTx`, maps `23505` on `duels_open_pair_uniq` to `ErrDuelExists`.
- `backend/internal/duel/service.go` — `Create`, `List`, `Get`, `StartRound`, `RoundFinished`, errors `ErrSelfChallenge`, `ErrUserNotFound`, `ErrDuelExists`, `ErrDuelNotFound`, `ErrDuelExpired`.
- `backend/internal/duel/handler.go — Register()` for the four routes, error-code table, `DuelItem`/`DuelDetail` JSON.
- `backend/cmd/what-the-flag/main.go` — construct store, service, handler; register the hook for kind `duel`.
- Tests: `backend/internal/duel/score_test.go`, `backend/internal/duel/service_test.go` (in-memory fakes, injected clock), `backend/internal/duel/store_test.go` (`//go:build integration`).
- Demo: two curl sessions create a duel, play both rounds via `/api/rounds/*`, read the result and `GET /api/me` points.

### Acceptance criteria

- [ ] Unit (pure): the five-row Score table passes: `cd backend && go test ./internal/duel -run TestScore`.
- [ ] Unit (pure): status precedence over completed, expired, waiting, your_turn: `cd backend && go test ./internal/duel -run TestDeriveStatus`.
- [ ] Service: self-challenge, unknown user and a duplicate open duel (either order) are rejected; a duel created after the clock passes `expires_at` succeeds: `cd backend && go test ./internal/duel -run TestServiceCreate`.
- [ ] Service: a non-participant gets `ErrDuelNotFound`; before playing the detail has no rounds; after playing only `viewerRound`; once completed both rounds and `result`: `cd backend && go test ./internal/duel -run TestServiceGetVisibility`.
- [ ] Service: the second finish completes and awards per `Score` once; a repeated hook awards nothing new; a finish after expiry awards nothing; `StartRound` on an expired duel returns `ErrDuelExpired`: `cd backend && go test ./internal/duel -run TestServiceRoundFinished`.
- [ ] Integration: the partial unique index rejects a second open duel in reverse order, accepts it after `LapseExpiredPair` or `CompleteDuel`; `CHECK` rejects self; deleting a user cascades their duels: `cd backend && go test -tags=integration -race ./internal/duel -run TestStore`.
- [ ] `make check` passes.

## Phase 2: Duel page

**Depends on**: 1

### Context

- `frontend/src/features/play/` — play component, `roundId` and `onFinished`.
- `frontend/src/lib/api.ts`, `frontend/src/lib/i18n/` — client and messages.
- `frontend/src/app/router.tsx` — route table; the accounts plan's protected-route element.

### What to build

- `frontend/src/features/duels/api.ts` — `getDuel(id)`, `startDuelRound(id)` with Zod schemas for `DuelDetail`.
- `frontend/src/features/duels/messages.ts` — `{ de, en }` strings for statuses, waiting text, result labels.
- `frontend/src/features/duels/DuelPage.tsx` — loads the duel; `your_turn` starts or resumes and renders the play component; else `DuelResult`.
- `frontend/src/features/duels/DuelResult.tsx` — header with both players and points; per-question rows comparing both answers with the correct option; waiting view shows own answers only; expired view says so.
- `frontend/src/app/router.tsx` — add `/duels/:id` inside the protected routes.
- Tests: `frontend/src/features/duels/DuelResult.test.tsx` (real query client, faked API client).
- Demo: open `/duels/<id>` from a curl-created duel, play, see the waiting view, then the result after the opponent plays.

### Acceptance criteria

- [ ] Component: a completed duel renders both answers per question, the correct option and each player's points: `cd frontend && pnpm vitest run src/features/duels -t "completed"`.
- [ ] Component: a waiting duel renders own answers and no opponent answer: `cd frontend && pnpm vitest run src/features/duels -t "waiting"`.
- [ ] `make check` passes.

## Phase 3: Dashboard and challenge

**Depends on**: 2

### Context

- `frontend/src/app/router.tsx` — route table.
- `frontend/src/app/` navbar component — player links.
- `frontend/src/components/ui/` — shadcn components present after earlier plans.

### What to build

- shadcn `dialog`, `command`, `badge` via `cd frontend && pnpm dlx shadcn@latest add dialog command badge` (skip ones already present) into `frontend/src/components/ui/`.
- `frontend/src/features/dashboard/api.ts` — `listDuels()`, `createDuel(username)`, `searchUsers(query)` (`GET /api/users?query=`).
- `frontend/src/features/dashboard/messages.ts`, `useDebouncedValue.ts`.
- `frontend/src/features/dashboard/ChallengeDialog.tsx` — debounced search list; selecting a user creates the duel and navigates to `/duels/<id>`; shows `duel_exists`, `self_challenge` messages.
- `frontend/src/features/dashboard/DuelList.tsx` — opponent emoji and name, status badge, relative time, points chip when completed; each row links to `/duels/<id>`.
- `frontend/src/features/dashboard/DashboardPage.tsx` — grid: empty weekly slot first, challenge button, duel list.
- `frontend/src/app/router.tsx` — add `/dashboard` inside the protected routes.
- Navbar component in `frontend/src/app/` — add the Dashboard link for logged-in users.
- Tests: `frontend/src/features/dashboard/DashboardPage.test.tsx`.
- Demo: log in, challenge a user from the dialog, land in the round, return to `/dashboard` and see `waiting`.

### Acceptance criteria

- [ ] Component: the list renders one badge each for `your_turn`, `waiting`, `completed` (with points chip) and `expired`: `cd frontend && pnpm vitest run src/features/dashboard -t "statuses"`.
- [ ] Component: the weekly slot element exists as the first grid child: `cd frontend && pnpm vitest run src/features/dashboard -t "weekly slot"`.
- [ ] `make check` passes.
