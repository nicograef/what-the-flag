# Programme: What The Flag rebuild

> Source PRD: [prd-rebuild.md](../prds/prd-rebuild.md)

Nine plans carry the PRD. This file is the only run status. The orchestrator plans, dispatches, reviews and lands; lane agents write code and never land.
The first deployable version (`v0.1.0`, practice rounds only) comes as early as possible; accounts, duels and weekly follow.

## Plans

| Plan | Slice | Phases |
| --- | --- | --- |
| [plan-foundation.md](plan-foundation.md) | Clean slate, handbook scaffold, backend and frontend skeleton, prod files, agent files | 4 |
| [plan-country-data.md](plan-country-data.md) | Vendored sources, importer, generated dataset and flags, `country` catalogue | 3 |
| [plan-contract.md](plan-contract.md) | `contract/` package, OpenAPI document, black-box suite, CI job `contract`, test helpers | 3 |
| [plan-quiz-practice.md](plan-quiz-practice.md) | Question generation, quiz sets, rounds, clock, practice, `play` feature, practice clean-up, user rounds | 5 |
| [plan-first-release.md](plan-first-release.md) | Prod stack under test, migrate service and image, licences in images, `v0.1.0` check | 3 |
| [plan-accounts.md](plan-accounts.md) | Users, sessions, profile, search, ledger, all-time leaderboard | 5 |
| [plan-duels.md](plan-duels.md) | Duels, scoring, duel page, dashboard | 3 |
| [plan-weekly.md](plan-weekly.md) | Weekly challenge, weekly leaderboard, dashboard card | 5 |
| [plan-release-readiness.md](plan-release-readiness.md) | Browser test, configuration review with CSP, docs, `v1.0.0` checklist | 4 |

- first-release is a plan of its own, not a first phase group of release-readiness. Each lane then runs whole plans or a plain phase range, so `## Phase` and `**Depends on**` parse without cross-wave dependencies inside one plan.

## Rulings

- The programme runs in a Claude Code cloud session without the `nico` plugin. The skill texts of `implement-plan` and its `programme.md` and `lead.md` are followed by hand.
- No `agent-bus.sh`, `plan-run-guard.sh` or `check-agents.sh`. This file and the scratchpad carry the state.
- Foundation phase 1 installs the toolchains: Go through `GOTOOLCHAIN=auto`, Node from a nodejs.org tarball into `~/.local`.
- A plan is the authority for the names it creates. A consumer re-reads the provider's landed code before its first phase.
- Data is ODbL-1.0, code MIT. Accounts have no email. The UI speaks German and English.
- R9, R28: the migrate service and image and the licences in images belong to first-release, no longer to release-readiness.
- R21: foundation creates `Makefile` and `.github/workflows/ci.yml`. country-data adds `data`, `data-check`. contract adds `contract`, `contract-check` and CI job `contract`. first-release adds `e2e`, `prod-migrate` and CI job `e2e`. release-readiness adds `env-check` and its CI job. accounts, quiz-practice, duels and weekly edit neither.
- R29: Docker runs here after `dockerd &` and a wait for `docker info`. Builds use `--network host` and the session CA from a local-only override or build args, never the committed Dockerfiles. Stack checks run locally and in CI; CI is the gate of record.
- R30: Go directly plus a contract suite. No production instance and no user data exist. Every phase that adds or changes an `/api` route edits `contract/openapi.yaml` and `contract/tests/<domain>.test.ts`, and `make contract` passes.
- R31: lanes never call `gh`. The lead reads CI runs through the GitHub MCP tools (`actions_list`, `get_job_logs`). A CI criterion says "CI job `<name>` green on the lane's pushed head (lead checks)".
- Migrations are numbered in landing order. quiz-practice lands before accounts, so quiz takes `000002`; the brief's old reservation (`000004` quiz, `000002`/`000003` accounts) is void.

## Waves and lanes

| Wave | Lane | Plans and phases | Waits for |
| --- | --- | --- | --- |
| 1 | `found` | foundation 1–4 | none |
| 2 | `data` | country-data 1–3 | wave 1 |
| 2 | `cont` | contract 1–3 | wave 1 |
| 3 | `quiz` | quiz-practice 1–4 | wave 2 |
| 3 | `acct` | accounts 1–5 | wave 2 |
| 3 | `first` | first-release 1–3 | `quiz` landed |
| 4 | `quser` | quiz-practice 5 | wave 3 |
| 5 | `duel` | duels 1–3 | wave 4 |
| 5 | `week` | weekly 1–4 | wave 4 |
| 6 | `mount` | weekly 5 | `duel` landed |
| 7 | `rel` | release-readiness 1–4 | waves 5 and 6 |

- Wave 1 runs foundation phases 2 and 3 in parallel inside the lane: backend and frontend touch disjoint trees.
- Wave 2 runs contract phases 2 and 3 in parallel inside the lane: `ci.yml` versus `contract/`.
- Wave 3 runs quiz-practice phases 3 and 4 in parallel inside the lane: frontend only versus backend only.
- Wave 3 never has more than two writers: `first` starts when `quiz` lands. `acct` runs throughout and lands last.
- quiz-practice 1–4 use no account symbol: an inline anonymous viewer and a `rounds.user_id` without FK. Phase 5 adds the FK and `OptionalUser` once accounts has landed.
- Wave 5 caps writers at two lanes. Waves 4 and 6 are one small lane each.

## File ownership

Shared files per wave, pairwise from the plans' paths. The owner lands first; the other lane rebases and re-applies its part.

| File or tree | Wave | Lanes | Owner | Rule |
| --- | --- | --- | --- | --- |
| `Makefile`, `.github/workflows/ci.yml` | 2 | `data`, `cont` | `data` | The rebasing lane re-adds its targets, filter and job |
| `backend/cmd/what-the-flag/main.go` | 3 | `quiz`, `acct` | `quiz` | The rebasing lane re-adds its wiring |
| `backend/internal/db/` | 3 | `quiz`, `acct` | `quiz` | Generated; the rebasing lane runs `cd backend && go tool sqlc generate` |
| `backend/go.mod`, `backend/go.sum` | 3 | `quiz`, `acct` | `quiz` | The rebasing lane runs `go mod tidy` |
| `contract/openapi.yaml` | 3 | `quiz`, `acct` | `quiz` | Choke file; the rebasing lane re-adds its paths and runs `make contract-check` |
| `frontend/src/app/router.tsx` | 3 | `quiz`, `acct` | `quiz` | The rebasing lane re-adds its routes |
| `frontend/package.json`, `frontend/pnpm-lock.yaml`, `frontend/src/components/ui/` | 3 | `quiz`, `acct` | `quiz` | The rebasing lane re-runs `pnpm install` and the shadcn CLI |
| `docs/decisions.md` | 3 | `first`, `acct` | `first` | Append-only; `acct` touches it only on the R16 fallback |
| `backend/cmd/what-the-flag/main.go`, `backend/internal/db/` | 5 | `duel`, `week` | `duel` | As in wave 3 |
| `contract/openapi.yaml`, `frontend/src/app/router.tsx` | 5 | `duel`, `week` | `duel` | As in wave 3 |
| `frontend/src/features/dashboard/` | 5, 6 | `duel`, `mount` | `duel` | `week` touches it only in wave 6 |

- `quiz` and `first` share no file. `README.md`, `NOTICE` and `data/` belong to `data` alone in wave 2.
- Choke files for every route-adding phase: `contract/openapi.yaml`, `backend/cmd/what-the-flag/main.go`, `frontend/src/app/router.tsx`.

## Landing order

1. Wave 2: `data` first (smaller surface, no migration), then `cont`.
2. Wave 3: `quiz`, then `first`, then `acct`. Push the run branch right after `first` lands, so CI runs on the `v0.1.0` candidate.
3. Wave 5: `duel` first (fewer phases, owns the dashboard), then `week`.
4. Every other wave has one lane.

## Stores and migrations

| Lane | Database on the shared dev Postgres | Backend port (`APP_PORT`, `CONTRACT_BASE_URL`) | Migrations taken |
| --- | --- | --- | --- |
| `found` | `whattheflag` | 8080 | 000001 |
| `data` | none | none | none |
| `cont` | `whattheflag_cont` | 8081 | none |
| `quiz` | `whattheflag_quiz` | 8082 | 000002 (`quiz`) |
| `first` | its own `what-the-flag-e2e` Compose project, edge on 8443 | none | none |
| `acct` | `whattheflag_acct` | 8083 | 000003 (`accounts`), 000004 (`ledger`) |
| `quser` | `whattheflag` | 8080 | 000005 (`rounds_user_fk`) |
| `duel` | `whattheflag_duel` | 8084 | 000006 (`duels`) |
| `week` | `whattheflag_week` | 8085 | 000007 (`weekly`) |
| `mount` | none | none | none |
| `rel` | its own `what-the-flag-e2e` Compose project | 8080 | none |

- One Postgres 18 container from `make db` serves every lane. Each lane sets `POSTGRES_DB`, `APP_PORT` and `CONTRACT_BASE_URL=http://localhost:<port>` and migrates its own database.
- A lane rebased onto a lower migration number drops and recreates its database: `acct` after `quiz` lands.
- Every gate runs under `flock /tmp/what-the-flag-gate.lock`, so two gates never share the host at once.

## Spend

None. No paid provider is called. Wikidata, GitHub clones, npm and the Go proxy are free.

## Worktrees

Lanes live in `/home/user/what-the-flag-wt/w<wave>/<lane>` on branch `prog/<lane>`. Briefs and reports live in `/home/user/what-the-flag-wt/w<wave>/`. The base branch is `claude/what-the-flag-rebuild-n93fwl`.

## Owner items

- Apply the hardening calls of the handbook's new-project guide; cloud sessions have no `gh`.
- After first-release lands: point `main` at its landing sha, wait for the green CI push run, then tag with `make prod-release VERSION=0.1.0`. `acct` need not wait for the tag.
- For the first deploy: DNS A/AAAA for `what-the-flag.de` and `www`, provision the server, GHCR read token, `DOMAIN=what-the-flag.de make prod-deploy`, backup cron, imprint and privacy texts before the public launch.
- After release-readiness lands: tag the full release with `make prod-release VERSION=1.0.0`, then `make prod-deploy`.

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
| contract 1 | cont | waiting | | |
| contract 2 | cont | waiting | | |
| contract 3 | cont | waiting | | |
| quiz-practice 1 | quiz | waiting | | |
| quiz-practice 2 | quiz | waiting | | |
| quiz-practice 3 | quiz | waiting | | |
| quiz-practice 4 | quiz | waiting | | |
| first-release 1 | first | waiting | | quiz-practice 4 |
| first-release 2 | first | waiting | | |
| first-release 3 | first | waiting | | |
| accounts 1 | acct | waiting | | |
| accounts 2 | acct | waiting | | |
| accounts 3 | acct | waiting | | |
| accounts 4 | acct | waiting | | |
| accounts 5 | acct | waiting | | |
| quiz-practice 5 | quser | waiting | | accounts 5 |
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
