# Programme: What The Flag rebuild

> Source PRD: [prd-rebuild.md](../prds/prd-rebuild.md)

Seven plans carry the PRD. This file is the only run status. The orchestrator plans, dispatches, reviews and lands; lane agents write code and never land.

## Plans

| Plan | Slice | Phases |
| --- | --- | --- |
| [plan-foundation.md](plan-foundation.md) | Clean slate, handbook scaffold, backend and frontend skeleton, prod files, agent files | 4 |
| [plan-country-data.md](plan-country-data.md) | Vendored sources, importer, generated dataset and flags, `country` catalogue | 3 |
| [plan-accounts.md](plan-accounts.md) | Users, sessions, profile, search, ledger, all-time leaderboard | 5 |
| [plan-quiz-practice.md](plan-quiz-practice.md) | Question generation, quiz sets, rounds, clock, practice, `play` feature | 4 |
| [plan-duels.md](plan-duels.md) | Duels, scoring, duel page, dashboard | 3 |
| [plan-weekly.md](plan-weekly.md) | Weekly challenge, weekly leaderboard, dashboard card | 5 |
| [plan-release-readiness.md](plan-release-readiness.md) | Prod stack locally, browser test, config review, docs, release checklist | 5 |

## Rulings

- The programme runs in a Claude Code cloud session without the `nico` plugin. The skill texts of `implement-plan` and its `programme.md` and `lead.md` are followed by hand.
- No `agent-bus.sh`, `plan-run-guard.sh` or `check-agents.sh`. This file and the scratchpad carry the state.
- Foundation phase 1 installs the toolchains: Go through `GOTOOLCHAIN=auto`, Node from a nodejs.org tarball into `~/.local`.
- A plan is the authority for the names it creates. A consumer re-reads the provider's landed code before its first phase.
- Data is ODbL-1.0, code MIT. Accounts have no email. The UI speaks German and English.

## Waves and lanes

| Wave | Lane | Plans and phases | Waits for |
| --- | --- | --- | --- |
| 1 | `found` | foundation 1–4 | none |
| 2 | `data` | country-data 1–3 | wave 1 |
| 2 | `acct` | accounts 1–5 | wave 1 |
| 3 | `quiz` | quiz-practice 1–4 | wave 2 |
| 4 | `duel` | duels 1–3 | wave 3 |
| 4 | `week` | weekly 1–4 | wave 3 |
| 5 | `mount` | weekly 5 | `duel` landed |
| 6 | `rel` | release-readiness 1–5 | waves 4 and 5 |

- Wave 1 runs foundation phases 2 and 3 in parallel inside the lane: backend and frontend touch disjoint trees.
- Wave 3 runs quiz-practice phases 3 and 4 in parallel inside the lane: frontend only versus backend only.
- Wave 4 caps writers at two lanes. Wave 5 is one small phase in the run worktree.

## File ownership

| File or tree | Wave 2 owner | Wave 4 owner | Rule |
| --- | --- | --- | --- |
| `backend/cmd/what-the-flag/main.go` | `acct` | `duel` | The other lane rebases and re-adds its wiring |
| `frontend/src/app/router.tsx` | `acct` | `duel` | Same |
| `backend/internal/db/` | `acct` | `duel` | Generated; the rebasing lane runs `cd backend && go tool sqlc generate` |
| `Makefile`, `.github/workflows/ci.yml` | `data` | none | Only foundation, country-data and release-readiness edit them |
| `README.md`, `NOTICE`, `data/` | `data` | none | |
| `docs/decisions.md` | `data` lands first | `duel` lands first | Append-only; the rebasing lane re-appends its lines |
| `frontend/src/features/dashboard/` | — | `duel` | `week` touches it only in wave 5 |
| `pnpm-lock.yaml`, `go.mod`, `go.sum` | `acct` | `duel` | The rebasing lane re-runs `pnpm install` or `go mod tidy` |

## Landing order

1. Wave 2: `data` first (smaller surface, no migration), then `acct`.
2. Wave 4: `duel` first (fewer phases, owns the dashboard), then `week`.
3. Every other wave has one lane.

## Stores and migrations

| Lane | Database on the shared dev Postgres | Migrations taken |
| --- | --- | --- |
| `found` | `whattheflag` | 000001 |
| `acct` | `whattheflag_acct` | 000002, 000003 |
| `quiz` | `whattheflag` | 000004 |
| `duel` | `whattheflag_duel` | 000005 |
| `week` | `whattheflag_week` | 000006 |
| `rel` | `whattheflag` plus its own prod-like Compose stack | none |

- One Postgres 18 container from `make db` serves every lane. Each lane sets `POSTGRES_DB` to its own database and migrates it.
- A lane rebased onto a lower migration number drops and recreates its database.
- Every gate runs under `flock /tmp/what-the-flag-gate.lock`, so two gates never share the host at once.

## Spend

None. No paid provider is called. Wikidata, GitHub clones, npm and the Go proxy are free.

## Worktrees

Lanes live in `/home/user/what-the-flag-wt/w<wave>/<lane>` on branch `prog/<lane>`. Briefs and reports live in `/home/user/what-the-flag-wt/w<wave>/`. The base branch is `claude/what-the-flag-rebuild-n93fwl`.

## Owner items

- Apply the hardening calls of the handbook's new-project guide; cloud sessions have no `gh`.
- After release-readiness: tag `v0.1.0`, DNS, server, deploy, backup cron, GHCR read token, imprint and privacy texts, switch off the old hosting.

## Status

| Phase | Lane | Status | Sha | Note |
| --- | --- | --- | --- | --- |
| foundation 1 | found | waiting | | |
| foundation 2 | found | waiting | | |
| foundation 3 | found | waiting | | |
| foundation 4 | found | waiting | | |
| country-data 1 | data | waiting | | |
| country-data 2 | data | waiting | | |
| country-data 3 | data | waiting | | |
| accounts 1 | acct | waiting | | |
| accounts 2 | acct | waiting | | |
| accounts 3 | acct | waiting | | |
| accounts 4 | acct | waiting | | |
| accounts 5 | acct | waiting | | |
| quiz-practice 1 | quiz | waiting | | |
| quiz-practice 2 | quiz | waiting | | |
| quiz-practice 3 | quiz | waiting | | |
| quiz-practice 4 | quiz | waiting | | |
| duels 1 | duel | waiting | | |
| duels 2 | duel | waiting | | |
| duels 3 | duel | waiting | | |
| weekly 1 | week | waiting | | |
| weekly 2 | week | waiting | | |
| weekly 3 | week | waiting | | |
| weekly 4 | week | waiting | | |
| weekly 5 | mount | waiting | | duels 3 |
| release-readiness 1 | rel | waiting | | |
| release-readiness 2 | rel | waiting | | |
| release-readiness 3 | rel | waiting | | |
| release-readiness 4 | rel | waiting | | |
| release-readiness 5 | rel | waiting | | |
