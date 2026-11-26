# Programme: What The Flag rebuild

> Source PRD: [prd-rebuild.md](../prds/prd-rebuild.md)

Five plans carry the PRD. They run one after another, so every wave holds one lane.
This file is the only run status. The orchestrator plans, dispatches, reviews and lands; phase agents write code and never land.

## Plans

| # | Plan | Slice | Phases | Ships |
| --- | --- | --- | --- | --- |
| 1 | [plan-foundation.md](plan-foundation.md) | Clean slate, handbook scaffold, backend and frontend skeleton, contract harness, prod and agent files | 4 | |
| 2 | [plan-country-data.md](plan-country-data.md) | Vendored sources, importer, generated dataset and flags, `country` catalogue | 3 | |
| 3 | [plan-country-attributes.md](plan-country-attributes.md) | CLDR language and currency labels, regions, fame tiers in the dataset and catalogue | 2 | |
| 4 | [plan-quiz.md](plan-quiz.md) | Domain core, Postgres and HTTP adapters, leaderboards, challenge, rate limit, owner commands, `play`, `challenge` and `leaderboard` features | 5 | |
| 5 | [plan-release.md](plan-release.md) | Prod stack under test, migrate image, licences, CSP, game rules, docs | 2 | `v0.1.0` |

- `v0.1.0` goes to a silent beta. Later work follows the PRD's Further Notes after the beta.

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
| 3 | `attr` | country-attributes 1–2 |
| 4 | `quiz` | quiz 1–5 |
| 5 | `rel` | release 1–2 |

- Each wave starts when the previous one has landed. The owner tags `v0.1.0` after wave 5.

## Stores and migrations

- One Postgres 18 container from `make db`, database `whattheflag`, backend on port 8080. Every phase migrates it with `make db-migrate`.
- A criterion that calls `go test -tags=integration` directly needs `.env` exported first: `set -a && . ./.env && set +a`.
- Migrations in landing order, each wrapped in `BEGIN; … COMMIT;`:

| Migration | Plan and phase |
| --- | --- |
| `000001_init` | foundation 1 |
| `000002_quiz` | quiz 2 |

## Spend

None. No paid provider is called. Wikidata, GitHub clones, npm and the Go proxy are free.

## Owner items

- Apply the hardening calls of the handbook's new-project guide; cloud sessions have no `gh`.
- After release lands: wait for the green CI push run on `main`, then tag with `make prod-release VERSION=0.1.0`.
- For the first deploy: DNS A/AAAA for `what-the-flag.de` and `www`, provision the server, GHCR read token, `DOMAIN=what-the-flag.de make prod-deploy`, backup cron, imprint and privacy texts before the public launch.
- Optional: re-run `scripts/fetch-data-sources.sh` on a machine with network access to refresh the vendored data.
- After the beta: read `make prod-stats`, decide the public launch, then the lead prunes the PRD, this file and the plans; `docs/game-rules.md` keeps the rules.

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
| country-attributes 1 | attr | landed | e435440 | |
| country-attributes 2 | attr | landed | 31c9fb1 | |
| quiz 1 | quiz | waiting | | |
| quiz 2 | quiz | waiting | | |
| quiz 3 | quiz | waiting | | |
| quiz 4 | quiz | waiting | | |
| quiz 5 | quiz | waiting | | |
| release 1 | rel | waiting | | |
| release 2 | rel | waiting | | |
