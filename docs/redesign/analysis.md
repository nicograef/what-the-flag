# Analysis: why and how the UI was redesigned

This file holds four parts: the review of the old UI, the principles behind the redesign, the variants explored, and the mechanics review.
The resulting requirements are in [prd-redesign.md](../prds/prd-redesign.md); the visual rules in [design-system.md](design-system.md).

## 1. Status quo review

Reviewed from the source in `frontend/src`. Every screen sits in one `max-w-md` column under a sticky navbar.

| Screen | Route | Components | What it did |
| --- | --- | --- | --- |
| Home | `/` | `HomePage`, `RuleChips`, `NameForm` | Logo, title, tagline, three rule chips, name field, start button |
| Play | `/play/:runId` | `PlayPage`, `Countdown`, `QuestionCard` | Question pill, score pill, progress bar, question, prompt, four options |
| Reveal | `/play/:runId` | `QuestionCard` marks | Status pill over the prompt, correct and chosen options marked |
| Result | `/play/:runId` | `RunResult`, `ShareButton` | Score, new-best pill, end reason, three stat tiles, missed question, two ranking links, Share and Play again |
| Challenge | `/q/:quizId` | `ChallengePage`, `RankingTable` | Creator and score or "still playing", rule chips, name form, quiz ranking |
| Leaderboard | `/leaderboard` | `LeaderboardPage`, `RankingTable` | Title, intro, table with medals and own row |
| Not found | `*` | `NotFoundPage` | Message and home link |

Findings, worst first:

1. **Mistaps carry over.** Options take taps the moment a question renders. A tap meant for the previous question lands on the next one, and the server counts any answer within 300 ms as wrong.
2. **Mistaps restart.** On the result screen, Share and Play again sit in the bottom band where the options just were. A late tap starts a new run.
3. **Too many layers while playing.** Navbar, question pill, score pill, timer, card and badges compete with the one thing that matters: the question.
4. **Nothing to chase.** "Punkte: 7" says nothing about progress. The difficulty tiers already make natural steps of five questions, but the player never sees them. The personal best shows only after the run.
5. **A flat ending.** The result leads with stat tiles. The emotional peak (new record, near miss) is a small pill, and the missed question is a list of two rows.
6. **Friction before fun.** Returning players see the name form again. The challenge page puts the rule chips and the form above the ranking that shows what to beat.
7. **Sharing is generic.** One static link preview for every quiz, a plain share text, and no way back to the challenger after winning.

## 2. Principles applied

These come from established UX and behavioural-science literature; no new studies were run.

| Principle | Source | Applied as |
| --- | --- | --- |
| Fitts's law | Fitts 1954 | Answers are the largest targets on screen (64 px tall, full width; flags 124 px) and sit in the thumb zone |
| Thumb zone | Hoober 2013, phone grip studies | Every primary action is in the bottom third; nothing that ends a run is at the top |
| Hick–Hyman law | Hick 1952, Hyman 1953 | One primary action per screen; secondary ones are visibly weaker |
| Target size | WCAG 2.2, 2.5.5 (AAA, 44 px) and 2.5.8 | Every control at least 44 px; 12 px between answers |
| Error prevention | Norman, *The Design of Everyday Things*; Nielsen heuristic 5 | Hold to answer, arming delays, result buttons arm after 1 s |
| Goal gradient | Hull 1932; Kivetz, Urminsky & Zheng 2006 | Levels of five questions with pips; "Rekord in N" while playing |
| Near-miss effect | Reid 1986; Clark et al. 2009 | "So knapp!" and "Noch 2 bis zum neuen Rekord" lead the result when the gap is small |
| Peak–end rule | Kahneman et al. 1993 | The record moment gets its own celebration during the run; the result ends on learning and one clear next step |
| Competence need | Deci & Ryan, self-determination theory | Every miss teaches one thing; ten rank names mark the player's progress |
| Testing effect | Roediger & Karpicke 2006 | The learning card shows the correct answer right after the failed recall, which is when it sticks best |
| Social comparison | Festinger 1954 | Challenge links show the exact score to beat and an empty slot for the player |
| Reciprocity | Cialdini | After beating a challenger, the next action is to tell them |

Ethical line: the game should be hard to put down because it is fair and quick, not because it manipulates.
No lives, no paid continues, no guilt streaks, no notifications, no fake scarcity.

## 3. Variants explored

Three directions were designed as full flows. Their screens are in `screens/explorations/`.

| Variant | Look | Answering | Strength | Weakness |
| --- | --- | --- | --- | --- |
| A · Arcade | Dark navy, gold, chunky 3D buttons, streak flame | Instant tap, stacked full-width buttons | Most game-like; levels, near miss and arming built in | Instant tap still allows mistaps |
| B · Atlas | Light, calm, ring timer | Instant tap, simple list | Lowest visual load | Feels like a form, not a game |
| C · Thumb | Coloured top half, 2×2 tiles below | Hold a tile 0.4 s | Mistaps nearly impossible; the hold adds suspense | Big tiles waste space for long text options |

**Decision:** A as the base (look, levels, mechanics), with C's hold to answer. The result is "A+", the design in `screens/`.

Why hold beats tap-and-confirm or a confirm button:

- it keeps one gesture per answer;
- no touch answer can arrive within 300 ms, which removes the "too fast" end in practice;
- it costs a touch player 0.8 s of the 15 s clock: 0.4 s arming plus the 0.4 s hold.

Mouse and keyboard answers skip the hold, because they don't suffer thumb slips.

## 4. Game mechanics review

### Addictiveness (meant as "one more run", fairly)

| Mechanic | Before | After |
| --- | --- | --- |
| Run length | 1 to 3 minutes; good | Unchanged |
| Restart | One tap; risk of a mistaken restart | One tap, armed after 1 s |
| Visible progress | Score only | Levels with pips, streak flame, live gap to the record |
| Peak moments | New-best pill after the run | Live record toast and confetti; level-up toast |
| Misses | Missed question as two rows | One learning card; a did-you-know fact as a follow-up ([prd-did-you-know.md](../prds/prd-did-you-know.md)) |
| Reason to return tomorrow | None | Daily quiz ([prd-daily-quiz.md](../prds/prd-daily-quiz.md)) |

### Virality

The challenge link (the same quiz for everyone) is the growth engine. Its loop: play → share → a friend plays the same quiz → the friend beats you → you play again.
Three weak links:

1. **The preview is static.** Every shared link shows the same image, so it reads like an ad, not a challenge. Fix: a link preview image per quiz with the creator's name and score ([prd-challenge-preview.md](../prds/prd-challenge-preview.md)).
2. **The loop stops at the winner.** A friend who beats you has no next step. Fix: "Nico Bescheid geben" shares the same quiz link with the new score.
3. **Challenge runs go nowhere globally.** Challengers don't count on the global leaderboard. Fix: say so and offer "Eigenes Spiel für die Weltrangliste", which starts a new quiz and so a new share.

### Shareability

- Share text gets a spoiler-free emoji run strip (🟩 per correct answer in blocks of five, 🟥 for the miss). It reads well in group chats and shows level progress at a glance.
- Share leads at peaks (record, challenge won, all done); Play again leads after a near miss.
- A share sheet previews exactly what friends get, so sharing feels safe.

## 5. Risks

| Risk | Mitigation |
| --- | --- |
| Hold feels slow to fast players | 400 ms is short; mouse and keyboard answer at once; domain phase 8 measures response time per type and level after release |
| Players don't discover the hold | The home start button teaches it; a hint line shows for the first three questions of a first run; a tap shows "Festhalten …" |
| Dark-only theme | Contrast checked for every pair; a light theme stays possible through tokens |
| Wrong facts in "Wusstest du?" | Facts in own words, a source URL per fact and a review step ([prd-did-you-know.md](../prds/prd-did-you-know.md)) |
| Self-hosted font adds weight | One variable family; latin-ext loads only when a page needs it; check the size in the build output |
