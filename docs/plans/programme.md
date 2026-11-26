# Programme: What The Flag rebuild

> Source PRD: [prd-rebuild.md](../prds/prd-rebuild.md)

Seven plans carry the PRD. They run one after another, so every wave holds one lane.
This file is the only run status. The orchestrator plans, dispatches, reviews and lands; phase agents write code and never land.

## Plans

| # | Plan | Slice | Phases | Ships |
| --- | --- | --- | --- | --- |
| 1 | [plan-foundation.md](plan-foundation.md) | Clean slate, handbook scaffold, backend and frontend skeleton, contract harness, prod and agent files | 4 | |
| 2 | [plan-country-data.md](plan-country-data.md) | Vendored sources, importer, generated dataset and flags, `country` catalogue | 3 | |
| 3 | [plan-quiz-practice.md](plan-quiz-practice.md) | Question generation, quiz sets, rounds, clock, practice, `play` feature | 3 | |
| 4 | [plan-first-release.md](plan-first-release.md) | Prod stack under test, migrate service and image, licences in images | 2 | `v0.1.0` |
| 5 | [plan-accounts.md](plan-accounts.md) | Users, sessions, rate limits, profile, emoji, deletion, user search | 4 | |
| 6 | [plan-duels.md](plan-duels.md) | User rounds, duels, scoring, ledger, dashboard, all-time leaderboard | 4 | |
| 7 | [plan-release-readiness.md](plan-release-readiness.md) | Browser test, CSP review, game rules doc, `v1.0.0` checklist | 3 | `v1.0.0` |

- No release ships between `v0.1.0` (practice only) and `v1.0.0` (accounts and duels).

## Session setup

Every session that runs this programme checks these before wave 1 and after a container restart:

- The handbook repo `nicograef/handbook` is cloned at `/home/user/handbook`. The plans write it as `<handbook>`. A cloud session attaches it with `add_repo`, then clones it there.
- The handbook is the Claude environment: `<handbook>/claude/global.md` holds the working rules and `<handbook>/AGENTS.md` the repo rules. Lead and every phase agent read both first.
- The skills come from `<handbook>/plugin/skills/`, read as text: `implement-plan` (`SKILL.md`, `programme.md`, `lead.md`) for the lead, `plan` for plan edits, `debug` for failures.
- Templates, guides and references come from `<handbook>/templates/`, `<handbook>/guides/` and `<handbook>/reference/`. A plan step that names them reads the clone, not memory.
- Every phase brief names these paths, so a phase agent needs no context from the lead's conversation.
- The base branch is the session's own branch, created from the current `main`. The lead writes its name into the Rulings line on the base branch before wave 1.

## Rulings

- The programme runs in a Claude Code cloud session without the `nico` plugin. The texts of `implement-plan`, its `programme.md` and `lead.md` are followed by hand.
- No `agent-bus.sh`, `plan-run-guard.sh` or `check-agents.sh`. This file and the git log carry the state.
- Sequential run: one plan at a time, its phases in order. No parallel lanes, no worktrees, no file-ownership table, no `flock`.
- A phase agent works in `/home/user/what-the-flag` on the base branch `ccr-75a2d59d-v315yq` and commits its phase. It does not push.
- The lead reviews each phase against its criteria, flips its Status row in a follow-up commit, then pushes. A replaced container then loses at most one phase.
- Lane results arrive as agent completion notices. One hourly scheduled check-in re-reads this file and `git log`; no 15-minute check-in.
- Phase agents never call `gh`. After the push of a plan's last phase, the lead reads CI through the GitHub MCP tools (`actions_list`, `get_job_logs`). A red job reopens that plan.
- Foundation phase 1 installs the toolchains: Go through `GOTOOLCHAIN=auto`, Node from a nodejs.org tarball into `~/.local`.
- Docker runs here after `dockerd &` and a wait for `docker info`. Builds use `--network host` and the session CA from the gitignored `docker-compose.local.yml`, never the committed Dockerfiles. CI is the gate of record.
- A plan is the authority for the names it creates. A later plan re-reads the landed code before its first phase; the landed code wins over a plan's prose.
- Durable architecture decisions live in `docs/decisions.md`, not here.

## Waves and lanes

| Wave | Lane | Plan and phases |
| --- | --- | --- |
| 1 | `found` | foundation 1–4 |
| 2 | `data` | country-data 1–3 |
| 3 | `quiz` | quiz-practice 1–3 |
| 4 | `first` | first-release 1–2 |
| 5 | `acct` | accounts 1–4 |
| 6 | `duel` | duels 1–4 |
| 7 | `rel` | release-readiness 1–3 |

- Each wave starts when the previous one has landed. The owner may tag `v0.1.0` after wave 4 while wave 5 runs.

## Stores and migrations

- One Postgres 18 container from `make db`, database `whattheflag`, backend on port 8080. Every phase migrates it with `make db-migrate`.
- A criterion that calls `go test -tags=integration` directly needs `.env` exported first: `set -a && . ./.env && set +a`.
- Migrations in landing order, each wrapped in `BEGIN; … COMMIT;`:

| Migration | Plan and phase |
| --- | --- |
| `000001_init` | foundation 2 |
| `000002_quiz` | quiz-practice 1 |
| `000003_accounts` (with the `rounds.user_id` foreign key) | accounts 1 |
| `000004_ledger` | duels 1 |
| `000005_duels` | duels 1 |

## Spend

None. No paid provider is called. Wikidata, GitHub clones, npm and the Go proxy are free.

## Owner items

- Apply the hardening calls of the handbook's new-project guide; cloud sessions have no `gh`.
- After first-release lands: point `main` at its landing sha, wait for the green CI push run, then tag with `make prod-release VERSION=0.1.0`.
- For the first deploy: DNS A/AAAA for `what-the-flag.de` and `www`, provision the server, GHCR read token, `DOMAIN=what-the-flag.de make prod-deploy`, backup cron, imprint and privacy texts before the public launch.
- Optional: re-run `scripts/fetch-data-sources.sh` on a machine with network access to refresh the vendored data.
- After release-readiness lands: tag `make prod-release VERSION=1.0.0`, then `make prod-deploy`. The lead then prunes the PRD, this file and the plans; `docs/game-rules.md` keeps the rules.

## Status

| Phase | Lane | Status | Sha | Note |
| --- | --- | --- | --- | --- |
| foundation 1 | found | landed | eb85d78 | migration 000001_init |
| foundation 2 | found | landed | 5e1db90 | |
| foundation 3 | found | landed | ab651d5 | |
| foundation 4 | found | landed | e255b9f | |
| country-data 1 | data | waiting | | |
| country-data 2 | data | waiting | | |
| country-data 3 | data | waiting | | |
| quiz-practice 1 | quiz | waiting | | |
| quiz-practice 2 | quiz | waiting | | |
| quiz-practice 3 | quiz | waiting | | |
| first-release 1 | first | waiting | | |
| first-release 2 | first | waiting | | |
| accounts 1 | acct | waiting | | |
| accounts 2 | acct | waiting | | |
| accounts 3 | acct | waiting | | |
| accounts 4 | acct | waiting | | |
| duels 1 | duel | waiting | | |
| duels 2 | duel | waiting | | |
| duels 3 | duel | waiting | | |
| duels 4 | duel | waiting | | |
| release-readiness 1 | rel | waiting | | |
| release-readiness 2 | rel | waiting | | |
| release-readiness 3 | rel | waiting | | |
