# PRD: Daily quiz

> Part of the redesign; see [prd-redesign.md](prd-redesign.md). Screens: home (02) and leaderboard (13) in [docs/redesign/screens.md](../redesign/screens.md).
> It builds on the player key of [plan-anonymous-player.md](../plans/plan-anonymous-player.md).

## Problem Statement

The game gives no reason to come back tomorrow.
Every visit starts a fresh quiz, so two friends never play the same questions unless one sends a link.
There is no shared daily moment to compare or talk about.

## Solution

Every day there is one quiz for everyone: the daily quiz.
Home shows it with the date. Each player key gets one try per day, enforced by the server.
It has its own leaderboard for that day, a tab on the leaderboard page.
Sharing a daily result tells friends they can play the same quiz today.

## User Stories

- As a player, I want one quiz per day that everyone plays, so that I can compare myself with everyone today.
- As a player, I want to see on home whether I already played today, so that I know if my try is used.
- As a player, I want today's leaderboard, so that I see where I stand among today's players.
- As a player, I want to share my daily result with the date, so that friends play the same quiz today.
- As a player who already played today, I want my daily rank instead of the start button, so that I'm not invited to a try I don't have.
- As a player, I want everyone limited to one try, so that the daily board compares first attempts.

## Implementation Decisions

### Approach

| Approach | Effort | Risk | Reversibility | Pick |
| --- | --- | --- | --- | --- |
| A quiz without a creator, created by the day's first daily start and linked to the date | Medium | Quiz creation is no longer tied to a creator run | High | **Yes** |
| A scheduled step creates the quiz at midnight | Medium | A timer in the backend; a missed tick leaves a day without a quiz | High | No |
| A system run as the creator | Low | A fake run on the leaderboards and in stats | Medium | No |
| Questions from a seed per date | Low | Breaks D09 (stored questions); a data update would change past days | Low | No |

### Domain

- A daily quiz is an ordinary quiz plus a date. Its questions follow every rule of [game-rules.md](../game-rules.md) and are stored as for any quiz.
- It has no creator run. So it is playable at once, and its runs never count on the global leaderboard.
- The day is the calendar day in Europe/Berlin.
- One try per player key per day:
  - On its day, a start on the daily quiz checks the player's runs on it. A second start is refused.
  - The check covers every route to the quiz: the daily start and its quiz id alike.
  - A visitor without a player key gets one when the start succeeds, as with any start.
- After its day, the quiz link plays like any challenge link without a creator.

### Schema

- Migration `000008_daily_quizzes.up.sql`: a table mapping a date to a quiz id, both unique. Forward-only, in one transaction.

### API

- `POST /api/runs` with `{ name, daily: true }` starts today's daily run.
  - It creates the day's quiz when none exists. Concurrent first starts produce one quiz through the unique date.
  - A second start by the same player key that day answers 409 `daily_played`.
  - The start rate limit applies.
- `POST /api/runs` with a daily quiz's id on its day applies the same one-try check.
- `GET /api/daily` is read-only: today's date, the quiz id (null before the first start), the top of its leaderboard, and `played`.
  - The own row and `played` come from the player key, as on every leaderboard.
  - The leaderboard read limit applies.
- The challenge endpoint returns `creator: null` and `daily: { date }` for a daily quiz.

### Frontend

- Home shows the daily card before the try, and the daily rank and score after it.
- The leaderboard gets the "Heute" tab.
- The challenge page gets a "no creator" state for a daily quiz: "Tagesquiz vom {date}", the board, and name and hold to accept.
  On the quiz's day, a player who has played sees the board without the accept button.
- Share text for a daily run: `shareDaily` from [copy.md](../redesign/copy.md#follow-ups), in German and English.
- Dates follow the locale format of copy.md.

### Glossary

- Daily quiz: the one quiz of a calendar day in Europe/Berlin, the same for every player. It has no creator, and each player key gets one try on its day.

## Testing Decisions

- Domain tests with the clock port:
  - the first daily start of a day creates one quiz; a second start on the same day reuses it;
  - a new day creates a new one, at Berlin midnight and across both daylight-saving switches;
  - a second start by one player that day is refused, through the daily start and through the quiz id;
  - a daily quiz is playable without a creator.
- Integration test: two concurrent first starts produce one row (tagged `integration`, never truncating).
- Contract test `internal/contract/daily_integration_test.go`:
  - `GET /api/daily` before and after a try, including `played` and the own row by cookie;
  - the 409 `daily_played` on a second start;
  - `creator: null` and `daily` on the challenge endpoint.
- Frontend feature tests with `FakeApi`: the card before and after a try, the "Heute" tab, the no-creator challenge state, the share text in both languages.
- `scripts/smoke.sh` gains one check for `GET /api/daily`.

## Out of Scope

- Enforcing one try per person beyond the player key. Clearing cookies gives a new key and a new try.
- Streaks of days played, calendars and archives of past days.
- Notifications when a new day starts.

## Further Notes

Documents this PRD changes when it lands:

| Document | Change |
| --- | --- |
| `docs/game-rules.md` | A "Daily quiz" section. "Starting from the home page creates a fresh quiz. Its first run is the quiz's creator." gains: a daily quiz has no creator. |
| `docs/UBIQUITOUS_LANGUAGE.md` | The term "Daily quiz" |
| `database/stats.sql` | Daily players per day |
