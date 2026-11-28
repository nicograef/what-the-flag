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
| `tools/annotations.json` | The callouts and per-screen notes; `screens.md` is generated from it |
| `tools/render.cjs` | Re-renders all screenshots |

The prototypes were authored on a design canvas whose format is HTML plus `{{holes}}`, `<sc-if>`, `<sc-for>` and a `class Component extends DCLogic` script. `tools/runtime.js` implements just enough of it to render them here.
They are a visual and behavioural reference, not code to copy: rebuild them as React components in the existing app.

## View the prototypes

```bash
python3 -m http.server 8123 --directory docs/redesign
```

Then open `http://localhost:8123/tools/preview.html`. Add `&annotate=1` to a screen URL to see its callouts.
`F-Question` is playable: hold an answer for 0.4 s, Enter answers at once, and the run passes the record after three correct answers.

## Re-render the screenshots

```bash
node docs/redesign/tools/render.cjs
```

It needs Playwright with Chromium, and network access to Google Fonts for Baloo 2. Pass `--pdf <file>` to also write one PDF of all annotated screens.

## Implementing it

Ask Claude Code to plan from the PRD first, as the handbook's plan skill describes:

```text
/nico:plan docs/prds/prd-redesign.md
```

Rules from `AGENTS.md` that the redesign touches most:

- UI strings live only in a feature's `messages.ts` built with `defineMessages`, German and English. `copy.md` lists them.
- Components reach the server only through feature API functions over `ApiClient`. Feature tests fake the server only via `FakeApi` and `renderRoute()`.
- Code lives in `features/<name>/`, file names kebab-case.
- The one backend change of the main PRD (the country of a wrong pick on the missed question) lands with its contract test in `internal/contract/`.
- The edge CSP allows only same-origin fonts (D12): self-host Baloo 2, never link Google Fonts in the app.

Where the new pieces go:

| Piece | Place |
| --- | --- |
| Tokens and font | `frontend/src/index.css`, `@fontsource/baloo-2` in `frontend/package.json` |
| `Button`, `HoldButton`, `Sheet`, `Tabs`, `Banner` | `frontend/src/components/ui/` |
| `AnswerOption`, `LevelPips`, `StreakPill`, `RecordGap`, `TimerBar`, `Toast`, `RunStrip`, `LearningCard` | `frontend/src/features/play/` |
| Share sheet and share text | `frontend/src/features/play/` (replaces `share-button.tsx`) |
| Overtaken card | `frontend/src/features/challenge/` (stores the browser's quiz runs) |
| `Podium`, `RankRow`, leaderboard tabs | `frontend/src/features/leaderboard/` |
| Layout without navbar while playing | `frontend/src/app/layout.tsx` |

## Status

- Design: final for v1 (A+). Screens, specs and copy are complete for the main PRD.
- Sample data: names, scores and ranks in the screens are invented. Flags are CSS stripes standing in for the real flag-icons SVGs.
- Facts on the screens (Djenné, Thimphu, the Hungarian words) are examples. They must be checked against their sources before they go into a data file.
- The design canvas the prototypes came from is private to the owner; this folder does not depend on it.
