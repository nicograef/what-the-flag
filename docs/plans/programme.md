# Programme: player identity, quiz domain and redesign

Plans:
- [plan-anonymous-player.md](plan-anonymous-player.md) (slug `anonymous-player`);
- [plan-quiz-domain-now.md](plan-quiz-domain-now.md) (slug `quiz-domain-now`);
- [plan-redesign.md](plan-redesign.md) (slug `redesign`);
- [plan-question-kinds.md](plan-question-kinds.md) (slug `question-kinds`).

Lead: the orchestrating session. Lanes live under `../what-the-flag-wt/w<wave>/<lane>` on branch `lane/<lane>`.

## Waves and lanes

| Wave | Lane | Plan phases | Starts when |
| --- | --- | --- | --- |
| 1 | player | anonymous-player 1–3 | now |
| 1 | domain-data | quiz-domain-now 1–4 | now |
| 1 | domain-data | quiz-domain-now 5 | player has landed; the lead rebases the lane first, because phase 5 edits player-owned `present.go`, goldens and `features/play/api.ts` |
| 2 | redesign | redesign 1–9; frontend only | player has landed |
| 2 | domain-engine | quiz-domain-now 6, 7 (backend only) and 8 | player and domain-data have landed |
| 2 | redesign | redesign 10–12 | domain-engine has landed; the lead rebases the lane first |
| 3 | kinds | question-kinds 1–6 | domain-engine and redesign have landed |

- The redesign lane stops after its phase 9. Its phases 10 and 11 read `level` and `result.fact`.
- Wave 2 runs redesign and domain-engine at once. They share only `features/play/api.ts`, where domain-engine adds the `fact` schema; the lead's rebase before redesign 10 folds it in.

## File ownership

| Files | Owner | Other lanes |
| --- | --- | --- |
| `database/migrations/`, `backend/sqlc/`, `backend/internal/quiz/{service,ports,run}.go`, `backend/internal/quiz/postgres/`, `backend/internal/quiz/httpapi/`, `backend/internal/contract/` | player (wave 1), then domain-engine (wave 2) | domain-data touches only `httpapi/present.go` (`level`, phase 5) and the goldens; it rebases onto player and regenerates the goldens its data or `level` changes |
| `frontend/src/features/{play,leaderboard,challenge}/`, `frontend/src/test/` | player (wave 1), then redesign (wave 2) | domain-data and domain-engine touch only the schemas in `features/play/api.ts`: `level` (domain-data) and `fact` (domain-engine), with the goldens that carry them |
| `frontend/src/index.css`, `frontend/src/components/ui/`, `frontend/src/app/layout.tsx`, `frontend/index.html`, `frontend/package.json`, `frontend/pnpm-lock.yaml`, `docs/redesign/` | redesign (wave 2) | no other lane touches them |
| `backend/internal/quiz/{options,generate,question}.go` and their tests, `backend/cmd/`, `backend/internal/country/`, `data/`, `scripts/fetch-data-sources.sh`, `Makefile`, `NOTICE` | domain-data | player must not touch them, except the `Makefile`'s `hide-run` define and the `hide` and `prod-hide` targets |
| `frontend/src/app/messages.ts` | domain-data first | the lead rebases the redesign lane onto domain-data |
| `backend/internal/quiz/memory_test.go` | player | domain-data rebases |
| `docs/game-rules.md`, `docs/UBIQUITOUS_LANGUAGE.md`, `docs/decisions.md`, `docs/prds/` | whoever lands first; player is expected first | the later lane rebases its doc lines |

The kinds lane runs alone in wave 3 and owns every file it touches.

## Landing order

1. player
2. domain-data
3. domain-engine
4. redesign
5. kinds

## Stores

The dev Postgres container `what-the-flag-dev-postgres-1` holds one database per backend lane:
- `wtf_player`
- `wtf_domain_data`
- `wtf_domain_engine`
- `wtf_kinds`

The redesign lane is frontend only and needs none.

A lane runs make with its database on the command line: `make POSTGRES_DB="$POSTGRES_DB" <target>`. Only make loads `.env`, and inside make `.env` beats the environment.
One integration test runs as `make POSTGRES_DB="$POSTGRES_DB" be-integration TEST_ARGS='-count=1 -v -run=TestX' | grep -q -- '--- PASS: TestX'`.
Every gate runs under `flock /tmp/wtf-gate.lock`.

## Migrations

| Number | Lane |
| --- | --- |
| 000006 | player (`players`, `runs.player_id`) |
| 000007 | kinds (new question type ids) |

## Spend

None. Wikimedia, Wikidata, CLDR and auswaertiges-amt.de fetches are free.

## Status

| Phase | Lane | Status | Note |
| --- | --- | --- | --- |
| anonymous-player 1 | player | running | |
| anonymous-player 2 | player | running | |
| anonymous-player 3 | player | running | |
| quiz-domain-now 1 | domain-data | running | |
| quiz-domain-now 2 | domain-data | running | |
| quiz-domain-now 3 | domain-data | running | |
| quiz-domain-now 4 | domain-data | running | |
| quiz-domain-now 5 | domain-data | waiting | player lands |
| quiz-domain-now 6 | domain-engine | waiting | player and domain-data land |
| quiz-domain-now 7 | domain-engine | waiting | player and domain-data land |
| quiz-domain-now 8 | domain-engine | waiting | player and domain-data land |
| redesign 1–9 | redesign | waiting | player lands |
| redesign 10–12 | redesign | waiting | domain-engine lands |
| question-kinds 1 | kinds | waiting | domain-engine and redesign land |
| question-kinds 2 | kinds | waiting | domain-engine and redesign land |
| question-kinds 3 | kinds | waiting | domain-engine and redesign land |
| question-kinds 4 | kinds | waiting | domain-engine and redesign land |
| question-kinds 5 | kinds | waiting | domain-engine and redesign land |
| question-kinds 6 | kinds | waiting | domain-engine and redesign land |
