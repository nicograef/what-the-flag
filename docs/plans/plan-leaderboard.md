# Plan: Leaderboard

> Source PRD: docs/prds/prd-rebuild.md (Leaderboard, HTTP contract, Frontend)

## Goal

Every finished run becomes an entry with name, score and end time.
`GET /api/leaderboard` returns the top 100 of today and of all time, plus the ranks of one run.
The run result shows both ranks, and `/leaderboard` shows both lists.

## Architectural decisions

### Module (`backend/internal/leaderboard/`)

- `leaderboard` owns its table and never reads `runs`. quiz reaches it only through `quiz.FinishHook`.
- `Recorder` implements `quiz.FinishHook`: `RunFinished` inserts one entry on the quiz transaction, `ON CONFLICT (run_id) DO NOTHING`.
  A nil transaction returns `ErrNilTx`.
- `backend/internal/app/app.go — services()` creates the recorder and calls `quizService.OnFinished(recorder)`, so the sweep records too.

### Schema (`database/migrations/000003_leaderboard.up.sql`, wrapped in `BEGIN; … COMMIT;`)

| Table | Columns and constraints |
| --- | --- |
| `leaderboard_entries` | `run_id uuid PRIMARY KEY`, `name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 20)`, `score integer NOT NULL CHECK (score >= 0)`, `finished_at timestamptz NOT NULL`; index `(score DESC, finished_at, run_id)`; index `(finished_at)` |

- No foreign key to `runs`: the sweep deletes runs after 7 days, and the entry stays.
- `run_id` never leaves the server except as the `run` query parameter its own visitor sends.

### Ranking

- Order: `score DESC, finished_at ASC, run_id ASC`. Rank: `rank() OVER (ORDER BY score DESC)`, so equal scores share a rank.
- Today: `finished_at >= start of today in Europe/Berlin`. The service computes that instant in Go with `time.LoadLocation("Europe/Berlin")`.
  The package imports `time/tzdata`, so the backend image needs no zoneinfo files.
- A run's all-time rank is `1 + count(score > s)`. Its today rank is `1 + count(score > s AND finished_at >= start)`, or null when the entry ended before `start`.
- Each list holds at most 100 rows.

### Service API (`backend/internal/leaderboard/service.go`)

| Signature | Behaviour |
| --- | --- |
| `NewService(store Store, now func() time.Time) *Service` | |
| `NewRecorder(store Store) *Recorder` | the quiz finish hook |
| `Board(ctx context.Context, runID *uuid.UUID) (Board, error)` | both lists; with a run id, that run's ranks or nil when unknown |

| Type | Definition |
| --- | --- |
| `Entry` | `struct{ Rank int; Name string; Score int; FinishedAt time.Time }` |
| `Board` | `struct{ Today, AllTime []Entry; Run *RunRank }` |
| `RunRank` | `struct{ Name string; Score int; TodayRank *int; AllTimeRank int }` |

- `Store` and `backend/internal/leaderboard/store.go — NewStore(db DB)` follow the quiz pattern: `DB` is `DBTX` plus `Begin`.
- sqlc: a `leaderboard` block in `backend/sqlc.yaml`, queries `backend/sqlc/queries/leaderboard.sql`, output `backend/internal/leaderboard/internal/db`.

### HTTP (`backend/internal/leaderboard/handler.go`)

| Route | Query | Response |
| --- | --- | --- |
| `GET /api/leaderboard` | optional `run=<uuid>` | 200 `{"today": [...], "allTime": [...], "run": {...} \| null}` |

- A list row is `{"rank","name","score","finishedAt"}`; `finishedAt` is RFC 3339 with ms.
- `run` is `{"name","score","todayRank","allTimeRank"}`, `todayRank` nullable. An unknown or unparsable `run` gives `"run": null`, never an error.
- Contract tests: `backend/internal/contract/leaderboard_integration_test.go`.

### Frontend (`frontend/src/features/leaderboard/`)

- `api.ts — getLeaderboard(api, runId?)`, `useLeaderboard(runId?)` with a Zod schema; query key `['leaderboard', runId ?? null]`.
- `leaderboard-page.tsx — LeaderboardPage` on `/leaderboard`: shadcn `tabs` "Heute"/"Today" and "Gesamt"/"All time", today first.
  A table per tab: rank, name, score. An empty list shows a hint text. With `?run=<id>`, the run's row is highlighted by rank, name and score.
- `run-ranks.tsx — RunRanks({ runId })`: "Rank X today · Rank Y all time"; the today part is left out when `todayRank` is null.
- `frontend/src/features/play/run-result.tsx` renders `RunRanks` and links to `/leaderboard?run=<runId>`.
- `frontend/src/app/navbar.tsx`: a leaderboard link in `nav-right`, before the language switch.

## Inventory

- `backend/internal/quiz — FinishHook, FinishedRun, Service.OnFinished()`, `backend/internal/app/app.go — services()` (runs) — the hook and its wiring.
- `backend/internal/postgres — TestPool(), TestTx()`, `backend/internal/httpx — WriteJSON()` (foundation).
- `backend/internal/contract/runs_integration_test.go — correctOption()` (runs) — finishing a run in a contract test.
- `frontend/src/features/play/run-result.tsx`, `frontend/src/features/play/fake-run.ts` (runs), `frontend/src/app/navbar.tsx`, `frontend/src/app/router.tsx` (foundation).

## Open questions / Risks

- Ranks count over the whole table. At millions of entries, `count(score > s)` needs the score index; it has one.
- Contract tests share one database with other packages, so they assert the run's own row, never list positions.

## Phase 1: Entries, rankings and the route

**Depends on**: none

### Context

- See Inventory. Integration criteria need `make db` running.

### What to build

- `database/migrations/000003_leaderboard.up.sql`; `backend/sqlc.yaml` (leaderboard block); `backend/sqlc/queries/leaderboard.sql`; generated `backend/internal/leaderboard/internal/db/`.
- `backend/internal/leaderboard/model.go`, `store.go`, `service.go`, `recorder.go`, `handler.go`; `backend/internal/app/app.go — services()` wiring.
- `backend/internal/leaderboard/store_integration_test.go`, each test on `postgres.TestTx(t)`:
  - `TestBoard`: equal scores share a rank; ties order by earlier end; the 101st entry is cut.
  - An entry from yesterday (Berlin) is in all time only; its run rank has a null today rank.
  - Today's boundary sits at Berlin midnight in winter and in summer time.
  - `TestRecorder`: a second call for one run writes nothing; a nil tx is `ErrNilTx`.
- `backend/internal/contract/leaderboard_integration_test.go — TestLeaderboard`: a run started and ended wrong at once has score 0.
  `GET /api/leaderboard?run=<id>` returns its name, score 0 and both ranks ≥ 1. An unknown and a garbage `run` give `"run": null`.
  No list row and no field holds a run id.
- `docs/decisions.md`: `D11`: leaderboard entries copy name and score and keep no foreign key to runs. Reason: runs are deleted after 7 days, entries stay.

### Acceptance criteria

- [ ] Store (Postgres): `make db-migrate && cd backend && go test -tags=integration -race ./internal/leaderboard`
- [ ] Contract: `make db-migrate && cd backend && go test -tags=integration ./internal/contract -run TestLeaderboard`
- [ ] `make check` passes.

## Phase 2: Leaderboard page and ranks in the result

**Depends on**: 1

### Context

- `frontend/src/features/play/run-result.tsx`, `frontend/src/features/play/fake-run.ts`, `frontend/src/app/navbar.tsx`, `frontend/src/app/router.tsx`, `frontend/src/test/`.

### What to build

- shadcn `tabs` and `table` via `cd frontend && pnpm dlx shadcn@latest add <name>`, only if missing; `frontend/package.json`, `frontend/pnpm-lock.yaml` as the CLI changes them.
- `frontend/src/features/leaderboard/api.ts`, `leaderboard-page.tsx`, `run-ranks.tsx`, `messages.ts`.
- `frontend/src/app/router.tsx`: `/leaderboard` to `LeaderboardPage`. `frontend/src/app/navbar.tsx`: the link; its text in `frontend/src/app/messages.ts`.
- `frontend/src/features/play/run-result.tsx`: `RunRanks` and the leaderboard link.
- `frontend/src/features/leaderboard/leaderboard-page.test.tsx`:
  - today's tab shows first, and switching tabs shows all time;
  - an empty list shows the hint;
  - `?run=` highlights the run's row;
  - the navbar link leads there;
  - a language switch sends no request.
- `frontend/src/features/play/play.test.tsx`: the result shows both ranks, or only all time when `todayRank` is null, and links to `/leaderboard?run=<id>`.

### Acceptance criteria

- [ ] Component: `pnpm --dir frontend exec vitest run src/features/leaderboard src/features/play`
- [ ] With `make db`, `make db-migrate`, `make be` and `make fe` running: `curl -fsS localhost:5173/api/leaderboard | jq -e '.today and .allTime'`
- [ ] `make check` passes.
