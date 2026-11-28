# PRD: Daily quiz

> Part of the redesign; see [prd-redesign.md](prd-redesign.md). Screens: home (02) and leaderboard (13) in [docs/redesign/screens.md](../redesign/screens.md).

## Problem Statement

The game gives no reason to come back tomorrow. Every visit starts a fresh quiz, so two friends never play the same questions unless one sends a link, and there is no shared daily moment to compare or talk about.

## Solution

Every day there is one quiz for everyone: the daily quiz. Home shows it with the date; a player gets one try per day in their browser.
It has its own leaderboard for that day, a tab on the leaderboard page. Sharing a daily result tells friends they can play the same quiz today.

## User Stories

- As a player, I want one quiz per day that everyone plays, so that I can compare myself with everyone today.
- As a player, I want to see on home whether I already played today, so that I know if my try is used.
- As a player, I want today's leaderboard, so that I see where I stand among today's players.
- As a player, I want to share my daily result with the date, so that friends play the same quiz today.
- As a player who already played today, I want to see my daily rank instead of the start button, so that I'm not invited to a try I don't have.

## Implementation Decisions

### Approach

| Approach | Effort | Risk | Reversibility | Pick |
| --- | --- | --- | --- | --- |
| A quiz without a creator, created on the first request of the day and linked to the date | Medium | Quiz creation is no longer tied to a first run | High | **Yes** |
| A system run as the creator | Low | A fake run on the leaderboards and in stats | Medium | No |
| Questions from a seed per date | Low | Breaks D09 (stored questions); a data update would change past days | Low | No |

### Domain

- A daily quiz is an ordinary quiz plus a date. Its questions follow every rule of [game-rules.md](../game-rules.md) and are drawn and stored as for any quiz.
- It has no creator run, so it is playable at once, and its runs never count on the global leaderboard (only creator runs do).
- The day is the calendar day in Europe/Berlin. The first request on a day creates its quiz; concurrent first requests produce one quiz (a unique date).
- One try per browser per day is a client rule: the browser remembers the dates it played. Without accounts the server cannot enforce it, and it does not try.

### Schema

- A new table maps a date to a quiz id, both unique. Forward-only migration, as AGENTS.md requires.

### API

- `GET /api/daily` returns today's date, the quiz id and the top of its quiz leaderboard; with `?run=` it marks the own run, as the quiz endpoint does. It creates the day's quiz on first use.
- Runs start through the existing `POST /api/runs` with the quiz id.
- Rate limits: the read limit of the leaderboards applies.

### Frontend

- Home shows the daily card; after a try it shows the rank and score instead.
- The leaderboard gets the "Heute" tab.
- Share text for a daily run: "Tagesquiz {date}: {n} in Folge" plus the run strip and the quiz link.
- The quiz link of a daily quiz stays playable after its day as an ordinary challenge link.

### Glossary

- Daily quiz: the one quiz of a calendar day in Europe/Berlin, the same for every player; it has no creator.

## Testing Decisions

- Domain tests: the first request of a day creates one quiz; a second request returns the same; a new day creates a new one; a daily quiz is playable without a creator.
- Integration test: two concurrent first requests produce one row (tagged `integration`, never truncating).
- Contract test `internal/contract/daily_integration_test.go` for `GET /api/daily`, including `?run=`.
- Frontend feature tests with `FakeApi`: the card before and after a try, the "Heute" tab, the share text.
- `scripts/smoke.sh` gains one check for `GET /api/daily`.

## Out of Scope

- Enforcing one try per person on the server.
- Streaks of days played, calendars and archives of past days.
- Notifications when a new day starts.

## Further Notes

- [game-rules.md](../game-rules.md) gains a "Daily quiz" section, and the "Quizzes" section stops saying that every quiz has a creator.
- `stats.sql` can report daily players per day once this ships.
