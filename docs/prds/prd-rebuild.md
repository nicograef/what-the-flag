# PRD: What The Flag rebuild

## Problem Statement

What The Flag is a Quizduell-like game about flags, countries and capitals for `what-the-flag.de`.
The repository holds a Node, MongoDB and Material UI app that no handbook standard covers. Nothing of it runs anywhere.
Its quiz logic lives in an external npm package, and its flags are hot-linked from a CDN.

The app has these defects:

- The timer runs in the browser only, so any script can ignore it.
- The flag URL carries the ISO code, so every flag question shows its own answer.
- Four entries have no capital, and two capitals share one name.
- A user can challenge themselves, and that duel never completes.
- A result never shows the correct answers.
- The game needs a second registered player before anything can be played.
- All text is English, on a `.de` domain.

## Solution

A new app is set up from scratch in the same repository, for the same domain.
It follows the handbook's Go + React row: Go backend, Postgres, React with shadcn/ui, Caddy edge.
Country data and flags are vendored into the repository from open sources; nothing is fetched at runtime.

A visitor plays a practice round without an account. A registered player challenges another player to a duel.
Duels earn points, and players climb an all-time leaderboard.
The server serves one question at a time, starts the clock and checks every answer.

The interface speaks German and English.
There is no production instance and no user data. The existing code is deleted.

## User Stories

Visitor:

- As a visitor, I want to play a practice round without signing up, so that I can try the game.
- As a visitor, I want the interface in German or English, so that I read country names in my language.
- As a visitor, I want to register with only a username and password, so that I share no personal data.

Player:

- As a player, I want to stay logged in on my device, so that I do not retype my password.
- As a player, I want an emoji avatar that I can change, so that others recognise me.
- As a player, I want to delete my account, so that my data is deleted.
- As a player, I want to search players by name and challenge one, so that we play the same questions.
- As a player, I want to play my turn at any time, so that we need no shared slot.
- As a player, I want each question to run against a fair clock, so that nobody gains time by cheating.
- As a player, I want to see the correct answer after each question, so that I learn from mistakes.
- As a player, I want to resume a round after a reload, so that a lost connection costs nothing.
- As a player, I want a dashboard of my duels, so that I see where it is my turn.
- As a player, I want a duel result that compares both players per question, so that I see who won.
- As a player, I want an all-time leaderboard with my own rank, so that I see where I stand.

Owner:

- As the owner, I want all country data checked in with sources and licences, so that nothing loads at runtime.
- As the owner, I want one command that rebuilds the dataset from the vendored sources, so that fixes are reproducible.
- As the owner, I want `make check` and CI to gate every change, so that it matches my handbook projects.
- As the owner, I want a tagged release to produce deployable images, so that deployment follows the handbook runbook.

## Implementation Decisions

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

- The raw sources are committed unchanged. An importer command builds the generated dataset from them.
- A gate step fails when the generated dataset differs from the importer's output.
- A curated override file fixes what the sources get wrong: primary capitals, spellings, missing labels.
- The quiz pool holds 197 countries: the 193 UN members, Vatican City, Palestine, Kosovo and Taiwan.
- The generated dataset holds the pool only, with the fields the game uses.
- Each entry has a code, both names, capitals in both languages, a region, a flag key and its look-alikes.
- Every entry has one primary capital in both languages and a flag. The importer fails otherwise.
- A country with several capitals has one primary capital. The others never serve as distractors for it.
- The derived dataset is licensed ODbL-1.0; the code stays MIT. A notice file credits every source.
- The backend loads the dataset into memory at start. The database stores country codes only.
- Flag files carry an opaque key instead of the ISO code. It hides the code from casual inspection.
- The key to country mapping stays on the server. The server clock is the real anti-cheat.
- 4:3 flags give every flag card the same shape, so the aspect ratio gives no hint.

### Domain modules

| Module | Owns |
| --- | --- |
| country | The in-memory catalogue: lookup by code, the quiz pool, names in both languages |
| quiz | Question generation, quiz sets, rounds, the clock, answer checking |
| account | Registration, login, sessions, profile, avatar, deletion, rate limiting |
| duel | Duels between two players, their statuses and scoring |
| leaderboard | The points ledger and the all-time leaderboard |

`duel` uses `quiz` and `leaderboard`. No module reaches into another module's tables.

### Quiz rules

- Six modes: flag to country, flag to capital, country to flag, country to capital, capital to flag, capital to country.
- A quiz set mixes the modes at random. Practice and duel sets hold 10 questions.
- A question has four options, exactly one correct. No country repeats within a set as the target.
- Distractors come from the target's region where the region has enough countries, else from the whole pool.
- No two options of one question display the same text.
- A curated list names flags a player cannot tell apart, such as Nicaragua and El Salvador.
- Such a look-alike pair never shares a flag question.
- A question stores country codes and the correct option.
- The API sends every name in both languages as `{"de": "…", "en": "…"}`. The client shows one.
- Both players of a duel answer the same set in the same order.

### Round rules

- A round is one player's pass through one quiz set. The server reveals one question at a time.
- The clock starts when the server first serves a question. A question allows 20 seconds plus 2 seconds of grace.
- An answer names the question index and an option index. A late or missing answer counts as wrong.
- The response to an answer reveals the correct option.
- A served question stays served across reloads; its clock keeps running.
- A round is finished when its last question is answered or timed out. A finished round is immutable.
- A practice round belongs to nobody. Its unguessable id is the only credential.
- Starting a practice round deletes practice data older than seven days.

### Accounts

- A user has a username, a password hash, an emoji and a creation time. There is no email address.
- Usernames are 3 to 20 characters of letters, digits and underscore, unique regardless of case.
- Passwords are 8 to 128 characters with no composition rules, hashed with argon2id.
- Login creates a server-side session of 30 days, sliding. The cookie is `HttpOnly`, `Secure`, `SameSite=Lax` and host-bound.
- The database stores only a hash of the session token. Logout deletes the session.
- State-changing requests must carry JSON and a matching `Origin`.
- Registration and login are rate limited per client address.
- Registration assigns a random emoji from a fixed list. The player may pick another from that list.
- Deleting an account removes the user, their sessions, rounds, duels and ledger entries.
- The opponent's ledger entries stay, so the opponent keeps the points of shared duels.

### Duels

- A player challenges another player by username. Challenging oneself is rejected.
- Two players may hold several open duels at once.
- Each player plays one round, in any order. The challenger is offered theirs at once.
- A viewer sees a duel as `your_turn`, `waiting`, `completed` or `expired`.
- A duel that is not completed seven days after creation is expired and awards nothing.
- Scoring happens once, in the transaction that finishes the second round:

| Rule | Points |
| --- | --- |
| Completing the duel | 10 each |
| Strictly more correct answers | 5 per correct answer, winner only |
| All ten correct | 25 |

- The result shows both rounds per question, the correct answers, and the points each player earned.

### Leaderboard and points

- Points live in an append-only ledger: user, source kind, source id, points, time.
- The only source kind is `duel`.
- One entry per user, source kind and source id makes an award idempotent. A user's total is the ledger sum.
- The all-time leaderboard ranks by total. Equal totals share a rank.
- It shows the top 100 plus the viewer's row.

### HTTP contract

All routes sit under `/api` and speak JSON. An error is `{"error": {"code", "message", "field"?}}` with a fitting status.
`message` is a short English text for developers. Clients map `code` to user text.
No route negotiates language. Lists have fixed limits and no pagination.

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /health` | none | Liveness, used by the image healthcheck |
| `POST /practice` | none | Create a practice quiz set and round |
| `GET /rounds/{id}` | owner or practice id | Round state: current question without its answer, or the finished summary |
| `POST /rounds/{id}/answers` | owner or practice id | Answer the current question; returns correctness and the correct option |
| `POST /accounts` | none | Register and log in |
| `POST /session`, `DELETE /session` | none, session | Log in, log out |
| `GET /me`, `PATCH /me`, `DELETE /me` | session | Profile with total points, change emoji, delete account |
| `GET /users?query=` | session | Search opponents by name prefix, at most 20 results |
| `POST /duels`, `GET /duels`, `GET /duels/{id}` | session | Create, list own (newest 50), read one with result |
| `POST /duels/{id}/round` | session | Start or resume the caller's round |
| `GET /leaderboard` | session | All-time ranking: top 100 plus the viewer's row |

### Frontend

| Route | Access | Content |
| --- | --- | --- |
| `/` | public | Landing: start a practice round; the navbar offers log in and register |
| `/practice/:roundId` | public | Play and result of a practice round |
| `/login`, `/register` | public | Account forms |
| `/dashboard` | player | Opponent search that starts a duel, duel list |
| `/duels/:id` | player | Play, or the result once the caller has played |
| `/leaderboard` | player | All-time ranking |
| `/profile` | player | Username, emoji picker, points, log out, delete account |

- One play component serves practice and duel rounds.
- For a player, the navbar links to the dashboard and the leaderboard.
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
- No release ships between `v0.1.0` (practice only) and `v1.0.0` (accounts and duels).

## Testing Decisions

- Tests follow the handbook's global test rule: the cheapest level that can fail for the defect.
- Question generation is a pure function with an injected random source. Its tests pin the quiz rules over many seeds.
- The importer's test is the gate step that compares its output with the committed dataset, plus the pool invariants.
- Round, duel and ledger rules are tested at service level against an in-memory store with an injected clock.
- SQL and migrations are tested against a real Postgres under the `integration` build tag.
- A contract suite pins the HTTP API with Go black-box HTTP tests under the same tag.
- It drives the real handler chain against a real Postgres.
- Strict decoding of every response into an expected struct pins the wire shape. There is no OpenAPI document.
- Every route lands with its contract tests: one happy path plus each route-specific error code.
- Contract tests may read the database to learn a question's correct option. Timeouts stay at service level.
- Middleware rules are tested once, in unit tests: `Origin`, content type, body limit, error envelope.
- Handler unit tests cover only what the contract suite cannot see.
- Frontend tests render features with a real query client and a faked API client.
- A smoke check sends HTTP requests to the production stack. It lands with the first release.
- One browser test in `e2e/` (Playwright) covers the cross-stack flow through the edge.
- It registers two players, plays a duel and reads the result. It lands with release readiness.
- Prior art: none in this repository; the handbook's stack conventions describe the patterns.

## Out of Scope

- Any data migration: no production data exists.
- Weekly challenge and weekly leaderboard: a follow-up PRD after `v1.0.0`.
- Email addresses, password reset, social login.
- Real-time play, push notifications, websockets.
- Declining a duel, rematch buttons, chat, friends lists.
- Further quiz modes such as country shapes, population or neighbours.
- Imprint and privacy pages. The owner supplies their text before the public launch.
- Provisioning the server and deploying. The handbook runbooks cover both.
- An admin interface.

## Further Notes

- This single PRD covers the whole rebuild on purpose.
- After `v1.0.0`, `docs/game-rules.md` holds the rules, and this PRD is pruned.
- The app does not use the `country-quiz` npm package. The quiz rules above cover its six modes and four options.
- Scoring keeps the original game's values.
- Terms are defined in [UBIQUITOUS_LANGUAGE.md](../UBIQUITOUS_LANGUAGE.md).
- Implementation is sliced into the plans listed in [programme.md](../plans/programme.md).
