# PRD: What The Flag rebuild

## Problem Statement

What The Flag is a quiz about flags, countries and capitals for `what-the-flag.de`.
The old app was a duel game: nobody could play without an account and a second registered player.
Its timer ran in the browser, its flag URLs revealed the answer, and all text was English.

The owner wants a game anyone plays within seconds. There are no accounts, logins, sessions, friends or duels.
The only personal input is a name the visitor chooses for the leaderboard.

## Solution

A visitor enters a name and starts a run at once. Questions follow one after another.
A run lasts until the first wrong or late answer. Its score is the number of correct answers.
Every finished run lands on a public leaderboard with two lists: all time and today.

The server serves one question at a time, starts its clock and checks every answer.
The interface speaks German and English. Country data and flags are vendored; nothing is fetched at runtime.
The stack follows the handbook's Go + React row: Go backend, Postgres, React with shadcn/ui, Caddy edge.

## User Stories

Visitor:

- As a visitor, I want to type any name and start at once, so that I play without signing up.
- As a visitor, I want questions one after another while I answer right, so that I can beat my record.
- As a visitor, I want each question to run against a fair clock, so that nobody gains time by cheating.
- As a visitor, I want to see the correct answer when I miss, so that I learn from the mistake.
- As a visitor, I want to resume a run after a reload, so that a lost connection costs nothing.
- As a visitor, I want my score and my rank today and of all time, so that I see where I stand.
- As a visitor, I want to browse today's and the all-time leaderboard, so that I see the best runs.
- As a visitor, I want to play again with my name prefilled, so that a new run takes one click.
- As a visitor, I want the interface in German or English, so that I read country names in my language.

Owner:

- As the owner, I want no data kept beyond the chosen name, score and time, so that the site holds no personal data.
- As the owner, I want run starts rate limited and names filtered, so that the leaderboard stays usable.
- As the owner, I want all country data checked in with sources and licences, so that nothing loads at runtime.
- As the owner, I want one command that rebuilds the dataset from the vendored sources, so that fixes are reproducible.
- As the owner, I want `make check` and CI to gate every change, so that it matches my handbook projects.
- As the owner, I want a tagged release to produce deployable images, so that deployment follows the handbook runbook.

## Implementation Decisions

### Approach

Three shapes were weighed for the endless game:

| Approach | Effort | Risk | Pick |
| --- | --- | --- | --- |
| Pre-generate a run as a set of all 197 questions | Low | 197 stored rows per run, most never served | No |
| Generate each question when served, from a per-run seed | Low | A dataset change during a run shifts its target order | Yes |
| Let the client draw questions and report its score | Lowest | Any script posts any score | No |

The server-side seed keeps checking on the server and stores only served questions.

### Stack

| Area | Decision |
| --- | --- |
| Layout | Handbook Go + React row: `backend/`, `frontend/`, `database/`, `reverse-proxy/` |
| Backend | Go, standard `net/http` mux, `log/slog`, pgx v5, sqlc, golang-migrate |
| Database | PostgreSQL 18. The handbook runs every backend on Postgres, so SQLite is out |
| Frontend | Vite, React, TypeScript 7, Tailwind, shadcn/ui, TanStack Query, React Router, Zod |
| Edge | Caddy image with the SPA baked in; `/api/*` proxied to the backend on port 8080 |
| Languages | German and English UI. Repository files are English |
| Toolchain | Latest stable Go and the Active LTS Node at scaffold time, pinned as the handbook says |

### Data

| Need | Source | Licence |
| --- | --- | --- |
| Codes, English names, regions, sovereignty | mledoze/countries, pinned commit | ODbL-1.0 |
| German country names | Unicode CLDR `de` territories, pinned release | Unicode-3.0 |
| Capital names in German and English | Wikidata SPARQL export of capitals only, checked in | CC0 |
| Flags as 4:3 SVG | lipis/flag-icons v7.6.0 | MIT |
| Words a name must not contain, German and English | LDNOOBW word lists `de` and `en`, pinned commit | CC-BY-4.0 |

- The raw sources are committed unchanged. An importer command builds the generated files from them.
- A gate step fails when the generated files differ from the importer's output.
- A curated override file fixes what the sources get wrong: primary capitals, spellings, missing labels.
- The quiz pool holds 197 countries: the 193 UN members, Vatican City, Palestine, Kosovo and Taiwan.
- Each entry has a code, both names, capitals in both languages, a region, a flag key and its look-alikes.
- A country with several capitals has one primary capital. The others never serve as distractors for it.
- The derived dataset is licensed ODbL-1.0; the code stays MIT. A notice file credits every source.
- The backend loads the dataset into memory at start. The database stores country codes only.
- Flag files carry an opaque key instead of the ISO code. It hides the code from casual inspection.
- 4:3 flags give every flag card the same shape, so the aspect ratio gives no hint.

### Domain modules

| Module | Owns |
| --- | --- |
| country | The in-memory catalogue: the quiz pool, names in both languages |
| quiz | Runs: name rules, question generation, the clock, answer checking, the sweep |
| leaderboard | Entries of finished runs and the two rankings |

`quiz` announces a finished run through a hook; `leaderboard` implements it. No module reads another module's tables.

### Question rules

- Six modes: flag to country, flag to capital, country to flag, country to capital, capital to flag, capital to country.
- Each question draws its mode at random. It has four options, exactly one correct.
- Distractors come from the target's region where the region has enough countries, else from the whole pool.
- No two options of one question display the same text.
- A curated list names flags a player cannot tell apart, such as Nicaragua and El Salvador.
- Such a look-alike pair never shares a flag question.
- A question stores country codes and the correct option.
- The API sends every name in both languages as `{"de": "…", "en": "…"}`. The client shows one.

### Run rules

- A visitor starts a run with a name. The run's unguessable id is its only credential.
- A name has 1 to 20 characters after trimming. Inner spaces collapse to one.
- A name holds letters, digits, spaces, `_`, `-` and `.`. Names need not be unique.
- A name that contains a word of the German or English word list is rejected.
- The browser remembers the last name to prefill the form. The server keeps it only with the run and its entry.
- Each run draws its targets in a random order of the pool. No country repeats within a run.
- The server reveals one question at a time. The clock starts when it serves the question.
- A question allows 15 seconds plus 2 seconds of grace.
- An answer names the question's position and an option. The response reveals the correct option.
- A correct answer adds one point. The next read serves the next question.
- A wrong, late or missing answer ends the run. Answering all 197 questions ends it as completed.
- A served question stays served across reloads; its clock keeps running.
- A run whose open question expires ends as a timeout, even if nobody returns. A server sweep ends it within 30 seconds.
- A finished run is immutable.
- Run starts are rate limited per client address. IPv6 addresses count per /64 network.
- A run is deleted 7 days after it ends. A run whose first question was never read is deleted after one hour.

### Leaderboard

- Every finished run creates one entry: name, score and end time. Entries are kept; nothing else of the run is.
- A name may appear many times, once per run, like an arcade high-score table.
- Two lists: all time and today. Today is the current calendar day in Europe/Berlin.
- Each list shows the top 100, by score descending, then by earlier end.
- Equal scores share a rank: 1, 1, 3.
- A finished run shows its rank in both lists. Today's rank is empty once its day has passed.
- No response carries a run id other than the requester's own.

### HTTP contract

All routes sit under `/api` and speak JSON. An error is `{"error": {"code", "message", "field"?}}` with a fitting status.
`message` is a short English text for developers. Clients map `code` to user text.
No route negotiates language. There is no authentication. State-changing requests must carry JSON and a matching `Origin`.

| Route | Purpose |
| --- | --- |
| `GET /health` | Liveness, used by the image healthcheck |
| `POST /runs` | Start a run with a name; rate limited |
| `GET /runs/{id}` | Run state: the current question without its answer, or the result |
| `POST /runs/{id}/answers` | Answer the current question; returns correctness, the correct option and the score |
| `GET /leaderboard` | Top 100 today and of all time; with `run=<id>`, that run's ranks |

### Frontend

| Route | Content |
| --- | --- |
| `/` | Name form that starts a run |
| `/play/:runId` | The run, then its result: score, the missed question, ranks, play again |
| `/leaderboard` | Today and all-time lists |

- The navbar links to the leaderboard and holds the language switch.
- The language follows the browser, with a switch that is remembered on the device.
- The switch is client-only: it picks the matching text and refetches nothing.
- Code is organised by feature, and components reach the server only through their feature's API functions.
- The layout is mobile first.

### Operations

- The repository is scaffolded with the handbook's new-project guide; its `make check` and CI are the gate.
- The health endpoint, port, environment variable names and image names follow the handbook templates.
- Migrations are forward-only. A deploy applies them through a one-shot migrate service before the backend starts.
- The migrate image ships with each release, beside the backend and edge images.
- The domain stays `what-the-flag.de`. A `vX.Y.Z` tag builds the release images.
- `v0.1.0` ships runs and the leaderboard. `v1.0.0` adds the browser test, the CSP and the final docs.

## Testing Decisions

- Tests follow the handbook's global test rule: the cheapest level that can fail for the defect.
- Question generation is a pure function of the pool, a seed and a position. Its tests pin the question rules over many seeds.
- Name rules are a pure function. A table pins length, characters, collapsing and the word filter.
- The importer's test is the gate step that compares its output with the committed files, plus the pool invariants.
- Run rules are tested against an in-memory fake store with an injected clock.
- SQL, migrations, the sweep and the rankings run against a real Postgres under the `integration` build tag.
- Ranking tests run in a rolled-back transaction, because the lists are global.
- A contract suite pins the HTTP API with Go black-box HTTP tests under the same tag.
- It drives the real handler chain against a real Postgres. Strict decoding pins the wire shape.
- Every route lands with its contract tests: one happy path plus each route-specific error code.
- Contract tests may read the database to learn a question's correct option. Timeouts stay at service level.
- Middleware rules and the rate limiter are tested in unit tests.
- Frontend tests render features with a real query client and a faked API client.
- A smoke check sends HTTP requests to the production stack. It lands with the first release.
- One browser test in `e2e/` (Playwright) covers the cross-stack flow through the edge.
- It enters a name, plays until the run ends and finds the name on today's leaderboard. It replaces the smoke check.
- Prior art: the foundation's contract harness, `FakeApi` and `renderRoute()`.

## Out of Scope

- Accounts, login, sessions, profiles, avatars, friends and duels.
- Weekly or monthly lists, and deleting an entry from the site. The owner deletes entries with SQL.
- Captchas, proof of work and per-run flag URLs. A determined bot can still post a high score.
- Difficulty levels, lives, jokers and further quiz modes such as shapes or neighbours.
- Any data migration: no production data exists.
- Imprint and privacy pages. The owner supplies their text before the public launch.
- Provisioning the server and deploying. The handbook runbooks cover both.
- An admin interface.

## Further Notes

- This single PRD covers the whole rebuild on purpose.
- After `v1.0.0`, `docs/game-rules.md` holds the rules, and this PRD is pruned.
- Terms are defined in [UBIQUITOUS_LANGUAGE.md](../UBIQUITOUS_LANGUAGE.md).
- Implementation is sliced into the plans listed in [programme.md](../plans/programme.md).
