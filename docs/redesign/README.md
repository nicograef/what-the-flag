# Redesign handoff

Everything needed to implement the What The Flag UI/UX redesign ("A+"), self-contained in this folder.
Start here, then read the PRD.

## Reading order

| # | File | Answers |
| --- | --- | --- |
| 1 | [../prds/prd-redesign.md](../prds/prd-redesign.md) | What to build, the decisions behind it, how to test it, what is out of scope |
| 2 | [screens.md](screens.md) | Every screen with annotated screenshots and numbered specs |
| 3 | [design-system.md](design-system.md) | Tokens, type, components, timings, motion, accessibility |
| 4 | [copy.md](copy.md) | Every string in German and English |
| 5 | [analysis.md](analysis.md) | Why: review of the old UI, UX principles, variants, mechanics review |
| 6 | Follow-up PRDs | [prd-daily-quiz.md](../prds/prd-daily-quiz.md), [prd-challenge-preview.md](../prds/prd-challenge-preview.md), [prd-did-you-know.md](../prds/prd-did-you-know.md) |

## What's in the folder

| Path | Holds |
| --- | --- |
| `screens/*.png` | Clean screenshots of the 17 final screens, 2× |
| `screens/annotated/*.png` | The same screens with numbered callouts and notes |
| `screens/explorations/*.png` | The 14 screens of the three explored variants |
| `prototypes/*.dc.html` | Source of every final screen; the question and leaderboard screens are interactive, and links between screens work |
| `prototypes/explorations/` | Source of the explored variants |
| `tools/preview.html`, `tools/runtime.js` | A small runtime that renders the prototypes in any browser |
| `tools/annotations.json` | The callouts drawn into the annotated images; `screens.md` and the PRD win where they differ |
| `tools/render.cjs` | Re-renders all screenshots |

The prototypes were authored on a design canvas whose format is HTML plus `{{holes}}`, `<sc-if>`, `<sc-for>` and a `class Component extends DCLogic` script. `tools/runtime.js` implements just enough of it to render them here.
They are a visual and behavioural reference, not code to copy: rebuild them as React components in the existing app.

## View the prototypes

```bash
python3 -m http.server 8123 --directory docs/redesign
```

Then open `http://localhost:8123/tools/preview.html`. Add `&annotate=1` to a screen URL to see its callouts.
`F-Question` is playable: hold an answer for 0.4 s, Enter answers at once, and the run passes the record after three correct answers.
The prototype holds for every pointer; the app holds only for touch and pen.

## Re-render the screenshots

```bash
node docs/redesign/tools/render.cjs
```

It needs Playwright with Chromium, and network access to Google Fonts for Baloo 2. Pass `--pdf <file>` to also write one PDF of all annotated screens.

## Implementing it

[plan-redesign.md](../plans/plan-redesign.md) implements the PRD. It runs as the `redesign` lane of [programme.md](../plans/programme.md).

Rules from `AGENTS.md` that the redesign touches most:

- UI strings live only in a feature's `messages.ts` built with `defineMessages`, German and English. `copy.md` lists them.
- Components reach the server only through feature API functions over `ApiClient`. Feature tests fake the server only via `FakeApi` and `renderRoute()`.
- Code lives in `features/<name>/`, file names kebab-case.
- Data comes from the approved plans, as the PRD's [data sources](../prds/prd-redesign.md#data-sources) list. The browser stores only the locale.
- The edge CSP allows only same-origin fonts and styles (D12): self-host Baloo 2, never link Google Fonts, and build the sheet on a native `<dialog>`.

Where the new pieces go:

| Piece | Place |
| --- | --- |
| Tokens and font | `frontend/src/index.css`, `@fontsource-variable/baloo-2` in `frontend/package.json` |
| `color-scheme: dark` and one `theme-color` | `frontend/index.html` |
| `Button`, `HoldButton`, `Sheet`, `Tabs`, `Banner` | `frontend/src/components/ui/` |
| `AnswerOption`, `LevelPips`, `StreakPill`, `GapPill`, `TimerBar`, `Toast`, `RunStrip`, `LearningCard` | `frontend/src/features/play/` |
| Reveal timings, commit latch, answer retry, resume flag | `frontend/src/features/play/use-run.ts` |
| Share sheet and share text | `frontend/src/features/play/` (replaces `share-button.tsx`) |
| Challenge states and head-to-head | `frontend/src/features/challenge/` |
| `Podium`, `RankRow`, leaderboard tabs | `frontend/src/features/leaderboard/` |
| Header per route, credit line, no header while playing | `frontend/src/app/layout.tsx` |

`NotPill` lands with the question-kinds plan; `DidYouKnowCard` with [prd-did-you-know.md](../prds/prd-did-you-know.md).

## Status

- Design: final for v1 (A+). The PRD, `screens.md`, `design-system.md` and `copy.md` are the spec.
- Where a screenshot differs from them, they win. `screens.md` lists the differences per screen.
- Sample data: names, scores and ranks in the screens are invented. Flags are CSS stripes standing in for the real flag-icons SVGs.
- Facts on the screens (Djenné, Thimphu, the Hungarian words) are examples. They must be checked against their sources before they go into a data file.
- The design canvas the prototypes came from is private to the owner; this folder does not depend on it.
