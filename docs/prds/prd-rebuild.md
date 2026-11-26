# PRD: What The Flag rebuild

## Problem Statement

What The Flag is a quiz about flags, countries and capitals for `what-the-flag.de`.
The old app was a duel game: nobody could play without an account and a second registered player.
Its timer ran in the browser, its flag URLs revealed the answer, and all text was English.

The owner wants a casual game that anyone plays within seconds and wants to play again.
It should spread through people sharing their score, without accounts, logins, friends lists or duels.

## Solution

A visitor enters a name and starts a run at once. Questions follow one after another, from easy to hard.
A run lasts until the first wrong or late answer. Its score is the number of correct answers.

Every run plays a quiz: a stored sequence of questions with a public link.
Sharing the result sends that link: "I answered 34 questions about the world. Can you beat it?"
A friend who opens it plays exactly the same questions and lands on that quiz's leaderboard.
Runs on fresh quizzes also land on the global all-time leaderboard.

The server serves one question at a time, starts its clock and checks every answer.
The interface speaks German and English, looks clean and minimal, and works on a phone first.

## User Stories

Visitor:

- As a visitor, I want to type any name and start at once, so that I play without signing up.
- As a visitor, I want easy questions first and harder ones later, so that I get into the game before it gets tough.
- As a visitor, I want questions about flags, capitals, continents, languages and currencies, so that the game stays varied.
- As a visitor, I want each question to run against a fair clock, so that nobody gains time by cheating.
- As a visitor, I want to see the correct answer when I miss, so that I learn from the mistake.
- As a visitor, I want to resume a run after a reload, so that a lost connection costs nothing.
- As a visitor, I want my score, my rank and my personal best, so that I know how I did.
- As a visitor, I want to play again with one tap, so that a new run starts at once.
- As a visitor, I want to share my score with a link to the same questions, so that friends can try to beat me.
- As a visitor who got such a link, I want to see who challenged me and with what score, so that I know what to beat.
- As a visitor, I want a leaderboard for each quiz and a global one, so that I compare myself with friends and with everyone.
- As a visitor, I want the interface in German or English, so that I read country names in my language.

Owner:

- As the owner, I want no data kept beyond the chosen name, answers and times, so that the site holds no personal data.
- As the owner, I want rate limits and a minimum answer time, so that floods and naive bots fail.
- As the owner, I want to hide a run from the leaderboards with one command, so that I can remove abuse.
- As the owner, I want usage and anomaly statistics from one command, so that the beta shows whether the game works.
- As the owner, I want all country data checked in with sources and licences, so that nothing loads at runtime.
- As the owner, I want one command that rebuilds the dataset from the vendored sources, so that fixes are reproducible.
- As the owner, I want `make check` and CI to gate every change, so that it matches my handbook projects.
- As the owner, I want a tagged release to produce deployable images, so that deployment follows the handbook runbook.

## Implementation Decisions

### Approach

How a quiz holds its questions was weighed three ways:

| Approach | Effort | Risk | Pick |
| --- | --- | --- | --- |
| Generate every question at random when first served and store it | Low | One stored row per question, read by every later run | Yes |
| Store a seed and recompute questions on demand | Low | A data update changes old quizzes; the seed must never leak | No |
| Pre-generate a whole quiz at creation | Low | Many stored questions are never served | No |

Stored questions keep a shared quiz identical forever and show which questions people miss.

### Stack

| Area | Decision |
| --- | --- |
| Layout | Handbook Go + React row: `backend/`, `frontend/`, `database/`, `reverse-proxy/` |
| Backend | Go, standard `net/http` mux, `log/slog`, pgx v5, sqlc, golang-migrate |
| Database | PostgreSQL 18. The handbook runs every backend on Postgres, so SQLite is out |
| Frontend | Vite, React, TypeScript 7, Tailwind, shadcn/ui, TanStack Query, React Router, Zod |
| Edge | Caddy image with the SPA baked in; `/api/*` proxied to the backend on port 8080 |
| Look | Clean and minimal: shadcn defaults, one accent colour, short transitions |
| Languages | German and English UI. Repository files are English |
| Toolchain | Latest stable Go and the Active LTS Node at scaffold time, pinned as the handbook says |

### Data

| Need | Source | Licence |
| --- | --- | --- |
| Codes, English names, regions, languages, currencies, area | mledoze/countries, pinned commit | ODbL-1.0 |
| German country, language and currency names | Unicode CLDR `de`, pinned release | Unicode-3.0 |
| Capital names in German and English | Wikidata SPARQL export of capitals only, checked in | CC0 |
| Flags as 4:3 SVG | lipis/flag-icons v7.6.0 | MIT |

- The raw sources are committed unchanged. An importer command builds the generated files from them.
- A gate step fails when the generated files differ from the importer's output.
- A curated override file fixes what the sources get wrong: primary capitals, spellings, missing labels.
- The quiz pool holds 197 countries: the 193 UN members, Vatican City, Palestine, Kosovo and Taiwan.
- Each entry has a code, both names, a primary capital, a continent, languages, currencies, a flag key and its look-alikes.
- Every attribute value carries a German and an English label.
- The derived dataset is licensed ODbL-1.0; the code stays MIT. A notice file credits every source.
- The backend loads the dataset into memory at start. The database stores country codes and attribute values only.
- Flag files carry an opaque key instead of the ISO code. It hides the code from casual inspection.

### Domain modules

| Module | Owns |
| --- | --- |
| country | The in-memory catalogue: the quiz pool and its attributes in both languages |
| quiz | Quizzes, runs, question generation, the clock, answer checking, the leaderboards |

- `quiz` has a pure domain core: entities, rules and the run state machine. It imports neither HTTP nor database code.
- Its ports are a repository, a clock and a random source. A lint rule enforces the boundary.
- A Postgres adapter implements the repository; an HTTP adapter maps routes to the core.
- An application service runs each use case in one transaction.
- The leaderboards are read queries over runs. They have no tables of their own.

### Question rules

- A question pairs a prompt attribute with an answer attribute of the target country. It has four options.
- A question is valid only when exactly one option is true for the target.
- The first release has six attributes: name, flag, capital, continent, language and currency.
- Name, flag and capital identify a country, so they can prompt for any attribute and answer each other.
- Continent, language and currency are only answers: "Which language is spoken in X?".
- Multi-valued answers pick distractors that are false for the target, such as languages not spoken there.
- Distractor countries come from the target's region where it has enough countries, else from the whole pool.
- A curated list names flags a player cannot tell apart, such as Nicaragua and El Salvador. Such a pair never shares a flag question.
- No two options of one question display the same text.
- Every question type has a difficulty tier. Every country has a fame tier, derived from its area and region.
- A quiz starts with easy types and well-known countries and gets harder with each position.
- No country repeats as the target within a quiz.
- The API sends every label in both languages as `{"de": "…", "en": "…"}`. The client shows one.

### Quiz and run rules

- A quiz is a sequence of questions with a public, unguessable id. Its questions are stored when first served.
- A run is one visitor's pass through a quiz, with a private, unguessable id. That id is its only credential.
- Starting from the home page creates a fresh quiz and its first run. That run is the quiz's creator.
- Starting from a challenge link creates a run on the existing quiz.
- A run on a quiz reads questions already stored and generates the next new position when it gets there.
- A name has 1 to 20 characters after trimming. Inner spaces collapse to one.
- A name holds letters, digits, spaces, `_`, `-` and `.`. Names need not be unique.
- The name field says that the name appears publicly on the leaderboards.
- The browser remembers the last name to prefill the form, and the personal best to compare with.
- The server reveals one question at a time. The clock starts when it serves the question.
- A question allows 15 seconds plus 2 seconds of grace.
- An answer names the question's position and an option. The response reveals the correct option.
- An answer within 300 ms of serving counts as wrong: no person reads that fast.
- A correct answer adds one point. The next read serves the next question.
- A wrong, late or missing answer ends the run. Answering every question the pool allows ends it as completed.
- A served question stays served across reloads; its clock keeps running.
- A run whose open question has expired counts as ended everywhere, even before it is written. The next read or answer writes the timeout.
- A finished run is immutable. Quizzes and runs are kept; nothing is deleted automatically.

### Leaderboards

- The global list ranks runs that created their quiz. Runs from a challenge link count only on their quiz's list.
- Each quiz has its own list of all its runs.
- Both lists show the top 100, by score descending, then by earlier end.
- Equal scores share a rank: 1, 1, 3.
- A finished run shows its rank on its quiz's list, and on the global list when it counts there.
- A name may appear many times, once per run, like an arcade high-score table.
- A hidden run appears on no list. Only the owner hides runs.
- No response carries a run id other than the requester's own.

### Sharing

- The result offers a share button: the system share sheet on phones, else a copy to the clipboard.
- The text names the score and the quiz link, nothing that spoils a question.
- The challenge page `/q/<quizId>` shows the creator's name and score, or that the creator still plays. Below it are the quiz's list and the name form.
- `index.html` carries fixed Open Graph tags and a static image, so a shared link shows a preview.

### Abuse protection

- Run starts are rate limited per client address, generous enough for a school class behind one address.
- IPv6 addresses count per /64 network. A global cap per minute stops floods.
- Client addresses live only in process memory and are never stored.
- The owner hides a run with `make hide` and reads anomalies with `make stats`.
- `make stats` reports runs per day, the replay rate, the share rate, the median score and the fastest runs.
- The PRD accepts that a determined bot with a lookup table can still post a high score.

### HTTP contract

All routes sit under `/api` and speak JSON. An error is `{"error": {"code", "message", "field"?}}` with a fitting status.
`message` is a short English text for developers. Clients map `code` to user text.
No route negotiates language. There is no authentication. State-changing requests must carry JSON and a matching `Origin`.

| Route | Purpose |
| --- | --- |
| `GET /health` | Liveness, used by the image healthcheck |
| `POST /runs` | Start a run with a name, on a fresh quiz or on a given quiz; rate limited |
| `GET /runs/{id}` | Run state: the current question without its answer, or the result with ranks |
| `POST /runs/{id}/answers` | Answer the current question; returns correctness, the correct option and the score |
| `GET /quizzes/{id}` | Challenge view: the creator's name and score, and the quiz's top 100 |
| `GET /leaderboard` | The global top 100 |

### Frontend

| Route | Content |
| --- | --- |
| `/` | Name form that starts a fresh quiz |
| `/q/:quizId` | Challenge: the creator's score, the quiz's list, a name form for the same quiz |
| `/play/:runId` | The run, then its result: score, the missed question, ranks, personal best, share, play again |
| `/leaderboard` | The global list |

- The navbar links to the leaderboard and holds the language switch.
- The language follows the browser, with a switch that is remembered on the device. It refetches nothing.
- Code is organised by feature, and components reach the server only through their feature's API functions.
- The layout is mobile first and usable with keyboard and screen reader.

### Operations

- The repository is scaffolded with the handbook's new-project guide; its `make check` and CI are the gate.
- The health endpoint, port, environment variable names and image names follow the handbook templates.
- Migrations are forward-only. A deploy applies them through a one-shot migrate service before the backend starts.
- The domain stays `what-the-flag.de`. A `vX.Y.Z` tag builds the release images.
- `v0.1.0` is the first release and goes to a silent beta with friends. A public launch follows when `make stats` shows that people replay and share.

## Testing Decisions

- Tests follow the handbook's global test rule: the cheapest level that can fail for the defect.
- The domain core is tested without a database: an in-memory repository, a fixed clock and a fixed random source.
- Question generation tests pin the question rules for every attribute pair over many random draws on the real pool.
- Name rules are a pure function. A table pins length, characters and collapsing.
- The importer's test is the gate step that compares its output with the committed files, plus the pool invariants.
- The Postgres adapter and the leaderboard queries run against a real Postgres under the `integration` build tag.
- Leaderboard tests insert their own runs with scores no other test reaches, and assert only those.
- A contract suite pins the HTTP API with Go black-box HTTP tests on the real handler chain and a real Postgres.
- Strict decoding pins the wire shape. Every route lands with one happy path plus each route-specific error code.
- Contract tests may read the database to learn a question's correct option. Timeouts stay at domain level.
- Middleware rules and the rate limiter are tested in unit tests.
- Frontend tests render features with a real query client and a faked API client.
- A smoke script sends HTTP requests to the production stack behind the real edge.
- Prior art: the foundation's contract harness, `FakeApi` and `renderRoute()`.

## Out of Scope

- Accounts, login, sessions, profiles, avatars, friends and duels.
- A daily quiz, a today list, milestones, confetti, an installable app and per-score preview images.
- A word filter for names; the owner hides abusive runs.
- Captchas from third parties, stored IP addresses, per-run flag URLs and client obfuscation.
- Monetisation and languages beyond German and English.
- Imprint and privacy pages. The owner supplies their text before the public launch.
- Provisioning the server and deploying. The handbook runbooks cover both.
- An admin interface.

## Further Notes

Later, each after the beta shows the need:

- Further attributes from the vendored data: neighbours, landlocked, area, position, domain, calling code, demonym, ISO code.
- Attributes from Wikidata in batches, such as population, driving side and memberships, and country shapes from Natural Earth.
- Question formats beyond four options: either-or, tap on a map, estimate a number.
- Self-hosted proof of work before a global top-100 entry, if bots show up in the beta.
- A report button on leaderboard entries, and a Playwright browser test.

- After `v0.1.0`, `docs/game-rules.md` holds the rules, and this PRD is pruned.
- The game rules state that the data comes from open sources and implies no political position.
- Terms are defined in [UBIQUITOUS_LANGUAGE.md](../UBIQUITOUS_LANGUAGE.md).
- Implementation is sliced into the plans listed in [programme.md](../plans/programme.md).
