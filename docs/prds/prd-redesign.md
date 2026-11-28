# PRD: UI/UX redesign ("A+")

> Design handoff: [docs/redesign/](../redesign/README.md). Screens and numbered specs: [screens.md](../redesign/screens.md).
> Follow-ups split out as separately shippable PRDs: [daily quiz](prd-daily-quiz.md), [challenge link preview](prd-challenge-preview.md), [did you know](prd-did-you-know.md).

## Problem Statement

The rebuilt game works, but it plays like a form. A visitor types a name under a navbar, rule chips and a card, then answers questions inside a layout of pills, cards and badges.
Taps go wrong: the next question accepts a tap the moment it appears, so a tap meant for the last question lands on the new one, and the server counts it as wrong when it comes within 300 ms.
After a miss, Play again and Share sit exactly where the answers were, so a late tap starts a new run by accident.

Players have nothing to chase while they play. The score is a pill, the difficulty steps are invisible, and the personal best appears only after the run.
The end of a run is flat: a number, stat tiles and a small "new best" pill. A miss teaches little.
Sharing sends a plain sentence and a link whose preview looks the same for every quiz, and a friend who beats the challenger has no next step.

## Solution

The game gets a game look and a game loop, built from few, large components. Dark navy and gold, a rounded typeface, chunky buttons that look pressable.
While playing, the screen holds only the level, the streak, the time, the question and four large answers in reach of the thumb.

To answer, the player presses and holds an option for 0.4 seconds; a fill shows the commit, and sliding off cancels. A keyboard answers at once.
For the first 0.4 seconds of each question nothing can be pressed, and the result screen's buttons wait one second. Together these make accidental answers, too-fast answers and accidental restarts practically impossible.

Every five questions form a named level, shown as five pips. The player always sees how far the personal best is, and passing it during a run is celebrated on the spot.
The result screen leads with what matters at that moment: the gap to the record after a near miss, the celebration after a new record. It then shows one learning card about the missed question: the right answer next to the player's pick, with one sentence.

Sharing opens a sheet that shows exactly what friends will receive: the score, the level and a spoiler-free emoji line of the run, plus the challenge link.
A challenged player who wins sees a head-to-head result and can tell the challenger with one press. When a friend overtakes the player in a quiz, the home page says so on the next visit.

## User Stories

First-time visitor:

- As a first-time visitor, I want one short screen with three rules, a name field and one button, so that I'm playing within seconds.
- As a first-time visitor, I want the start button to teach me how answering works, so that the first question doesn't surprise me.
- As a first-time visitor, I want to know that my name appears publicly, so that I choose it consciously.

Player:

- As a player, I want my stored name used without asking again, so that a new run is one press away.
- As a player, I want answers that only count when I hold them, so that a slip of the thumb doesn't end my run.
- As a player, I want a keyboard to answer at once, so that the hold never slows me down at a desk or with assistive tech.
- As a player, I want the next question to ignore presses for a moment, so that a press meant for the last question doesn't count.
- As a player, I want to see my level and how many questions are left in it, so that I always have a next goal.
- As a player, I want to see how far my record is while I play, so that I know when it gets tense.
- As a player, I want a moment of celebration when I beat my record or reach a new level, so that the peak feels like one.
- As a player, I want to see the correct answer marked when I miss, so that I'm not left guessing.
- As a player, I want the result to tell me how close I came to my record, so that I want another go.
- As a player, I want one clear thing to remember from the question I missed, so that I get better each time.
- As a player, I want the result buttons to ignore my late taps, so that I don't restart or share by accident.
- As a player, I want Play again to lead after a near miss and Share to lead after a record, so that the obvious next step is the big one.
- As a player, I want to see what my friends will receive before I share, so that sharing feels safe.
- As a player, I want my share message to show my run without spoiling questions, so that friends can't cheat and still see how I did.
- As a player, I want to learn on my next visit when someone overtook me in a quiz, so that I can win it back.
- As a player who reloads mid-run, I want to be told that the clock kept running, so that a short timer doesn't feel like a bug.
- As a player whose connection drops while answering, I want my answer kept and retried, so that a network hiccup doesn't count as a miss in the UI.
- As a player who answers all 197 countries, I want a celebration worth a screenshot, so that the rarest result feels like it.

Challenged visitor:

- As a challenged visitor, I want to see who challenged me, their score and the exact number to beat, so that I know my target.
- As a challenged visitor, I want to see the quiz's leaderboard with a place for me, so that I see who else played.
- As a challenged visitor arriving while the challenger still plays, I want to wait on a page that explains it and lets me enter my name, so that I can start the moment it opens.
- As a challenged visitor who won, I want a head-to-head result and a one-press way to tell the challenger, so that the rivalry continues.
- As a challenged visitor, I want to know that challenge runs don't count worldwide and how to get on the world leaderboard, so that I'm not confused by a missing rank.

Everyone:

- As a visitor with low vision or a screen reader, I want large targets, strong contrast and announcements for every result, so that I can play as well as anyone.
- As a visitor who prefers reduced motion, I want the game without shaking, popping or confetti, so that it stays comfortable.
- As a visitor, I want every screen in German and English, so that I play in my language.

## Implementation Decisions

### Approach

| Approach | Effort | Risk | Reversibility | Pick |
| --- | --- | --- | --- | --- |
| Restyle the existing components in place and add the hold | Low | The old layout's structure (navbar, cards, tiles) stays; the result screen keeps its order | High | No |
| Rebuild the UI layer on the same routes, API and data hooks, with a small design system | Medium | Many components change at once; covered by the feature tests | High: routes and API stay | **Yes** |
| A separate new frontend | High | Two apps during the switch; duplicated API and i18n code | Low | No |

The rebuild keeps everything below the UI: routes, the run state hook and its clock maths, the API functions, query keys, storage helpers and i18n.
Only one small API addition is needed (the missed question's target and the pick's country, below).

### Look and design system

- One dark theme replaces the light/dark system theme. Colours are named tokens in the stylesheet, so a light theme can return later without touching components.
- The token set, type scale, radii, component specs and timings are fixed in [design-system.md](../redesign/design-system.md). Text and control colours meet WCAG AA; controls use the 3:1 `border-strong` outline.
- The typeface is Baloo 2 (SIL OFL), self-hosted from its npm font package as a Latin subset in three weights. The edge's CSP allows only same-origin fonts (D12), so Google Fonts are never linked.
- Icons stay Lucide. Flags stay the flag-icons SVGs.
- A small shared component set: `Button` (primary, secondary), `HoldButton`, `Sheet`, `Tabs`, `Banner`. Game components belong to their features.

### Layout and navigation

- One column, max 448 px, 16 px gutters. Primary actions sit in the bottom third.
- No header on the play route. Elsewhere a 56 px header: wordmark, leaderboard icon, language switch.
- The data credit line stays on home, challenge and leaderboard, as the data licence requires; it never shows on the play route.
- Routes are unchanged: `/`, `/play/:runId`, `/q/:quizId`, `/leaderboard`, not found.

### Hold to answer

- An answer option commits after the pointer has been down on it for 400 ms. Releasing earlier, leaving the option, or a pointer cancel cancels without effect. A fill grows across the option while held.
- Keyboard activation (Enter or Space on a focused option, a click with no pointer down) commits at once.
- The same `HoldButton` starts a run on the first-visit home and accepts a challenge. On the returning home, Play is a plain tap; a mistaken start costs nothing.
- The long-press context menu and text selection are suppressed on options.
- Where the device supports it, a short vibration confirms the commit.
- One commit per question: after the first, all options are disabled until the next question.

### Guard times

- Arming: options are disabled for 400 ms after a question renders and fade in.
- Result: every button on a result screen is disabled for 1000 ms after the result renders, labelled "Gleich …".
- Reveal: 650 ms after a correct answer, 1100 ms when a toast shows, 1300 ms after a wrong answer before the result screen. These are client delays; the server clock is unchanged.

### Levels and progress

- A level is a block of five questions: level = position ÷ 5 + 1 (position counting from 0). This follows the existing tier rule, under which each block of five allows the next difficulty tier.
- Level names follow the newest tier they allow: Flaggen/Flags, Hauptstädte/Capitals, Sprachen/Languages, Profi/Pro for level 4 and above.
- Five pips show done, current and open questions of the level.
- The streak pill shows the score and pops "+1" on a correct answer.
- The record gap shows "Rekord in N", "Rekord eingestellt", then "Neuer Rekord" against the personal best stored in the browser.
- Toasts appear for two events only: passing the personal best, and reaching a new level.

### Result screens

The result screen picks one of these heads, in order:

| Condition | Head | Leading action |
| --- | --- | --- |
| End reason `completed` | "Du hast die Welt durchgespielt", 197 squares | Share |
| Challenge run with a score above the creator's | Head-to-head "Du hast {name} geschlagen!" | Tell the creator (share) |
| Score above the personal best | "Neuer Rekord!", the old record, the new world rank | Share |
| Otherwise | "So knapp!" or "Zeit abgelaufen", the gap to a new record | Play again |

Below the head, in this order: the run strip (one square per answer, blocks of five), the learning card, and on the near-miss variant the gap bar. Then the two actions.
A challenge run is a run without a global rank; its creator's name and score come from the existing quiz endpoint.

### Learning card

- Exactly one per run, only about the missed question. A timeout shows the correct answer only; a completed run has none.
- It shows the correct option next to the player's pick (flags side by side, otherwise two chips) and one generated sentence per question type. Examples: "{pick} ist die Hauptstadt von {country}. Die Hauptstadt von {target} ist {correct}." and, for flags, "Das ist {target}. Du hattest {country}."
- The reveal during play only marks the options. The sentence appears once, on the result.
- API addition: the missed question in a finished run's result gains `target` (the target country's name as `{de, en}`) and `chosenCountry` (the country the chosen wrong option names or belongs to, as `{de, en}`, or null when it belongs to several countries, such as a shared currency or a continent, or when there was no pick). The result already reveals the correct option, so this leaks nothing new.
- Curated memory hooks such as "Mali beginnt links mit Grün" are out of scope; the sentence templates cover every question type.

### Sharing

- Share buttons open a sheet with a preview of the message and two actions: the system share sheet where the browser has one, else copying text and link to the clipboard with a "Kopiert!" confirmation.
- The share text holds the score, the level, the run strip as emoji (🟩 per correct answer, 🟥 for the miss, blocks of five separated by spaces, at most four blocks per line), the challenge line and the quiz link. It never names a question, option or country.
- After a won challenge, the text names the creator's quiz and the new score.
- The link stays `/q/<quizId>`. A link preview per quiz is a separate PRD.

### Challenge page

- Three states, from the existing endpoint: creator still playing (waiting page; polls every 5 s as today; the name can be entered; the button waits), playable (creator name, score, "Schaffst du {score + 1}?", the quiz leaderboard with an empty "Du" slot, name and hold to accept), creator hidden (as playable, without the head).
- A stored name replaces the field with "als {name} · Name ändern", as on home.

### Remembered runs and the overtaken card

- The browser keeps a short list of quizzes it played: quiz id, its own run id, its rank when last seen, and the creator's name. At most 20 entries, newest first; blocked storage turns the feature off silently.
- On home, the three newest entries are read through the existing quiz endpoint, marking the own run. When the own rank is now worse than the stored rank, a card names the entry just above and its score, and links to the challenge page. The stored rank then updates.
- These are at most three reads per home visit, inside the existing per-address read limits.
- The personal-best store also keeps the highest level reached and the last world rank, for the home screen and the "vorher" line.

### Leaderboard

- Tabs: world (as today) and the newest remembered quiz. The daily tab arrives with its PRD.
- Podium for ranks 1–3, then 50 px rows. The own row is highlighted in place, or pinned to the bottom with a Play button when it's outside the list.

### Edge cases

- Reload during a run: when the first loaded state of the page has an open question with less than its full time left, a banner says the clock kept running and shows the seconds.
- Answer request fails with a network error: the pick stays marked with a spinner, options stay disabled, the request is retried with backoff until the question's deadline plus the 2 s grace, and a banner offers an immediate retry. The UI shows a miss only when the server says so.
- Too fast: with hold and arming, a touch answer can't arrive within 300 ms. The existing "too fast" wording stays for the keyboard case.

### Accessibility

- Every control is at least 44 px; answers are 64 px (text) or 124 px (flags) with 12 px between them.
- Correct and wrong carry an icon and screen-reader text besides colour; red and green differ in lightness.
- A new question moves focus to its heading, as today; a result moves focus to its head. Reveals, toasts and banners use status or alert roles.
- Reduced motion removes the pop, shake, toast, sheet and confetti animations; the hold fill stays because it is feedback.
- Foreign words carry their `lang`.

### Copy and i18n

- All strings are in [copy.md](../redesign/copy.md) in German and English and go into the features' `messages.ts`.
- German genitives of names follow the apostrophe rule for names ending in s, ß, x or z.

## Testing Decisions

Tests check external behaviour only: what a player sees and can do, and what the API returns.

- Frontend feature tests with `FakeApi` and `renderRoute()`, as in `play.test.tsx`, `home-page.test.tsx`, `challenge-page.test.tsx` and `leaderboard-page.test.tsx`:
  - holding an option for 400 ms answers it, and releasing at 300 ms or leaving the option does not (fake timers, pointer events);
  - Enter on a focused option answers at once;
  - options ignore presses during the first 400 ms of a question;
  - result buttons ignore presses during their first 1000 ms;
  - level label and pips follow the question position; the record gap and the toasts follow the stored best;
  - each result head appears for its condition, with its leading action;
  - the learning card shows the correct option, the pick and the sentence, and shows nothing more for a completed run;
  - the share text contains score, level and strip and no option text; the clipboard path shows "Kopiert!";
  - the overtaken card appears only when a remembered quiz's own rank got worse;
  - the challenge page's three states;
  - a network error while answering keeps the pick and retries; a later success continues the run;
  - every string exists in both languages (the existing message typing covers this).
- A unit test for the share text builder and the level calculation, where a feature test would be slow.
- Backend: a contract test in `internal/contract/` for the missed question's `target` and `chosenCountry` on a finished run, including null for a shared currency and for a timeout. The domain test of the result mapping covers the country lookup.
- `make e2e` and `scripts/smoke.sh` stay as they are: they check API routes, headers and the SPA route, which do not change.
- Visual changes have no snapshot tests; the screens in `docs/redesign/screens/` are the reference for review.

## Out of Scope

- Daily quiz, per-quiz link preview images, "Wusstest du?" facts and phrases: separate PRDs.
- A light theme, sound effects, music and custom haptic patterns.
- Accounts, friends lists, push or e-mail notifications.
- Curated memory hooks per question.
- Changes to game rules, scoring, timing on the server, or leaderboards beyond the API addition above.
- Image generation of the share card for story formats.

## Further Notes

- This PRD bundles the UI redesign because its parts share one design system and one release. The features that need new data or server work were split out, as the handbook asks for independently shippable features.
- New glossary terms are added to `docs/UBIQUITOUS_LANGUAGE.md`: level, personal best, hold to answer, arming, learning card, run strip, remembered quiz.
- What to watch in `make prod-stats` after release: the replay share and the challenge share (should rise), the median score (should not drop), the share of runs ending within the first five questions, and misses by question type.
- A useful addition to `stats.sql` later: the median time from serving to answer, to see what the hold costs.
- The prototypes in `docs/redesign/prototypes/` are a reference, not code. Their German sample texts and facts are examples.
