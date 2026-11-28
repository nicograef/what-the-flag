# PRD: UI/UX redesign ("A+")

> Design handoff: [docs/redesign/](../redesign/README.md). Screens and numbered specs: [screens.md](../redesign/screens.md).
> Follow-ups split out as separately shippable PRDs: [daily quiz](prd-daily-quiz.md), [challenge link preview](prd-challenge-preview.md), [did you know](prd-did-you-know.md).
> Data and rules come from [plan-anonymous-player.md](../plans/plan-anonymous-player.md) and [plan-quiz-domain-now.md](../plans/plan-quiz-domain-now.md). This PRD owns presentation: screens, hold, tokens, copy and motion.

## Problem Statement

The rebuilt game works, but it plays like a form.
A visitor types a name under a navbar, rule chips and a card. Then they answer inside a layout of pills, cards and badges.

Taps go wrong:

- the next question accepts a tap the moment it appears;
- so a tap meant for the last question lands on the new one;
- the server counts that tap as wrong when it comes within 300 ms;
- after a miss, Play again and Share sit where the answers were, so a late tap starts a new run.

Players have nothing to chase while they play. The score is a pill, and the difficulty steps are invisible.
The end of a run is flat: a number, stat tiles and a small "new best" pill. A miss teaches little.
Sharing sends a plain sentence. A friend who beats the challenger has no next step.

## Solution

The game gets a game look and a game loop, built from few, large components.
It uses dark navy and gold, a rounded typeface and chunky buttons that look pressable.
While playing, the screen holds the level, the streak, the time, the question and four large answers.

On a touch screen, the player holds an option for 0.4 seconds to answer. A fill shows the progress, and sliding off cancels.
A mouse click or a key answers at once.
For the first 0.4 seconds of each question nothing can be pressed. The result screen's buttons wait one second.

Every five questions form a level, 1 to 10, each with a rank name. The player sees how far the personal best is.
Passing the personal best during a run is celebrated on the spot.
The result screen leads with what matters at that moment: the gap after a near miss, the celebration after a record.
It then shows one learning card about the missed question.

Sharing opens a sheet that shows exactly what friends will receive. That is the score, the level, a spoiler-free run strip and the link.
A challenged player who wins sees a head-to-head result and can tell the challenger with one press.

## User Stories

First-time visitor:

- As a first-time visitor, I want one short screen with three rules, a name field and one button, so that I'm playing within seconds.
- As a first-time visitor on a phone, I want the start button to teach me the hold, so that the first question doesn't surprise me.
- As a first-time visitor, I want to know that my name appears publicly, so that I choose it consciously.

Player:

- As a returning player, I want the game to know my last name, so that a new run is one press away.
- As a player on a phone, I want answers that only count when I hold them, so that a slip of the thumb doesn't end my run.
- As a player with a mouse, keyboard or assistive tech, I want a click or a key to answer at once, so that the hold never slows me down.
- As a player, I want the next question to ignore presses for a moment, so that a press meant for the last question doesn't count.
- As a player, I want to see my level and how many questions are left in it, so that I always have a next goal.
- As a player, I want to see how far my record is while I play, so that I know when it gets tense.
- As a player, I want a moment of celebration when I beat my record or reach a new level, so that the peak feels like one.
- As a player, I want to see the correct answer marked when I miss, so that I'm not left guessing.
- As a player, I want the result to tell me how close I came to my record, so that I want another go.
- As a player, I want one clear thing to remember from the question I missed, so that I get better each time.
- As a player, I want the result buttons to ignore my late taps, so that I don't restart or share by accident.
- As a player, I want Play again to lead after a near miss and Share after a record, so that the obvious next step is the big one.
- As a player, I want to see what my friends will receive before I share, so that sharing feels safe.
- As a player, I want my share message to show my run without spoiling questions, so that friends can't cheat.
- As a player who reloads mid-run, I want to be told that the clock kept running, so that a short timer doesn't feel like a bug.
- As a player whose connection drops while answering, I want my answer kept and retried, so that a hiccup doesn't count as a miss.
- As a player who answers all 197 countries, I want a celebration worth a screenshot, so that the rarest result feels like it.

Challenged visitor:

- As a challenged visitor, I want to see who challenged me, their score and the number to beat, so that I know my target.
- As a challenged visitor, I want to see the quiz's leaderboard with a place for me, so that I see who else played.
- As a challenged visitor arriving while the challenger still plays, I want to wait on a page that explains it, so that I can start once it opens.
- As a challenged player, I want the play header to count to the challenger's score, so that I chase the promised target.
- As a challenged visitor who won, I want a head-to-head result and a one-press way to tell the challenger, so that the rivalry continues.
- As a challenged visitor, I want to know why a challenge run has no world rank, so that I'm not confused by a missing rank.

Everyone:

- As a visitor with low vision or a screen reader, I want large targets, strong contrast and announcements, so that I can play as well as anyone.
- As a visitor who prefers reduced motion, I want the game without shaking, popping or confetti, so that it stays comfortable.
- As a visitor, I want every screen in German and English, so that I play in my language.

## Implementation Decisions

### Approach

| Approach | Effort | Risk | Reversibility | Pick |
| --- | --- | --- | --- | --- |
| Restyle the existing components in place and add the hold | Low | The old layout's structure stays; the result screen keeps its order | High | No |
| Rebuild the UI layer on the same routes, on the player API and the domain's result payload | Medium | Many components change at once; covered by the feature tests | High: routes and API stay | **Yes** |
| A separate new frontend | High | Two apps during the switch; duplicated API and i18n code | Low | No |

### Data sources

The redesign reads its data from the approved plans.

| Data | Source | Plan |
| --- | --- | --- |
| Last name, personal best, world rank and score, latest quiz | `GET /api/me` → `{ lastName, best, worldRank, worldBest, lastQuizId }`; all null without a known player | anonymous player, phase 3 |
| New record and the best before the run | finished-run `best: { score, isNew, previous }` | anonymous player, phase 3 |
| Own leaderboard row | the `own` flag the server sets from the player key | anonymous player, phase 2 |
| Own quiz | challenge response `creator.own`: true when the creator run belongs to the requesting player | anonymous player, phase 2 |
| Level, 1 to 10 | `level` on every question and on the result | domain, phase 5 |
| Learning card | finished-run `fact: { name, flag, capital, region, languages, currencies, chosenCountry, spokenIn }` | domain, phase 7 |

- The browser stores no name, record, level, rank or quiz list. Locale storage stays.
- The first-visit layout shows while `lastName` is null. A failing `/api/me` also shows it.
- The client never computes the level.

### Frontend changes below the UI

Routes, query keys, the API client and i18n stay. These change:

- `use-run.ts`:
  - a `revealDelay(outcome)` input replaces the fixed 800 ms and 1500 ms;
  - a commit latch keyed by position lets one answer per question through;
  - the latch covers a hold, a click, a key and the expiry;
  - an answer that fails with a network error retries with backoff until the deadline plus the 2 s grace;
  - the answer mutation uses `networkMode: 'always'`, so an offline answer fails and retries instead of pausing;
  - an `isRetrying` flag and an immediate-retry action feed the offline banner;
  - a 409 `not_current_question` after a lost response means "already answered": the hook refetches the state and shows it;
  - a resume flag holds when the first data fetched after mount has `deadline − serverNow < limitMs`.
- `renderRoute()` gets a retry-delay override for mutations, as it has for queries.

### Look and design system

- One dark theme replaces the light and dark system themes (D15).
- The token set, type scale, radii, component specs and timings are fixed in [design-system.md](../redesign/design-system.md).
- The A+ tokens replace the shadcn tokens in one commit, with no alias layer. A gate grep keeps the old class names out.
- Text and control colours meet WCAG AA; controls use the 3:1 `border-strong` outline.
- The typeface is Baloo 2 (SIL OFL), self-hosted from `@fontsource-variable/baloo-2` (D16).
  - It loads the latin and latin-ext subsets, so names such as Chișinău and Złoty render in one font.
  - The edge's CSP allows only same-origin fonts (D12), so Google Fonts are never linked.
- Icons stay Lucide. Flags stay the flag-icons SVGs.
- A small shared component set: `Button`, `HoldButton`, `Sheet`, `Tabs`, `Banner`. Game components belong to their features.
- `Sheet` is a native `<dialog>` opened with `showModal()`. Radix Dialog injects a `<style>`, which the CSP's `style-src 'self'` blocks.

### Layout and navigation

- One column, max 448 px, 16 px gutters. Primary actions sit in the bottom third.
- The header depends on the route:

  | Route | Header |
  | --- | --- |
  | `/`, `/q/:quizId`, not found | 56 px: wordmark (links home) left; leaderboard icon and language switch right |
  | `/leaderboard` | The same, without the leaderboard icon |
  | `/play/:runId` | None; the play header (level, streak, gap) respects the top safe-area inset |

- The data credit line closes every route except `/play/:runId`, as the data licence requires. It is a 13 px caption link to NOTICE with a 44 px target.
- Routes are unchanged: `/`, `/play/:runId`, `/q/:quizId`, `/leaderboard`, not found.
- Where a screen in `docs/redesign/screens/` differs from this PRD, this PRD wins.

### Hold to answer

Who holds:

- Touch and pen pointers must hold. An option commits 400 ms after `pointerdown`, while the pointer is still down on it.
- A mouse click commits at once. So do Enter and Space on a focused option.
- A click that no touch or pen `pointerdown` on the same option preceded commits at once. Screen readers and switch access send such clicks.

Cancelling a touch hold before 400 ms:

- releasing the pointer;
- leaving the option: a hit test on `pointermove` with 12 px slop, because touch pointers are implicitly captured;
- `pointercancel`.

The mechanics:

- Each question runs a ref-based phase machine: arming, ready, holding, committed. The commit latch in `use-run.ts` backs it.
- A hold that is running when the clock reaches 0 completes and commits. The server's 2 s grace accepts it.
  The expiry sends no answer while a hold runs.
- The long-press context menu, image callouts and text selection are suppressed on options.
- Where the device supports it, a 12 ms vibration confirms the commit.
- The first-visit start and the challenge accept use the same `HoldButton`. On the returning home, Play is a plain button.
- `HoldButton` labels name the hold where the primary pointer is coarse. Elsewhere they read "Starten" and "Annehmen".
- On touch, the hold hint shows during the first three questions of a first run.
  A first run is one whose player had no ended run: `best` was null when the play screen loaded.
- `HoldButton` is built first. The device matrix checks it before release; its findings change the hold, not the screens.

### Guard times

- Arming: for 400 ms after a question renders, options are `aria-disabled` at 30 % opacity. Activation does nothing.
  They stay in the tab order and keep their labels.
- Result guard: for 1000 ms after a result renders, its buttons are `aria-disabled` and fade in. Their labels never change.
- Reveal: 650 ms after a correct answer, 1100 ms when a toast shows, 1300 ms after a wrong answer.
  These are client delays; the server clock is unchanged.
- On touch, arming plus the hold use 0.8 s of the 15 s clock.

### Levels and progress

- The level label reads "Level {n} · {rank name}". Each of the ten levels has a neutral rank name ([copy.md](../redesign/copy.md#rank-names)).
- Five pips show the position inside the current block of five: done, current, open. At level 10 they keep counting blocks of five.
- The streak pill shows the score and pops "+1" on a correct answer.
- The gap pill counts to a target. Its count is always the questions to beat it: target + 1 − score.

  | Run | Target | Before the tie | At the tie | Above |
  | --- | --- | --- | --- | --- |
  | Own run, `best` set | `best` from `/api/me`, read at the start | "Rekord in N" | "Rekord eingestellt" | "Neuer Rekord" |
  | Own run, first run | none | no pill | no pill | no pill |
  | Challenge run | the creator's score | "{name} in N" | "{name} eingeholt" | "{name} geschlagen" |

- Toasts appear for two events only:
  - the score passes the gap pill's target;
  - the question's level is above the previous question's level. Level 10 is the last level toast.

### Result screens

The result shows the first row whose condition holds.
`gap` is `best.previous + 1 − score`. "Near" means `gap ≤ 3` or `gap ≤ 0.15 × best.previous`.
A challenge run is a run on a quiz whose creator is another player, so `creator.own` is false.

| # | Condition | Head | Subline | Sections, in order | Primary | Secondary |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | End reason `completed` | `headCompleted` | `scoreLine` | 197 gold squares | `shareCompleted` | `playAgain` |
| 2 | Challenge, score above the creator's | `wonTitle` | `quizRankLine` | head-to-head, run strip, learning card, `challengeNote` | `tellCreator` | `ownGameWorld` |
| 3 | Challenge, score equals the creator's | `tiedTitle` | `quizRankLine` | head-to-head, run strip, learning card, `challengeNote` | `tellCreator` | `ownGameWorld` |
| 4 | Challenge, score below the creator's | `headBehind` | `quizRankLine` | run strip, learning card, `challengeNote` | `ownGameWorld` | `shareRun` |
| 5 | `best.isNew` and `best.previous` null | `headFirst` | `scoreLine` | run strip, learning card | `shareRecord` | `playAgain` |
| 6 | `best.isNew` | `headRecord` | `recordLine` | run strip, learning card | `shareRecord` | `playAgain` |
| 7 | Score equals `best.previous` | `headTied` | `scoreLine` | run strip, learning card, gap bar | `playAgain` | `shareRun` |
| 8 | Near | `headNearMiss` | `scoreLine` | run strip, learning card, gap bar | `playAgain` | `shareRun` |
| 9 | End reason `timeout` | `headTimeout` | `scoreLine` | run strip, learning card | `playAgain` | `shareRun` |
| 10 | Otherwise | `headOver` | `scoreLine` | run strip, learning card | `playAgain` | `shareRun` |

- Rows 2 to 4 add `recordBadge` under the subline when `best.isNew`, or `recordBadgeFirst` on a first run. Neither names a world rank.
- A world rank shows only when `result.globalRank` is set, which means a creator run.
- `scoreLine` names "Platz {rank} weltweit" when `best.isNew`. Otherwise it names "dein bester Platz", the rank the server reports.
- Rows 7 and 8 need `best.previous`. A first run (`best.previous` null) shows no "vorher" line and had no gap pill.
- A score of 0 shows no share action.
- The two actions sit in a sticky bottom bar with the safe-area inset. The sections scroll above it.
- The creator's name and score come from the quiz endpoint.

### Learning card

- Exactly one per run, after a `wrong` or `timeout` end, on every head that lists it. A completed run has none.
- It renders `result.fact`:
  - the correct option beside the pick: flags side by side with country captions, otherwise two chips;
  - one sentence per question type, from the table in [copy.md](../redesign/copy.md#learning-sentences);
  - a fact row: the target's name and flag, capital, continent, official languages and currencies.
- [prd-question-engine.md](prd-question-engine.md#learning-card) defines the `fact` fields, `chosenCountry` included.
- A too-fast pick shows the correct option only.
- The reveal during play only marks the options. The sentence appears once, on the result.
- Templates never put an article before a country name, because the catalogue has none.

### Sharing

- Share buttons open a sheet with a preview of the message and two actions.
  - The system share sheet where the browser has one.
  - Else copying text and link to the clipboard, confirmed by "Kopiert!".
- The preview shows the static `og.png` until [prd-challenge-preview.md](prd-challenge-preview.md) ships.
- The share text holds the score, the level, the run strip, the challenge line and the quiz link. It never names a question, option or country.
- The run strip in the share text:
  - one square per answer: 🟩 correct, 🟥 wrong, ⏱️ timeout;
  - blocks of five separated by a space, two blocks per line;
  - a run of more than 10 answers shows "🟩 ×{k}" on line one;
  - line two then holds the last two blocks.
- After a won challenge, the text names the creator's quiz and the new score.
- The link stays `/q/<quizId>`.

### Challenge page

States, from the challenge endpoint:

| State | When | Shows |
| --- | --- | --- |
| Waiting | the creator run is open | the waiting page; it polls every 5 s; the name can be entered; the accept button is `aria-disabled` |
| Playable | the creator run has ended | creator name and score, "Schaffst du {score + 1}?", the quiz leaderboard with an empty "Du" slot, name and hold to accept |
| Creator hidden | the creator run is hidden | as playable, without the head |
| Own quiz | `creator.own` | "Dein Quiz" head with the own score, the leaderboard, and Play as a plain button |

- When the waiting page unlocks, a `role=status` region says "Das Quiz ist jetzt offen".
- A known `lastName` replaces the field with "als {name} · Name ändern", as on home.

### Leaderboard

- Tabs: world, and "Letztes Quiz" for `lastQuizId` when it is set. The daily tab ships with its PRD.
- Podium for ranks 1–3, then 50 px rows.
- The own row is highlighted in place inside the top 100.
- On the world tab, an own row outside the top 100 is pinned to the bottom from `/api/me`: `worldRank`, "Du" and `worldBest`, with a Play button.
- The quiz tab only highlights in place. Its board stops at 100.

### Edge cases

- Reload during a run: the resume flag of `use-run.ts` shows a banner with the seconds left.
- A run whose open question has expired loads as a timeout result, without the banner.
- An answer that fails with a network error:
  - the pick stays marked with a spinner, and options stay `aria-disabled`;
  - retries run until the deadline plus the 2 s grace, and a banner offers an immediate retry;
  - the UI shows a miss only when the server says so.
- Too fast: arming makes an answer within 300 ms practically unreachable. The existing "too fast" wording stays as a fallback.

### Accessibility

- Every control is at least 44 px. Answers are at least 64 px (text) or 124 px (flags) tall, with 12 px between them.
- Options grow with their text. Prompt words shrink from 46 px to 28 px, then wrap to two lines.
- Layouts hold at 320 px width, 200 % zoom and 667×375 landscape.
- Correct and wrong carry an icon and screen-reader text besides colour. The miss square and miss pip carry a cross glyph.
- Options point `aria-describedby` at a static text that names every way to answer.
- Outcomes go to one persistent `role=status` region, apart from the hint.
- The streak is sr-only text. The timer keeps `aria-valuetext`, as today. The level label includes "Frage {k} von 5" for screen readers.
- A new question moves focus to its heading, as today. A result moves focus to its head.
- The sheet returns focus to its trigger on close. Tabs use roving tabindex with arrow keys and a tabpanel.
- Forced-colors mode keeps options, pips, strip squares and the hold fill visible ([design-system.md](../redesign/design-system.md#forced-colors)).
- Reduced motion removes the pop, shake, toast, sheet and confetti animations. The hold fill stays because it is feedback.
- Foreign words carry their `lang`.

### Copy and i18n

- All strings are in [copy.md](../redesign/copy.md) in German and English and go into the features' `messages.ts`.
- German genitives of names follow the apostrophe rule for names ending in s, ß, x or z.
- Dates use `Intl.DateTimeFormat` with the UI locale.

## Testing Decisions

Tests check external behaviour only: what a player sees and can do, and what the API returns.

Frontend feature tests with `FakeApi` and `renderRoute()`:

- Flow tests answer with a mouse click or Enter once arming ends, through one shared helper.
- Hold tests use fake timers and touch pointer events:
  - a 400 ms touch hold answers; a release at 300 ms or a slide off the option does not;
  - a touch hold that started at 14.8 s answers when the clock reaches 0;
  - a hold and the expiry together send one answer.
- A click with no preceding pointer down answers at once.
- During arming, options ignore activation and stay reachable by Tab.
- Result buttons ignore activation for 1000 ms and keep their labels.
- The level label and pips follow the server's `level` and the position. No level toast fires after level 10.
- The gap pill and the record toast follow `/api/me` `best`. A challenge run's pill counts to the creator.
- Each row of the result table shows its head and its two actions. That covers completed, won, tied, behind, first run, record, tie, near, timeout and far.
- The learning card shows the correct option, the pick and the sentence. It shows the correct option only for a too-fast pick. A completed run shows none.
- The share text holds score, level and strip and no option text. A run of 23 answers uses the "×" line. The clipboard path shows "Kopiert!".
- The first-visit layout shows for a null `lastName` and for a failing `/api/me`.
- The challenge page's states: waiting to playable, creator hidden, own quiz.
- The world tab pins the own row from `/api/me` when it is outside the list.
- The resume banner shows on a reload mid-question. An expired open run shows the timeout result.
- A network error while answering keeps the pick and retries; a later success continues the run. A 409 after a lost response shows the next state.
- The sheet closes on Escape and returns focus.
- The credit line shows on home, challenge and leaderboard, and never on `/play`.
- Follow-up features are absent: the daily card, the "Heute" tab and the did-you-know card.
- Every string exists in both languages; the existing message typing covers this.

Unit tests for the share text builder and the result-head selection, which have many cases.

Gate greps:

- no `fonts.googleapis` or `fonts.gstatic` in `frontend/dist`;
- no old token class such as `bg-muted` or `text-muted-foreground` in `frontend/src`;
- no `@radix-ui/react-dialog` in `frontend/package.json`.

A device matrix runs before release: iOS Safari, Android Chrome, iOS VoiceOver and Android TalkBack.
It checks the touch hold, slide-off, and that assistive tech can answer.

`make e2e` and `scripts/smoke.sh` stay as they are: routes, headers and the SPA route do not change.
Visual changes have no snapshot tests. The screens in `docs/redesign/screens/` are the reference for review.

## Out of Scope

- Rule changes. A+ renders the game rules as amended by the player and domain plans.
- Daily quiz, per-quiz link preview images, did-you-know facts and phrases: separate PRDs. Each is absent until it ships.
- The overtaken card. It is a later follow-up to the player plan, where `/api/me` gains `overtaken` for the latest 3 quizzes.
- A light theme, sound effects, music and custom haptic patterns.
- Accounts, friends lists, push or e-mail notifications.
- Curated memory hooks per question.
- Image generation of the share card for story formats.

## Further Notes

Documents this PRD changes:

| Document | Change | When |
| --- | --- | --- |
| `docs/prds/prd-rebuild.md` | Look, Sharing and Out of Scope point to this PRD and the follow-ups | with this PRD |
| `docs/decisions.md` | D15 dark-only theme, D16 self-hosted Baloo 2 | with this PRD |
| `docs/UBIQUITOUS_LANGUAGE.md` | Rank name, Hold to answer, Arming, Result guard, Learning card, Run strip; the plan terms it uses: Level, Personal best, Player, Player key, the leaderboards | with this PRD |
| `docs/game-rules.md` | The result paragraph names the learning card | with the learning-card phase |
| `frontend/index.html` | `color-scheme: dark` and one `theme-color` | with the token phase |

- If the device matrix shows that assistive tech cannot answer on touch, a "one tap" setting follows. It answers on tap after arming.
- What to watch in `make prod-stats` after release:
  - the replay share and the challenge share, which should rise;
  - the median score, which should not drop;
  - the share of runs ending within the first five questions;
  - misses by question type.
- The prototypes in `docs/redesign/prototypes/` are a reference, not code. Their German sample texts and facts are examples.
