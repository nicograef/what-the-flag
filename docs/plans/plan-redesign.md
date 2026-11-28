# Plan: UI/UX redesign (A+)

> Source PRD: docs/prds/prd-redesign.md. Handoff: docs/redesign/ (screens.md, design-system.md, copy.md). Lane `redesign` of docs/plans/programme.md.

## Goal

The game looks and plays like a game, on the data of the approved plans:
- one dark navy-and-gold theme in Baloo 2, self-hosted;
- hold to answer on touch, with arming and guarded result buttons;
- a play header with level, pips, streak and the gap to the record;
- result heads by the PRD's table, a run strip and one learning card per run;
- a share sheet, the challenge states, tabbed leaderboards and honest edge cases.

## Architectural decisions

- **Frontend only.** The lane edits no backend file. Routes, query keys, the API client and i18n stay.
- **Data sources.** Every field comes from the shared contract; the browser stores only the locale.

  | Data | Source | Lands with |
  | --- | --- | --- |
  | `lastName`, `best`, `worldRank`, `worldBest`, `lastQuizId` | `GET /api/me`, all null without a known player | anonymous-player 3 |
  | `best: { score, isNew, previous }` | the finished-run payload | anonymous-player 3 |
  | own row | the `own` flag the server sets from the player key | anonymous-player 2 |
  | `creator.own` | `GET /api/quizzes/:quizId` | anonymous-player 2 |
  | `level`, 1 to 10 | every question and the result | quiz-domain-now 5 |
  | `fact: { name, flag, capital, region, languages, currencies, chosenCountry, spokenIn }` | the finished-run payload after a `wrong` or `timeout` end | quiz-domain-now 7 |

- **Level and fact come last.** Phases 1–9 need only the player API. Phase 10 reads `level`, phase 11 reads `fact`.
  - The backend lanes add each field to the goldens and to the schemas in `features/play/api.ts`. `api-contract.test.ts` compares the parse with `toEqual`, so a golden field missing from a schema fails their gate.
  - The lane stops after phase 9. Once domain-engine has landed (domain-data lands before it), the lead rebases it and resumes at phase 10.
  - Until phase 10, the play header shows pips without the level label.
  - Until phase 10, `scoreLine`, `recordLine` and `shareText` leave out their level segment.
  - Until phase 11, the learning-card slot keeps today's `MissedQuestion`.
- **First run.** The play screen reads `/api/me` once at mount and keeps that value for the whole run.
  - `best == null` marks a first run: no gap pill, and the hold hint shows on touch.
  - `lastName` can't mark it, because the started run already sets it (inference from `PlayerSummary`).
- **Challenge run.** The play screen reads `getChallenge(quizId)` once at mount, under the challenge page's query key.
  - A challenge run has `creator != null` and `creator.own == false`. A hidden creator plays as an own run.
- **Hold to answer (D3, D4).**
  - Touch and pen hold. The commit fires on a timer 400 ms after `pointerdown`, while the pointer is down.
  - Release, a `pointermove` more than 12 px outside the option, or `pointercancel` cancels before 400 ms.
  - A click that no touch or pen `pointerdown` on the same element preceded commits at once. Enter and Space commit at once.
  - One hook in `components/ui/hold-button.tsx` holds these rules. `HoldButton` and `AnswerOption` both use it.
  - Each question runs a ref-based phase machine: arming, ready, holding, committed.
- **Commit latch.** `use-run.ts` lets one answer per position through: hold, click, key or expiry.
  - The expiry sends nothing while a hold runs. A hold running at 0 s completes and commits inside the server's 2 s grace.
- **Base components land with their first user.** By phase: `Button` 1, `HoldButton` 2, `Sheet` 6, `Tabs` 8, `Banner` 9.
  shadcn's `card`, `input`, `skeleton` and `table` go with their last user; `progress` goes in phase 1. `empty-state` stays for not-found and error states.
- **Tokens replace shadcn in one commit.** No alias layer.
  - `radix-ui`, `shadcn`, `@fontsource-variable/geist` and `components.json` go; nothing uses them after phase 1.
  - `Button` renders a `<button>`; links take its classes. The timer is a plain `role=progressbar`.
- **Sheet.** A native `<dialog>` opened with `showModal()`. It closes on its `cancel` event and its close button, then focuses its trigger.
  - jsdom 31 has no `showModal` (its `HTMLDialogElement` is empty). `src/test/setup.ts` fakes `showModal`, `close` and Escape → `cancel`.
- **Tests.**
  - Flow tests answer through one helper, `src/test/answer.ts — answer()`: Enter on the option once arming ends.
  - Hold tests use `vi.useFakeTimers({ shouldAdvanceTime: true })` and `fireEvent` pointer events with `pointerType: "touch"`.
  - jsdom 31 has no `matchMedia`. `src/test/setup.ts` fakes it: a fine pointer and no reduced motion by default, switchable per test.
- **Copy.** Every string from docs/redesign/copy.md goes into the feature's `messages.ts`, de and en. `copy.md`'s "Keys that stay" keep their text.
- **Gate.** Each phase ends with `make fe-check`, because the lane touches only the frontend. Phase 12 runs `make check` and `make e2e`.

## Inventory

- `docs/prds/prd-redesign.md` — the spec; its result table, gap-pill table and challenge states drive phases 4, 5 and 7.
- `docs/redesign/design-system.md`, `copy.md`, `screens.md`, `screens/F-*.png` — tokens, timings, strings and the 17 reference screens at 390×844.
- `docs/redesign/tools/render.cjs` — the Playwright pattern the capture script follows.
- `frontend/src/index.css` — shadcn tokens, Geist import, keyframes; `frontend/index.html` — `color-scheme` and two `theme-color` tags.
- `frontend/package.json`, `pnpm-lock.yaml`, `components.json` — `radix-ui`, `shadcn`, `@fontsource-variable/geist`.
- `frontend/src/components/ui/` — `button.tsx — Button()` (radix `Slot`), `progress.tsx` (radix), `card.tsx`, `input.tsx`, `skeleton.tsx`, `table.tsx`, `empty-state.tsx`.
- `frontend/src/app/layout.tsx — Layout()`, `navbar.tsx — Navbar()`, `footer.tsx — Footer()`, `messages.ts` (domain-data edits it first).
- `frontend/src/features/play/use-run.ts — useRun(), revealMs, missRevealMs` — the hook gains the latch, reveal input, retry and resume flag.
- `frontend/src/features/play/play-page.tsx — Run(), RunError()`; `countdown.tsx — Countdown(), remainingMs()`; `question-card.tsx — QuestionCard(), ItemView(), MarkBadge()`.
- `frontend/src/features/play/run-result.tsx — RunResult(), MissedQuestion(), StatTile()`; `share-button.tsx — ShareButton()`; `rule-chips.tsx — RuleChips()`.
- `frontend/src/features/play/home-page.tsx — HomePage()`, `name-form.tsx — NameForm()`, `api.ts — fetchMe()` (anonymous-player 3), `isTooFast()`, `messages.ts`.
- `frontend/src/features/challenge/challenge-page.tsx — ChallengePage(), Creator()`, `api.ts — getChallenge()`, `messages.ts`.
- `frontend/src/features/leaderboard/leaderboard-page.tsx — LeaderboardPage()`, `ranking-table.tsx — RankingTable()`, `api.ts — getLeaderboard(), entrySchema`.
- `frontend/src/lib/query-client.ts — createQueryClient()` — mutations default to `retry: false`.
- `frontend/src/test/render.tsx — renderRoute()`, `fake-api.ts — FakeApi`, `setup.ts`, `api-contract.test.ts — backend responses`.
- `frontend/src/features/play/fake-run.ts — fakeRun(), sampleQuestions`; `play.test.tsx`, `home-page.test.tsx`, `challenge-page.test.tsx`, `leaderboard-page.test.tsx`.
- `backend/internal/contract/testdata/*.json` — the goldens `api-contract.test.ts` parses; read only.
- `docs/game-rules.md` — its result paragraph names the learning card in phase 11.

## Open questions / Risks

- **Device test.** jsdom can't show implicit touch capture or screen-reader activation. The owner-run device test in phase 2 covers both.
  The release of this plan waits for its result.
- **Test rewrite (effort L).** All 22 `user.click` calls that answer, start or share stop working under arming and guards.
  The play test "switches the language without a request" clicks the header on `/play`, which phase 1 removes; it moves to `/`.
- **Playwright.** It is not a repo dependency. Phase 12 runs with Playwright resolvable, e.g. `NODE_PATH` pointing at a scratch install.
  The cached browser is chromium-1255; the Playwright version must match it.
- **Hold cost.** Arming plus a touch hold use 0.8 s of the 15 s clock.

## Phase 1: Tokens, font, Button and the layout

**Depends on**: none

### Context

- `frontend/src/index.css`, `frontend/index.html`, `frontend/package.json`, `frontend/pnpm-lock.yaml`, `frontend/components.json`.
- `frontend/src/components/ui/button.tsx — Button()`, `progress.tsx` (goes); every file under `frontend/src/features/` and `frontend/src/app/` that uses an old token class.
- `frontend/src/app/layout.tsx — Layout()`, `navbar.tsx — Navbar()`, `footer.tsx — Footer()`.
- `frontend/src/features/play/home-page.test.tsx — "links the footer to the NOTICE file"`; `play.test.tsx — "switches the language without a request"`.
- `docs/redesign/design-system.md` — Theme, Colour tokens, Typography, Layout, Motion, Forced colors.

### What to build

- **Tokens.** The colour table of design-system.md as CSS variables on `:root`, mapped to Tailwind theme colours. Radii and keyframes follow it.
  - `html` sets `color-scheme: dark`.
  - `prefers-contrast: more`, `forced-colors: active` and `prefers-reduced-motion: reduce` rules as design-system.md specifies.
- **Old tokens go.** Every component switches to the new names in this commit: `muted-foreground` → `foreground-muted`, `card` → `surface`, `primary` → `accent`, `destructive` → `danger`.
  - `success-foreground` → `success-ink`; the `ring` colour → `accent`.
- **Font.** `@fontsource-variable/baloo-2`, latin and latin-ext subsets only. A fallback `@font-face` over `system-ui` sets `size-adjust` and `ascent-override`.
  - Numbers that change use `tabular-nums`.
- **Dependencies.** Remove `radix-ui`, `shadcn`, `@fontsource-variable/geist` and `components.json`.
  - `Button` renders a `<button>` with primary and secondary variants and a guarded state: `aria-disabled`, activation ignored, same label.
  - `Countdown` draws its own `role=progressbar` with `aria-valuetext`, so `components/ui/progress.tsx` goes.
- **`index.html`.** `<meta name="color-scheme" content="dark" />` and one `theme-color` of `#12142B`.
- **Layout.** The header per route from the PRD's table: none on `/play/:runId`, no leaderboard icon on `/leaderboard`.
  - The credit line closes every route except `/play/:runId`: 13 px caption, 44 px target.
  - The play route respects the top safe-area inset.
- **Tests.**
  - `home-page.test.tsx`: "shows the credit line on every route but play" replaces "links the footer to the NOTICE file".
  - The language-switch test moves from `/play` to `/`.

### Acceptance criteria

- [x] `cd frontend && pnpm run build >/dev/null && ! grep -rqE 'fonts\.(googleapis|gstatic)\.com' dist && ls dist/assets | grep -qE '^baloo-2-latin-ext.*\.woff2$' && ! ls dist/assets | grep -qE '^baloo-2-(vietnamese|devanagari)'`
- [x] `! grep -rqE '\b(bg|text|border|ring|outline|divide)-(muted|card|primary|destructive|input|ring|success-foreground)\b' frontend/src && grep -qiE -- '--background:\s*#12142b' frontend/src/index.css && grep -qiE -- '--negation:\s*#c4a8ff' frontend/src/index.css`
- [x] `! grep -qE '"(radix-ui|shadcn|@fontsource-variable/geist)"' frontend/package.json && grep -q '"@fontsource-variable/baloo-2"' frontend/package.json && test ! -e frontend/components.json && test ! -e frontend/src/components/ui/progress.tsx`
- [x] `grep -q '<meta name="color-scheme" content="dark" />' frontend/index.html && test "$(grep -c 'name="theme-color"' frontend/index.html)" -eq 1`
- [x] `grep -q 'forced-colors: active' frontend/src/index.css && grep -q 'prefers-contrast: more' frontend/src/index.css && grep -q 'prefers-reduced-motion' frontend/src/index.css`
- [x] `cd frontend && pnpm exec vitest run src/features/play/home-page.test.tsx -t 'shows the credit line on every route but play' --reporter=verbose | grep -q '✓.*shows the credit line on every route but play'`
- [x] Final gate: `make fe-check`

## Phase 2: HoldButton and hold to answer

**Depends on**: 1

### Context

- New `frontend/src/components/ui/hold-button.tsx` — the hold hook and `HoldButton`.
- `frontend/src/features/play/question-card.tsx — QuestionCard(), ItemView()`; a new `answer-option.tsx — AnswerOption()`.
- `frontend/src/features/play/use-run.ts — useRun()` — its `answer()` closes over a stale `busy`.
- `frontend/src/features/play/play-page.tsx — Run()` (`onExpire={() => answer(null)}`); `countdown.tsx — Countdown()`.
- `frontend/src/features/play/name-form.tsx — NameForm()` — its submit button starts runs on home and the challenge page.
- `frontend/src/features/play/messages.ts`; new `frontend/src/test/answer.ts`; `frontend/src/test/setup.ts` — the `matchMedia` fake.
- `frontend/src/features/play/play.test.tsx`, `home-page.test.tsx`, `frontend/src/features/challenge/challenge-page.test.tsx` — every answering or starting click.

### What to build

- **The hold hook.** The rules of the decisions, with a ref-based phase machine.
  - It suppresses the context menu, touch callout, text selection and image drag.
  - The fill is a CSS animation; holding adds a 3 px `accent` inset ring.
  - A commit calls `navigator.vibrate(12)` where supported.
  - It hit-tests the slide-off with `getBoundingClientRect()`. jsdom has no `elementFromPoint` or `setPointerCapture`.
- **`HoldButton`.** A primary `Button` on the hook. Its label names the hold on a coarse primary pointer: `holdToStart`, else `start`.
  - `NameForm`'s submit becomes a `HoldButton`, so home and the challenge page start by hold.
  - `HoldButton` is `type="button"`, so a tap's click submits nothing. A commit calls `form.requestSubmit()`.
- **`AnswerOption`.** Text options 64 px min, flags in a 2×2 grid at 124 px min, on the hook.
  - Arming: for 400 ms after a question renders, options are `aria-disabled` at 30 % opacity and ignore activation. They stay in the tab order.
  - After the reveal the label gains ", richtige Antwort" or ", deine Antwort", as today.
  - Options point `aria-describedby` at the static `answerHow` text.
- **Commit latch in `useRun`.** Refs, not closures, decide; one answer per position passes.
  - `useRun` tracks a running hold. `answer(null)` from the expiry is dropped while it runs.
  - A hold running at 0 s commits its option.
- **Test helper.** `src/test/answer.ts — answer()` waits until arming ends, then presses Enter on the option. Every flow test uses it.
- **`matchMedia` fake.** `src/test/setup.ts` fakes it as in the decisions; the coarse-pointer label, touch hints and confetti read it.
- **Hold tests.** `play.test.tsx` gains `describe("hold to answer")`.
  - Timers: `vi.useFakeTimers({ shouldAdvanceTime: true })`. user-event and `findBy` hang under plain fake timers.
  - Events: `fireEvent.pointerDown`, `pointerMove`, `pointerUp` and `pointerCancel` with `pointerType: "touch"`.
  - The slide-off test stubs the option's `getBoundingClientRect()`.
  - The tests:
    1. "a 400 ms touch hold answers";
    2. "a touch release at 300 ms answers nothing";
    3. "a touch slide off the option answers nothing";
    4. "a touch hold started at 14.8 s answers when the clock reaches 0";
    5. "a hold and the expiry together send one answer";
    6. "a click without a preceding pointer down answers at once";
    7. "options ignore activation during arming and stay reachable by Tab";
    8. "a touch tap on the start button starts nothing".
- **Owner-run device test (not a criterion).** The lead gives the owner a build their phones can reach.
  - Devices: iOS Safari with VoiceOver, Android Chrome with TalkBack.
  - Checks: a touch hold answers; a slide off and an early release cancel; the screen reader can answer and start.
  - A lock-out adds the PRD's "one tap" setting as a new phase. Later phases don't wait: findings change the hook, not its props.
- **Copy.** `holdToStart`, `start`, `holdToAccept`, `accept`, `answerHow` in de and en.

### Acceptance criteria

- [x] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'hold to answer' --reporter=verbose | grep -c '✓.*hold to answer >' | grep -qx 8`
- [x] `grep -q 'HoldButton' frontend/src/features/play/name-form.tsx && test -e frontend/src/test/answer.ts`
- [x] Final gate: `make fe-check`

## Phase 3: Home, first visit and returning

**Depends on**: 2

### Context

- `frontend/src/features/play/home-page.tsx — HomePage()`, `name-form.tsx — NameForm()`, `rule-chips.tsx — RuleChips()` (goes).
- `frontend/src/features/play/api.ts — fetchMe()` and its `me` query (anonymous-player 3); `messages.ts`.
- `frontend/src/features/challenge/challenge-page.tsx` — drops `RuleChips`.
- `frontend/src/features/play/home-page.test.tsx`; `docs/redesign/screens.md` 01 and 02.

### What to build

- **Pending.** While `/api/me` is pending, home shows only the header and the credit line.
- **First visit.** Shown while `lastName` is null, and when `/api/me` fails.
  - One headline; the flag collage is `aria-hidden`; three numbered rules (`rule1`–`rule3`).
  - The name field: label above, 56 px, maxlength 20, `autocomplete=nickname`, the `namePublic` hint.
  - The start `HoldButton`. On touch, `holdHintStart` connects the start hold to answering.
- **Returning.** Shown when `lastName` is set.
  - `best` as the hero number under `yourRecord`. `worldRankMeta` when `worldRank` is set. No level.
  - A plain 72 px `Play` button starts a run as `lastName` with one press.
  - "als {name} · Name ändern"; `changeName` swaps the line for the name field.
  - `lastQuiz` links `/q/:lastQuizId` when set.
- **Tests** in `home-page.test.tsx`:
  - "shows the first-visit layout for an unknown player";
  - "shows the first-visit layout when /api/me fails";
  - "shows the record and world rank of a returning player";
  - "starts a returning player's run with one press" asserts the `POST /api/runs` body names `lastName`.
- **Cleanup.** The name field is built in `name-form.tsx`; `components/ui/input.tsx` goes.
- **Copy.** The Home and Shared tables of copy.md.

### Acceptance criteria

- [x] `cd frontend && pnpm exec vitest run src/features/play/home-page.test.tsx -t 'shows the first-visit layout' --reporter=verbose | grep -c '✓.*shows the first-visit layout' | grep -qx 2`
- [x] `cd frontend && pnpm exec vitest run src/features/play/home-page.test.tsx -t 'shows the record and world rank of a returning player' --reporter=verbose | grep -q '✓.*shows the record and world rank of a returning player'`
- [x] `cd frontend && pnpm exec vitest run src/features/play/home-page.test.tsx -t "starts a returning player's run with one press" --reporter=verbose | grep -q "✓.*starts a returning player's run with one press"`
- [x] `test ! -e frontend/src/features/play/rule-chips.tsx && test ! -e frontend/src/components/ui/input.tsx`
- [x] Final gate: `make fe-check`

## Phase 4: Question screen, gap pill and reveal

**Depends on**: 3

### Context

- `frontend/src/features/play/play-page.tsx — Run(), RunLoading()`; `countdown.tsx — Countdown(), remainingMs()` becomes `timer-bar.tsx — TimerBar()`.
- New `frontend/src/features/play/level-pips.tsx`, `streak-pill.tsx`, `gap-pill.tsx`, `toast.tsx`.
- `frontend/src/features/play/use-run.ts — useRun(), revealMs, missRevealMs`; `answer-option.tsx — AnswerOption()`.
- `frontend/src/features/play/fake-run.ts — fakeRun()` — gains a `/api/me` reply; `play.test.tsx`; `messages.ts`.
- `docs/prds/prd-redesign.md` — Levels and progress, Guard times; `docs/redesign/screens.md` 03–05.

### What to build

- **Loading.** `RunLoading` draws its placeholder without `Skeleton`.
- **Play header.** No site header.
  - `LevelPips`: five pips by the position in the current block of five (`position % 5`): done, current at 45 %, open outlined. A miss pip is a cross.
  - `StreakPill`: flame and score, "+1" pop on a correct answer, sr-only `streak` text. It turns `accent` past the gap target.
  - `GapPill`: the own-run rows of the PRD's gap-pill table; the count is `best + 1 − score`. A first run shows none.
- **Timer.** `TimerBar` keeps the countdown maths and `aria-valuetext`. `accent`, `warning` at ≤ 5 s, `danger` at ≤ 3 s; dimmed while paused.
- **Prompt.** A flag at 232×174 or a word at `clamp` 28–46 px, wrapping to two lines, with its `lang`.
- **Reveal delays.** `useRun` takes `revealDelay(outcome)`: 650 ms correct, 1100 ms with a toast, 1300 ms wrong or timeout.
- **Record toast.** It fires once, when the score passes the gap target. Its text goes to the persistent `role=status` region.
- **Wrong reveal.** `wrong` or `timedOut` status; the correct option with a check, the pick with a cross and a shake; `resultSoon`.
  A correct reveal shows `nextSoon`.
- **Hold hint.** On touch, `holdHint` shows for the first three questions of a first run. It reads `holding` while a press is held.
  Hint and outcomes use separate live regions.
- **Tests** in `play.test.tsx`:
  - "counts the gap pill to the record from /api/me";
  - "shows no gap pill on a first run";
  - "toasts a new record when the score passes the best";
  - "holds the reveal 650 ms after a correct answer and 1300 ms after a wrong one";
  - "fills the pips by the position in the block of five".
- **Copy.** The Play table of copy.md, without `level`, `levelPosition`, `toastLevel`, `resumed`, `offline`, `offlineRetry`, `offlineClock` and `sending`.

### Acceptance criteria

- [x] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'counts the gap pill to the record from /api/me' --reporter=verbose | grep -q '✓.*counts the gap pill to the record from /api/me'`
- [x] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'shows no gap pill on a first run' --reporter=verbose | grep -q '✓.*shows no gap pill on a first run'`
- [x] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'toasts a new record when the score passes the best' --reporter=verbose | grep -q '✓.*toasts a new record when the score passes the best'`
- [x] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'holds the reveal 650 ms after a correct answer and 1300 ms after a wrong one' --reporter=verbose | grep -q '✓.*holds the reveal 650 ms'`
- [x] `test ! -e frontend/src/features/play/countdown.tsx`
- [x] Final gate: `make fe-check`

## Phase 5: Result screens and the run strip

**Depends on**: 4

### Context

- `frontend/src/features/play/run-result.tsx — RunResult(), MissedQuestion(), StatTile()`.
- New `frontend/src/features/play/result-head.ts — selectHead()` and `result-head.test.ts`; new `run-strip.tsx — RunStrip()`.
- `frontend/src/features/play/api.ts` — `best` on the result (anonymous-player 3); `fake-run.ts — fakeRun()`; `play.test.tsx`; `messages.ts`.
- `docs/prds/prd-redesign.md` — Result screens; `docs/redesign/screens.md` 06, 07, 16.

### What to build

- **`selectHead()`.** A pure function of end reason, score, `best` and the creator (score, own, or null). It returns the PRD table's first matching row:
  head key, subline key, sections in order, primary and secondary action.
  - `gap` is `best.previous + 1 − score`. Near means `gap ≤ 3` or `gap ≤ 0.15 × best.previous`.
  - A score of 0 has no share action.
  - All ten rows are selectable now. Phase 7 passes the creator; until then it is null.
- **`RunResult`.** Renders rows 1 and 5–10.
  - The score hero, the subline, and `recordBadge` or `recordBadgeFirst` where the table says.
  - `scoreLine` names "Platz {rank} weltweit" when `best.isNew`, else `scoreBestRank`. Only creator runs (`globalRank` set) name a world rank.
  - `recordLine` reads "vorher {old}" from `best.previous`; a first run has no "vorher".
  - The gap bar (`gapToRecord`) on rows 7 and 8. Confetti on a record, off under reduced motion.
  - A completed run shows one gold square per point of `score`.
  - Focus moves to the head.
- **`RunStrip`.** 14 px squares in blocks of five, two blocks per row; a miss carries a cross, a timeout a clock.
  More than 10 answers show "×{k}" and the last two blocks. `role=img` with `runStripWrong`, `runStripTimeout` or `runStripCompleted`.
- **Action bar.** Sticky at the bottom with the safe-area inset; the sections scroll above it.
  - Result guard: for 1000 ms both buttons are `aria-disabled`, fade in and keep their labels.
  - Share actions keep today's share behaviour until phase 6.
- **Learning-card slot.** It keeps `MissedQuestion` until phase 11. `StatTile` and the `Card` import go.
- **Tests.**
  - `result-head.test.ts`: `it.each` over the ten rows, named "row N selects <head>".
  - `result-head.test.ts`: "counts a gap of 3 or of 15 % of the best as near" with literals at both edges.
  - `play.test.tsx`: "ignores result buttons for 1000 ms and keeps their labels".
  - `play.test.tsx`: "shows the record head with the previous best".
  - `play.test.tsx`: "shows the gap bar after a near miss".
- **Copy.** The Result table of copy.md, `scoreLine` and `recordLine` without their level segment.

### Acceptance criteria

- [x] `cd frontend && pnpm exec vitest run src/features/play/result-head.test.ts -t 'selects' --reporter=verbose | grep -cE '✓.*row [0-9]+ selects' | grep -qx 10`
- [x] `cd frontend && pnpm exec vitest run src/features/play/result-head.test.ts -t 'counts a gap of 3 or of 15 % of the best as near' --reporter=verbose | grep -q '✓.*counts a gap of 3 or of 15 % of the best as near'`
- [x] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'ignores result buttons for 1000 ms and keeps their labels' --reporter=verbose | grep -q '✓.*ignores result buttons for 1000 ms and keeps their labels'`
- [x] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'shows the record head with the previous best' --reporter=verbose | grep -q '✓.*shows the record head with the previous best'`
- [x] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'shows the gap bar after a near miss' --reporter=verbose | grep -q '✓.*shows the gap bar after a near miss'`
- [x] Final gate: `make fe-check`

## Phase 6: Share sheet and share text

**Depends on**: 5

### Context

- `frontend/src/features/play/share-button.tsx — ShareButton()` (goes); new `share-sheet.tsx`, `share-text.ts — buildShareText()`, `share-text.test.ts`.
- New `frontend/src/components/ui/sheet.tsx — Sheet()`; `frontend/src/test/setup.ts` — the dialog fake.
- `frontend/src/features/play/run-result.tsx — RunResult()`; `play.test.tsx` — "shares the challenge link through the share sheet", "copies the challenge link without a share sheet".
- `docs/prds/prd-redesign.md` — Sharing; `docs/redesign/screens.md` 08.

### What to build

- **`Sheet`.** As in the decisions: bottom-aligned, 28 px top radius, grab handle, 44 px close button, `::backdrop` dimmed.
- **Share sheet.** `sheetTitle`, `sheetBody`, a preview of the static `/og.png` with `previewCaption`, then the share text.
  - `navigator.share` where the browser has it (`shareNative`).
  - The copy button always shows, confirmed by `copied`; it is the primary action without a system share sheet.
- **`buildShareText()`.** Score, run strip, challenge line and `/q/<quizId>`. It takes no question, option or country.
  - 🟩 correct, 🟥 wrong, ⏱️ timeout; blocks of five split by a space, two blocks per line.
  - More than 10 answers: line one "🟩 ×{k}", line two the last two blocks.
  - The level segment arrives in phase 10.
- **Tests.**
  - `share-text.test.ts`: "builds the strip of a 23-answer run with the × line". 22 correct then a wrong answer give `🟩 ×15\n🟩🟩🟩🟩🟩 🟩🟩🟥`.
  - `share-text.test.ts`: "marks a timeout with a clock".
  - `play.test.tsx`: "closes the share sheet on Escape and returns focus to its trigger".
  - `play.test.tsx`: "copies text and link without a system share sheet" replaces "copies the challenge link without a share sheet".
- **Copy.** The Share table of copy.md, `shareText` without its level segment.

### Acceptance criteria

- [x] `cd frontend && pnpm exec vitest run src/features/play/share-text.test.ts -t 'builds the strip of a 23-answer run with the × line' --reporter=verbose | grep -q '✓.*builds the strip of a 23-answer run'`
- [x] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'closes the share sheet on Escape and returns focus to its trigger' --reporter=verbose | grep -q '✓.*closes the share sheet on Escape and returns focus to its trigger'`
- [x] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'copies text and link without a system share sheet' --reporter=verbose | grep -q '✓.*copies text and link without a system share sheet'`
- [x] `test ! -e frontend/src/features/play/share-button.tsx && grep -q 'showModal' frontend/src/components/ui/sheet.tsx`
- [x] Final gate: `make fe-check`

## Phase 7: Challenge page and challenge runs

**Depends on**: 6

### Context

- `frontend/src/features/challenge/challenge-page.tsx — ChallengePage(), Creator()` — drops `Card` and `Skeleton`; `api.ts — getChallenge()`, `messages.ts`, `challenge-page.test.tsx`.
- New `frontend/src/features/challenge/head-to-head.tsx`; new `frontend/src/features/leaderboard/rank-row.tsx — RankRow()`.
- `frontend/src/features/play/play-page.tsx — Run()`, `gap-pill.tsx`, `run-result.tsx — RunResult()`, `result-head.ts — selectHead()`, `share-text.ts`, `fake-run.ts`, `play.test.tsx`.
- `frontend/src/lib/i18n/` — a genitive helper and `locale.test.ts`.
- `docs/prds/prd-redesign.md` — Challenge page, Result screens rows 2–4; `docs/redesign/screens.md` 10–12.

### What to build

- **Challenge page states** from the PRD's table:
  - Waiting: `waitingTitle`, `waitingBody`, the name field, the accept `aria-disabled` with `waitingButton`, and `waitingOwnGame`.
    It polls every 5 s, as today. On unlock, a `role=status` region says `unlocked`.
  - Playable: `challengedBy`, `target` with score + 1, the quiz board in `RankRow`s with an empty "Du" slot, and the accept `HoldButton`.
  - Creator hidden: as playable, without the head.
  - Own quiz: `ownQuizTitle`, `ownQuizBody`, the board and a plain Play button.
  - A known `lastName` shows "als {name} · Name ändern" instead of the field.
- **Challenge runs.** The play screen reads the challenge as in the decisions.
  - The gap pill counts to the creator: `creatorIn`, `creatorTied`, `creatorBeaten`. `toastCreator` fires when the score passes the creator.
  - `RunResult` passes the creator to `selectHead()`, so rows 2–4 render.
  - Rows 2 and 3 show head-to-head bars (sr `headToHead`); rows 2–4 show `quizRankLine` and `challengeNote`.
  - `tellCreator` opens the share sheet with `shareTextWon`. `ownGameWorld` starts a fresh own run under the same name.
- **Genitive.** One helper writes "Jonas'" for names ending in s, ß, x or z, else "Nicos". German only.
- **Tests.**
  - `challenge-page.test.tsx`: "opens the quiz when the creator run ends", which asserts the status text.
  - `challenge-page.test.tsx`: "shows a hidden creator's quiz without a head".
  - `challenge-page.test.tsx`: "shows the own quiz with a plain play button".
  - `play.test.tsx`: "counts the gap pill to the creator in a challenge run".
  - `play.test.tsx`: "shows head-to-head after a won challenge".
  - `locale.test.ts`: "writes the genitive of a name ending in s with an apostrophe".
- **Copy.** The Challenge table of copy.md and `shareTextWon`.

### Acceptance criteria

- [x] `cd frontend && pnpm exec vitest run src/features/challenge/challenge-page.test.tsx -t 'opens the quiz when the creator run ends' --reporter=verbose | grep -q '✓.*opens the quiz when the creator run ends'`
- [x] `cd frontend && pnpm exec vitest run src/features/challenge/challenge-page.test.tsx -t 'shows the own quiz with a plain play button' --reporter=verbose | grep -q '✓.*shows the own quiz with a plain play button'`
- [x] `cd frontend && pnpm exec vitest run src/features/challenge/challenge-page.test.tsx -t "shows a hidden creator's quiz without a head" --reporter=verbose | grep -q "✓.*shows a hidden creator's quiz without a head"`
- [x] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'counts the gap pill to the creator in a challenge run' --reporter=verbose | grep -q '✓.*counts the gap pill to the creator in a challenge run'`
- [x] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'shows head-to-head after a won challenge' --reporter=verbose | grep -q '✓.*shows head-to-head after a won challenge'`
- [x] `cd frontend && pnpm exec vitest run src/lib/i18n/locale.test.ts -t 'writes the genitive of a name ending in s with an apostrophe' --reporter=verbose | grep -q '✓.*writes the genitive'`
- [x] Final gate: `make fe-check`

## Phase 8: Leaderboard tabs, podium and the pinned row

**Depends on**: 7

### Context

- `frontend/src/features/leaderboard/leaderboard-page.tsx — LeaderboardPage()`, `ranking-table.tsx — RankingTable()` (goes), `rank-row.tsx — RankRow()`, `api.ts`, `messages.ts`, `leaderboard-page.test.tsx`.
- New `frontend/src/components/ui/tabs.tsx — Tabs()`; `frontend/src/components/ui/table.tsx` (goes).
- `frontend/src/features/play/api.ts — fetchMe(), startRun()`; `frontend/src/features/challenge/api.ts — getChallenge()`.
- `docs/prds/prd-redesign.md` — Leaderboard; `docs/redesign/screens.md` 13.

### What to build

- **`Tabs`.** A 44 px segmented control: `role=tablist`, `tab`, `tabpanel`, `aria-selected`, roving tabindex with arrow keys.
  The selected tab has a 3 px `accent` underline.
- **Cleanup.** `card.tsx`, `skeleton.tsx` and `table.tsx` leave `components/ui/` with their last users.
- **Tabs on the page.** `tabWorld` with `subWorld`; `tabLastQuiz` for `lastQuizId`, absent while it is null.
  The quiz tab's sub line is `subLastQuiz` with the creator's genitive, or `subOwnQuiz` when `creator.own`.
  A hidden creator (`creator` null) leaves the tab without a sub line.
- **`Podium`.** Ranks 1–3 in 2-1-3 order at 92/128/72 px, medal colours with their inks, real text.
- **Rows.** 50 px `RankRow`s in an `<ol>`; the own row has `surface-2`, `youSuffix` and `aria-current="true"`.
- **Pinned row.** On the world tab, when no listed row is own and `worldRank` is set: `worldRank`, `pinnedYou`, `worldBest`, and a Play button.
  The quiz tab only highlights in place.
- **Tests** in `leaderboard-page.test.tsx`:
  - "pins the own row from /api/me when it is outside the list";
  - "shows the latest quiz in its own tab";
  - "moves between tabs with the arrow keys".
- **Copy.** The Leaderboard table of copy.md.

### Acceptance criteria

- [x] `cd frontend && pnpm exec vitest run src/features/leaderboard/leaderboard-page.test.tsx -t 'pins the own row from /api/me when it is outside the list' --reporter=verbose | grep -q '✓.*pins the own row from /api/me'`
- [x] `cd frontend && pnpm exec vitest run src/features/leaderboard/leaderboard-page.test.tsx -t 'shows the latest quiz in its own tab' --reporter=verbose | grep -q '✓.*shows the latest quiz in its own tab'`
- [x] `cd frontend && pnpm exec vitest run src/features/leaderboard/leaderboard-page.test.tsx -t 'moves between tabs with the arrow keys' --reporter=verbose | grep -q '✓.*moves between tabs with the arrow keys'`
- [x] `test ! -e frontend/src/features/leaderboard/ranking-table.tsx && ! ls frontend/src/components/ui | grep -qE '^(card|skeleton|table)\.tsx$'`
- [x] Final gate: `make fe-check`

## Phase 9: Resume banner and offline retry

**Depends on**: 8

### Context

- `frontend/src/features/play/use-run.ts — useRun()`; `play-page.tsx — Run(), RunError()`; `answer-option.tsx`; `messages.ts`; `play.test.tsx` — "resumes with the served question and its running deadline".
- New `frontend/src/components/ui/banner.tsx — Banner()`.
- `frontend/src/test/fake-api.ts — FakeApi`; `frontend/src/features/play/fake-run.ts — fakeRun()` (`remainingMs`).
- `docs/prds/prd-redesign.md` — Frontend changes below the UI, Edge cases; `docs/redesign/screens.md` 14, 15.

### What to build

- **`Banner`.** An inline row with an icon and one action: warning with `role=status`, danger with `role=alert`.
- **Resume.** `useRun` sets a resume flag when the first data fetched after mount has `deadline − serverNow < limitMs`.
  The banner shows `resumed` with the seconds left, in its singular and plural forms.
- **Offline retry.** The answer mutation uses `networkMode: 'always'` and keeps `retry: false`.
  - Its `mutationFn` runs the backoff loop: network errors retry until the deadline plus the 2 s grace.
  - Each backoff wait ends early on `retryNow()`, so no second request runs beside the loop.
  - `isRetrying` and `retryNow()` feed a danger banner: `offline`, `offlineRetry`, `offlineClock`.
  - The pick stays marked with a spinner and sr `sending`; options stay `aria-disabled`.
  - The UI shows a miss only when the server says so.
- **Lost response.** The server answers a retried, already-resolved position with 200 and the stored outcome. A 409 `not_current_question` comes only for a position the server never served: the hook refetches and shows that state.
- **Test plumbing.** `FakeApi` can reject a route's next fetches. Tests trigger the retry with the `offlineRetry` button.
- **Tests** in `play.test.tsx`:
  - "shows the resume banner on a reload mid-question";
  - "keeps the pick and retries after a network error";
  - "shows the stored outcome after a lost response": the first POST rejects as a network error and the retry gets the stored outcome.
  - "refetches without an alert after a 409 for a position the server never served".
    The next question shows and no alert renders.

### Acceptance criteria

- [x] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'shows the resume banner on a reload mid-question' --reporter=verbose | grep -q '✓.*shows the resume banner on a reload mid-question'`
- [x] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'keeps the pick and retries after a network error' --reporter=verbose | grep -q '✓.*keeps the pick and retries after a network error'`
- [x] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'shows the stored outcome after a lost response' --reporter=verbose | grep -q '✓.*shows the stored outcome after a lost response'`
- [x] Final gate: `make fe-check`

## Phase 10: Levels from the server

**Depends on**: 9

### Context

- Starts after the lead's rebase onto domain-engine (see the decisions). `jq -e '.question.level' backend/internal/contract/testdata/run-playing.json` passes then.
- `frontend/src/features/play/api.ts` — the question and result schemas carry `level` (quiz-domain-now 5).
- `frontend/src/features/play/level-pips.tsx`, `play-page.tsx — Run()`, `toast.tsx`, `run-result.tsx`, `share-text.ts — buildShareText()`, `share-text.test.ts`.
- `frontend/src/features/play/fake-run.ts — fakeRun(), sampleQuestions` — each question gets an explicit `level`, e.g. 1, 2, 2; `play.test.tsx`; `messages.ts`.

### What to build

- **Level label.** "Level {n} · {rank}" above the pips, from the question's `level` and copy.md's rank names.
  It adds sr-only `levelPosition` ("Frage {k} von 5"). The client never computes the level.
- **Level toast.** `toastLevel` fires when a question's level is above the previous question's.
  A toasted reveal holds 1100 ms.
- **Level segments.** `scoreLine`, `recordLine` and `shareText` gain "Level {level}" from `result.level`, as in copy.md.
- **Tests.**
  - `play.test.tsx`: "labels the level with its rank name from the server".
  - `play.test.tsx`: "toasts a level up only when the level rises", over levels 1, 2, 2.
  - `share-text.test.ts`: the 23-answer case gains its level line.
- **Copy.** `level`, `levelPosition`, `toastLevel` and the ten rank names in de and en.

### Acceptance criteria

- [ ] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'labels the level with its rank name from the server' --reporter=verbose | grep -q '✓.*labels the level with its rank name from the server'`
- [ ] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'toasts a level up only when the level rises' --reporter=verbose | grep -q '✓.*toasts a level up only when the level rises'`
- [ ] `grep -q 'Legende' frontend/src/features/play/messages.ts && grep -q 'Cartographer' frontend/src/features/play/messages.ts`
- [ ] Final gate: `make fe-check`

## Phase 11: Learning card

**Depends on**: 10

### Context

- `jq -e '.result.fact' backend/internal/contract/testdata/run-finished.json` passes on the lane's base.
- `frontend/src/features/play/api.ts` — the result schema carries `fact` (quiz-domain-now 7); `isTooFast()`.
- New `frontend/src/features/play/learning-card.tsx — LearningCard()`, `learning-sentence.ts — learningSentence()`, `learning-sentence.test.ts`.
- `frontend/src/features/play/run-result.tsx — RunResult(), MissedQuestion()` (goes); `fake-run.ts`; `play.test.tsx`; `messages.ts`.
- `docs/redesign/copy.md` — Learning card, Learning sentences; `docs/game-rules.md` — the result paragraph.

### What to build

- **`learningSentence()`.** A pure function over the type id, `fact`, the options and the end, per copy.md's rules.
  - The pick sentence applies when the pick is wrong and `chosenCountry` is set; else the target sentence.
  - A timeout prefixes `learnTimeout`; a too-fast pick prefixes `learnTooFast`.
  - Its table is a `Record<QuestionType, …>`, so the compiler demands a row per type id.
  - `{spokenIn}` joins with `Intl.ListFormat`. No article ever precedes a country name.
- **`LearningCard`.** A `<section aria-labelledby>` with `learnTitle`:
  - the correct option beside the pick: flags at 112×84 with country captions, else 44 px chips;
  - a too-fast pick shows the correct option only;
  - one sentence;
  - a `<dl>` fact row: name and flag, capital, continent, languages and currencies, singular or plural.
  - Foreign words carry their `lang`; flags are `role=img` with the country name.
- **Placement.** Exactly one per run, on every row that lists it, won and tied challenges included. A completed run has none.
- **Docs.** `docs/game-rules.md`: the result paragraph names the learning card.
- **Tests.**
  - `learning-sentence.test.ts`: "uses the pick sentence when one country holds the pick", with a literal for `name_currency`.
  - `learning-sentence.test.ts`: "prefixes the timeout to the target sentence".
  - `play.test.tsx`: "shows the learning card with the correct option, the pick and the sentence".
  - `play.test.tsx`: "shows only the correct option after a too-fast pick".
  - `play.test.tsx`: "shows no learning card on a completed run".

### Acceptance criteria

- [ ] `cd frontend && pnpm exec vitest run src/features/play/learning-sentence.test.ts -t 'uses the pick sentence when one country holds the pick' --reporter=verbose | grep -q '✓.*uses the pick sentence when one country holds the pick'`
- [ ] `cd frontend && pnpm exec vitest run src/features/play/learning-sentence.test.ts -t 'prefixes the timeout to the target sentence' --reporter=verbose | grep -q '✓.*prefixes the timeout to the target sentence'`
- [ ] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'shows the learning card with the correct option, the pick and the sentence' --reporter=verbose | grep -q '✓.*shows the learning card with the correct option'`
- [ ] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'shows only the correct option after a too-fast pick' --reporter=verbose | grep -q '✓.*shows only the correct option after a too-fast pick'`
- [ ] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'shows no learning card on a completed run' --reporter=verbose | grep -q '✓.*shows no learning card on a completed run'`
- [ ] `grep -qi 'learning card' docs/game-rules.md && ! grep -q 'MissedQuestion' frontend/src/features/play/run-result.tsx`
- [ ] Final gate: `make fe-check`

## Phase 12: Visual comparison at 390×844

**Depends on**: 8, 11

### Context

- Precondition: `node -e 'require("playwright")'` passes (see Open questions).
- `docs/redesign/screens/F-*.png` — 17 reference screens, rendered at 390×844 and 2×. `F-LinkPreview` belongs to prd-challenge-preview.md.
- `docs/redesign/tools/render.cjs` — the serve-and-screenshot pattern; new `docs/redesign/tools/capture-app.cjs`.
- `docs/redesign/screens.md` — per-screen notes on where the PRD wins over an image.
- `backend/internal/contract/testdata/*.json` — the base of the mocked responses.

### What to build

- **`capture-app.cjs`.** It serves `frontend/dist` with the SPA fallback and mocks `/api/**` per state with `page.route`.
  - Usage: `node docs/redesign/tools/capture-app.cjs --out <dir> [--viewports 390x844,…]`.
  - Each state sets its responses and drives the UI: Enter on an option, opening the sheet, aborting the answer route.
  - The mocks copy each screen's sample data: names, scores, ranks.
  - At 390×844 and 2× it writes `<dir>/F-<screen>.png` for the 16 app screens.
  - At any viewport it fails when a page scrolls horizontally.
- **Comparison.** Each app screen is viewed beside its reference. The result is the diff report `/tmp/wtf-redesign-compare/report.md`.
  - One table: `| Screen | Difference | Source that wins | Verdict |`. The Screen cell holds the file basename, e.g. `F-Home`.
  - Every one of the 17 screen ids has at least one row; a clean screen has the row "none".
  - `F-LinkPreview` has no capture; its row is `accepted`.
  - Verdicts: `fixed`, `accepted` or `open`.
  - `accepted` cites its reason: a follow-up feature, sample data, or a PRD or screens.md note that wins.
  - Each real defect gets its own fix commit, then a recapture; its row reads `fixed`.
- **Small screens.** The same capture at 320×568 and 667×375 checks overflow. 200 % zoom of a 640 px window equals the 320 px pass.

### Acceptance criteria

- [ ] `(cd frontend && pnpm run build >/dev/null) && node docs/redesign/tools/capture-app.cjs --out /tmp/wtf-redesign-compare/app && test "$(ls /tmp/wtf-redesign-compare/app/F-*.png | wc -l)" -eq 16`
- [ ] `node docs/redesign/tools/capture-app.cjs --out /tmp/wtf-redesign-compare/small --viewports 320x568,667x375`
- [ ] `ls docs/redesign/screens/F-*.png | xargs -n1 basename | sed 's/\.png$//' | while read -r s; do grep -q "^| $s |" /tmp/wtf-redesign-compare/report.md || echo "$s"; done | (! grep -q .)`
- [ ] `test -s /tmp/wtf-redesign-compare/report.md && ! grep -qE '\| open \|$' /tmp/wtf-redesign-compare/report.md`
- [ ] Final gate: `make check && make e2e`
