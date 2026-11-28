# Design system

The visual and interaction rules of the redesign. Values are taken from the prototypes in `prototypes/`; where a prototype and this file disagree, this file wins.

## Theme

One dark theme. The game look is part of the identity, so the redesign drops the light/system theme of the old UI.
All colours are CSS variables on `:root` in `frontend/src/index.css`, mapped to Tailwind theme colours, so a light theme can be added later without touching components.

## Colour tokens

| Token | Hex | Use | Contrast |
| --- | --- | --- | --- |
| `background` | `#12142B` | Page | — |
| `surface` | `#1E2147` | Cards, pills, sheets | — |
| `surface-2` | `#2A2E5E` | Answer options, tracks, active tab | — |
| `border` | `#3A3F78` | Dividers and decoration only | 1.9:1, not for controls |
| `border-strong` | `#646AB4` | Outlines of inputs and secondary buttons | 3.7:1 on `background`, 3.1:1 on `surface` (WCAG 1.4.11) |
| `foreground` | `#F5F6FF` | Text | 16.8:1 on `background`, 11.8:1 on `surface-2` |
| `foreground-soft` | `#C9CCEA` | Body text on cards | 11.5:1 on `background` |
| `muted` | `#A9ADD6` | Labels, captions | 8.3:1 on `background`, 7.1:1 on `surface`, 5.8:1 on `surface-2` |
| `accent` | `#FFC93C` | Primary buttons, score highlights, focus ring | 11.8:1 on `background` |
| `accent-ink` | `#2A1B00` | Text on `accent` | 10.9:1 |
| `accent-edge` | `#C7901A` | 3D bottom edge of primary buttons | — |
| `success` | `#34D399` | Correct option, run strip | ink `#062B1D`, 8:1 |
| `success-edge` | `#1F9E6E` | 3D edge of a correct option | — |
| `danger` | `#FF6B7A` | Chosen wrong option, miss square | ink `#3A0009`, 6.5:1 |
| `danger-edge` | `#C23A4A` | 3D edge of a wrong option | — |
| `warning` | `#FF9F43` | Timer at 5 s and below, flame | 8.9:1 on `background` |
| `info` | `#7DD3FC` | "Wusstest du?" heading and icon | on `info-surface` `#16263A`, 9:1 |
| `medal-1/2/3` | `#FFD54A` / `#CBD5E1` / `#F0A36B` | Podium, top-three badges | dark ink per medal, ≥ 7.6:1 |

Ratios were computed with the WCAG 2.x formula. The prototypes still draw input and secondary-button outlines in `border`; the implementation uses `border-strong`.

Rules:

- Correct and wrong are never told apart by colour alone: a check or a cross icon and the words "richtige Antwort" / "deine Antwort" for screen readers always come with them.
- Green and red differ in lightness too (`#34D399` vs `#FF6B7A`), so they stay distinct with red–green colour blindness.

## Typography

- Family: **Baloo 2** (SIL OFL), weights 500, 600 (rarely), 700, 800. Self-hosted as woff2 from the `@fontsource/baloo-2` package: the edge's CSP allows only same-origin fonts (D12). Fallback `system-ui, sans-serif`.
- Numbers that change (score, timer, ranks) use `font-variant-numeric: tabular-nums`.

| Style | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| Score hero | 84–120 px / 0.9 | 800 | Result score, record |
| Display | 44 px / 1.0 | 800 | Home headline |
| Prompt word | 46 px / 1.0 | 800, `accent` | Country, capital or language prompt |
| Title | 22–30 px / 1.1 | 700–800 | Screen titles, question text (21 px) |
| Button large | 24–26 px | 800 | Primary buttons |
| Option | 20 px | 700 | Answer options |
| Body | 16–17 px / 1.35 | 500 | Cards, explanations |
| Label | 14–15 px | 700 | Level label, card headings |
| Caption | 13 px | 600 | Hints, sources |

## Layout

- One column, max width 448 px (`max-w-md`), centred; 16 px side gutters; full viewport height on game screens (`h-dvh`).
- Spacing on a 4 px grid; section gaps 14–18 px; answer gap 12 px.
- Radii: 12 px (chips, small rows), 16 px (options, inputs), 18–20 px (cards, buttons), 28 px (sheet top).
- Primary actions live in the bottom third. Safe-area insets are respected at the bottom (`env(safe-area-inset-bottom)`).
- No navbar on `/play/:runId`. Elsewhere a 56 px header: wordmark left; leaderboard icon and language switch right.

## Components

Each maps to one React component; names are suggestions.

| Component | Spec | States | Accessibility |
| --- | --- | --- | --- |
| `Button` (primary) | 68–72 px tall, `accent` fill, `accent-ink` text, 6 px `accent-edge` bottom shadow; presses down 3 px | default, pressed, disabled 35 % opacity, arming ("Gleich …") | real `<button>`/`<a>`, focus ring 3 px `foreground` |
| `Button` (secondary) | 56 px, 2 px `border-strong` outline, transparent | default, pressed | same |
| `HoldButton` | Primary button with a fill layer that grows left→right over 400 ms while pressed | idle, holding (fill runs, 3 px `accent` inset ring), committed | Enter/Space commit at once; `aria-describedby` points at the hold hint |
| `AnswerOption` | Text: full width, 64 px, `surface-2`, 5 px dark bottom edge, text left. Flag: 2×2 grid cell 124 px, flag 128×96 centred | arming (30 %), idle, holding (fill 32 % `accent`), correct (`success`, check), chosen wrong (`danger`, cross, shake), dimmed (35 %), sending (spinner) | `<button>`; flag options labelled "Flagge 1–4"; after reveal the label gains ", richtige Antwort" / ", deine Antwort" |
| `LevelPips` | "Level N · Name" in `muted` 14 px, five 8 px bars | done `accent`, current `accent` 45 %, open `surface-2`; a miss pip turns `danger` | text label is the accessible part; pips `aria-hidden` |
| `StreakPill` | 40 px pill, flame icon + score 22 px; turns `accent` after a new record | default, record, "+1" pop | `aria-label="N richtig"` |
| `RecordGap` | 13 px line under the streak pill: "Rekord in N" / "Rekord eingestellt" / "Neuer Rekord" | muted → `accent` | plain text |
| `TimerBar` | 12 px track `surface`, fill by remaining time, number right | `accent` > 5 s, `warning` ≤ 5 s, `danger` ≤ 3 s; dimmed while paused | `role=progressbar` with seconds, as today |
| `Toast` | Gold pill with star icon, scales in | level-up, record | `role=status` |
| `RunStrip` | 14 px squares, 3 px gap, blocks of five with 10 px gap | correct `success`, miss `danger` | `role=img` with a sentence |
| `LearningCard` | `surface`, 2 px `accent` inner ring, "Merk dir das" with bulb icon; correct vs pick (flags 112×84 or chips 44 px); one sentence | — | `<section aria-labelledby>`; flags as `role=img` with country names |
| `FactCard` | `info-surface`, globe icon, "Wusstest du?", one fact or a phrase grid, source link 13 px | fact, phrases (five tiles) | `<aside>`; phrases in a `<dl>` with `lang` on each foreign word |
| `Sheet` | Bottom sheet, `surface`, 28 px top radius, grab handle, backdrop 60–72 % | open | `role=dialog`, focus moves in, Escape closes |
| `RankRow` | 50 px row: rank, name (ellipsis), score | default, own (`surface-2`, "(du)"), pinned own row with Play button | `<ol>`; own row `aria-current="true"` |
| `Podium` | Three columns 2-1-3, heights 92/128/72 px, medal colours | — | real text, no image |
| `Tabs` | 44 px segmented control on `surface` | selected `surface-2` | `role=tablist` / `tab`, `aria-selected` |
| `Banner` | Inline alert row with icon and one action | warning (resume), danger (offline) | `role=status` (resume) / `role=alert` (offline) |

## Interaction timings

| Name | Value | Why |
| --- | --- | --- |
| Arming | 400 ms after a question renders, options are disabled and at 30 % opacity | A press carried over from the last question does nothing |
| Hold | 400 ms press to commit an answer or a hold button | No touch answer can arrive within the server's 300 ms "too fast" window |
| Hold cancel | release before 400 ms, pointer leaves the button, or pointer cancel | Sliding off is the escape hatch |
| Reveal, correct | 650 ms; 1100 ms with a toast | Long enough to see the result, short enough to keep the flow |
| Reveal, wrong | 1300 ms, then the result screen | Time to see the correct answer |
| Result buttons arm | 1000 ms after the result renders | A late tap from the last question cannot restart or share |
| Timer colours | `warning` at ≤ 5 s, `danger` at ≤ 3 s | As today |
| Haptics | `navigator.vibrate(12)` on commit, where supported | Confirms the hold without looking |

## Motion

- Allowed: option fade-in after arming, hold fill, "+1" pop (0.7 s), toast scale-in, sheet rise (0.3 s), wrong shake (0.32 s), confetti on a record (static dots in the prototype).
- `prefers-reduced-motion: reduce` turns off the pop, shake, toast, sheet and confetti animations. The hold fill stays, because it is feedback rather than decoration; only its press-down transform goes.

## Iconography

Lucide icons (already a dependency) at 20–24 px, stroke 2–2.6: trophy, play, rotate-ccw, share, x, check, chevron-left/right, lightbulb, globe, message-circle, wifi-off, timer, crown (filled), flame (filled), star.
Decorative icons are `aria-hidden`; icon-only buttons carry `aria-label`.

## Flags

The prototypes draw flags as CSS stripes. The app keeps its flag-icons SVGs (`/flags/<flagKey>.svg`), 4:3, with a 1 px dark ring and 6–12 px radius by size.
