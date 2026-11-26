# Programme: What The Flag rebuild

> Source PRD: [prd-rebuild.md](../prds/prd-rebuild.md)

Six plans carry the PRD. They run one after another, so every wave holds one lane.
This file is the only run status. The orchestrator plans, dispatches, reviews and lands; phase agents write code and never land.

## Plans

| # | Plan | Slice | Phases | Ships |
| --- | --- | --- | --- | --- |
| 1 | [plan-foundation.md](plan-foundation.md) | Clean slate, handbook scaffold, backend and frontend skeleton, contract harness, prod and agent files | 4 | |
| 2 | [plan-country-data.md](plan-country-data.md) | Vendored sources, importer, generated dataset and flags, `country` catalogue | 3 | |
| 3 | [plan-runs.md](plan-runs.md) | Name rules, question generation, runs, clock, sweep, word filter, rate limit, `play` feature | 4 | |
| 4 | [plan-leaderboard.md](plan-leaderboard.md) | Entries, today and all-time rankings, `leaderboard` feature, ranks in the result | 2 | |
| 5 | [plan-first-release.md](plan-first-release.md) | Prod stack under test, migrate service and image, licences in images | 2 | `v0.1.0` |
| 6 | [plan-release-readiness.md](plan-release-readiness.md) | Browser test, CSP review, game rules doc, `v1.0.0` checklist | 3 | `v1.0.0` |

- `v0.1.0` ships the whole game. `v1.0.0` adds the browser test, the CSP and the final docs.

## Session setup

Every session that runs this programme checks these before wave 1 and after a container restart:

- The handbook repo `nicograef/handbook` is cloned at `/home/user/handbook`. The plans write it as `<handbook>`. A cloud session attaches it with `add_repo`, then clones it there.
- The handbook is the Claude environment: `<handbook>/claude/global.md` holds the working rules and `<handbook>/AGENTS.md` the repo rules. Lead and every phase agent read both first.
- The skills come from `<handbook>/plugin/skills/`, read as text: `implement-plan` (`SKILL.md`, `programme.md`, `lead.md`) for the lead, `plan` for plan edits, `debug` for failures.
- Templates, guides and references come from `<handbook>/templates/`, `<handbook>/guides/` and `<handbook>/reference/`. A plan step that names them reads the clone, not memory.
- Every phase brief names these paths, so a phase agent needs no context from the lead's conversation.
- The base branch is `main`. The lead names it in the Rulings line and pushes there after each phase.

## Rulings

- The programme runs in a Claude Code cloud session without the `nico` plugin. The texts of `implement-plan`, its `programme.md` and `lead.md` are followed by hand.
- No `agent-bus.sh`, `plan-run-guard.sh` or `check-agents.sh`. This file and the git log carry the state.
- Sequential run: one plan at a time, its phases in order. No parallel lanes, no worktrees, no file-ownership table, no `flock`.
- A phase agent works in `/home/user/what-the-flag` on the base branch `main` and commits its phase. It does not push.
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
| 3 | `runs` | runs 1–4 |
| 4 | `board` | leaderboard 1–2 |
| 5 | `first` | first-release 1–2 |
| 6 | `rel` | release-readiness 1–3 |

- Each wave starts when the previous one has landed. The owner may tag `v0.1.0` after wave 5 while wave 6 runs.

## Stores and migrations

- One Postgres 18 container from `make db`, database `whattheflag`, backend on port 8080. Every phase migrates it with `make db-migrate`.
- A criterion that calls `go test -tags=integration` directly needs `.env` exported first: `set -a && . ./.env && set +a`.
- Migrations in landing order, each wrapped in `BEGIN; … COMMIT;`:

| Migration | Plan and phase |
| --- | --- |
| `000001_init` | foundation 1 |
| `000002_runs` | runs 1 |
| `000003_leaderboard` | leaderboard 1 |

## Spend

None. No paid provider is called. Wikidata, GitHub clones, npm and the Go proxy are free.

## Owner items

- Apply the hardening calls of the handbook's new-project guide; cloud sessions have no `gh`.
- After first-release lands: wait for the green CI push run on `main`, then tag with `make prod-release VERSION=0.1.0`.
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
| country-data 1 | data | landed | 408f493 | |
| country-data 2 | data | landed | 727bbba | |
| country-data 3 | data | landed | ebe71b1 | |
| runs 1 | runs | waiting | | |
| runs 2 | runs | waiting | | |
| runs 3 | runs | waiting | | |
| runs 4 | runs | waiting | | |
| leaderboard 1 | board | waiting | | |
| leaderboard 2 | board | waiting | | |
| first-release 1 | first | waiting | | |
| first-release 2 | first | waiting | | |
| release-readiness 1 | rel | waiting | | |
| release-readiness 2 | rel | waiting | | |
| release-readiness 3 | rel | waiting | | |
