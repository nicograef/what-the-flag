# Design system

The visual and interaction rules of the redesign. Values come from the prototypes in `prototypes/`; where a prototype and this file disagree, this file wins.

## Theme

One dark theme (D15). The game look is part of the identity.

- All colours are CSS variables on `:root` in `frontend/src/index.css`, mapped to Tailwind theme colours.
- They replace the shadcn tokens in one commit. No alias layer maps old names to new ones.
- `html` sets `color-scheme: dark`. `frontend/index.html` declares `color-scheme: dark` and one `theme-color` of `#12142B`.
- `prefers-contrast: more` outlines options with `border-strong` and draws `foreground-muted` text in `foreground-soft`.

## Colour tokens

| Token | Hex | Use | Contrast |
| --- | --- | --- | --- |
| `background` | `#12142B` | Page | — |
| `surface` | `#1E2147` | Cards, pills, sheets, timer track | — |
| `surface-2` | `#2A2E5E` | Answer options, chips | — |
| `border` | `#3A3F78` | Dividers and decoration only | 1.9:1, not for controls |
| `border-strong` | `#646AB4` | Outlines of inputs, secondary buttons and open pips | 3.7:1 on `background`, 3.1:1 on `surface`; 2.6:1 on `surface-2`, so no outlined control sits on `surface-2` |
| `foreground` | `#F5F6FF` | Text | 16.8:1 on `background`, 11.8:1 on `surface-2` |
| `foreground-soft` | `#C9CCEA` | Body text on cards | 11.5:1 on `background` |
| `foreground-muted` | `#A9ADD6` | Labels, captions | 8.3:1 on `background`, 7.1:1 on `surface`, 5.8:1 on `surface-2` |
| `accent` | `#FFC93C` | Primary buttons, score highlights, focus ring | 11.8:1 on `background` |
| `accent-ink` | `#2A1B00` | Text on `accent` | 10.9:1 |
| `accent-edge` | `#C7901A` | 3D bottom edge of primary buttons | — |
| `success` | `#34D399` | Correct option, run strip | ink `#062B1D`, 8:1 |
| `success-edge` | `#1F9E6E` | 3D edge of a correct option | — |
| `danger` | `#FF6B7A` | Chosen wrong option, miss square | ink `#3A0009`, 6.5:1 |
| `danger-edge` | `#C23A4A` | 3D edge of a wrong option | — |
| `warning` | `#FF9F43` | Timer at 5 s and below, flame | 8.9:1 on `background` |
| `negation` | `#C4A8FF` | The NICHT/NOT pill | 7.6:1 on `surface`, 9.0:1 on `background`; ink `negation-ink` `#1F0B4D`, 8.6:1 |
| `info` | `#7DD3FC` | Did-you-know heading and icon | on `info-surface` `#16263A`, 9:1 |
| `medal-1/2/3` | `#FFD54A` / `#CBD5E1` / `#F0A36B` | Podium, top-three badges | inks `#3A2A00` / `#1E293B` / `#3B1A05`: 9.8:1, 9.9:1, 7.6:1 |

Ratios use the WCAG 2.x formula. The prototypes draw input and secondary-button outlines in `border`; the implementation uses `border-strong`.

Rules:

- Correct and wrong are never told apart by colour alone. `success` and `danger` merge under deuteranopia (1.17:1).
  - Options and chips carry a check or a cross icon, plus "richtige Antwort" / "deine Antwort" for screen readers.
  - The run strip's miss square carries a cross glyph, a timeout square a clock glyph.
  - A missed level pip is drawn as a cross.
- `negation` is reserved for the NOT pill. No other element uses it.

## Typography

- Family: **Baloo 2** (SIL OFL), the variable font from `@fontsource-variable/baloo-2` (D16).
  - It loads the latin and latin-ext subsets. Their `unicode-range` fetches latin-ext only when a page needs it.
  - The `wght` axis covers the weights in use: 500, 600, 700, 800.
  - A fallback `@font-face` over `system-ui` sets `size-adjust` and `ascent-override` to Baloo 2's metrics, so the swap shifts no layout.
- Numbers that change (score, timer, ranks) use `font-variant-numeric: tabular-nums`.

| Style | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| Score hero | 84–120 px / 0.9 | 800 | Result score, record |
| Display | 44 px / 1.0 | 800 | Home headline |
| Prompt word | `clamp` 28–46 px / 1.05 | 800, `accent` | Country, capital or language prompt |
| Title | 22–30 px / 1.1 | 700–800 | Screen titles, question text (21 px) |
| Button large | 24–26 px | 800 | Primary buttons |
| Option | 20 px / 1.2 | 700 | Answer options |
| Body | 16–17 px / 1.35 | 500 | Cards, explanations |
| Label | 14–15 px | 700 | Level label, card headings |
| Caption | 13 px | 600 | Hints, sources, credit line |

- The prompt word shrinks with its length down to 28 px, then wraps to at most two lines.
- Long words break with `overflow-wrap: anywhere` and `hyphens: auto` under the right `lang`.
- No text element uses `overflow: hidden` or a fixed height.

## Layout

- One column, max width 448 px (`max-w-md`), centred; 16 px side gutters; full viewport height on game screens (`h-dvh`).
- Spacing on a 4 px grid; section gaps 14–18 px; answer gap 12 px.
- Radii: 12 px (chips, small rows), 16 px (options, inputs), 18–20 px (cards, buttons), 28 px (sheet top).
- Primary actions live in the bottom third.
- Safe-area insets apply at the bottom everywhere and at the top and sides of the play header.
- Result actions sit in a sticky bottom bar with the bottom inset. The cards scroll above it.
- The play main scrolls when its content is taller than the viewport.
- Check every screen at 320×568, 375×667, 667×375 landscape and 200 % zoom.
- Headers per route are set in [prd-redesign.md](../prds/prd-redesign.md#layout-and-navigation).

## Components

Each maps to one React component.

| Component | Spec | States | Accessibility |
| --- | --- | --- | --- |
| `Button` (primary) | 68–72 px tall, `accent` fill, `accent-ink` text, 6 px `accent-edge` bottom shadow, 2 px transparent border; presses down 3 px | default, pressed, guarded (dimmed, fades in) | real `<button>`/`<a>`; guarded means `aria-disabled` with activation ignored, same label |
| `Button` (secondary) | 56 px, 2 px `border-strong` outline, transparent | default, pressed, guarded | same |
| `HoldButton` | Primary button with a fill layer that grows left→right over 400 ms during a touch or pen hold | idle, holding (fill runs, 3 px `accent` inset ring), committed | mouse click, Enter and Space commit at once; `aria-describedby` points at a static text naming every method |
| `AnswerOption` | Text: full width, `min-height` 64 px, `surface-2`, 5 px dark bottom edge, 2 px transparent border, text left and wrapping. Flag: 2×2 grid cell, `min-height` 124 px, flag 128×96 centred | arming (30 %), ready, holding (fill 32 % `accent`), correct (`success`, check), chosen wrong (`danger`, cross, shake), dimmed (35 %), sending (spinner) | `<button>`; arming uses `aria-disabled`, so options stay in the tab order; flag options labelled "Flagge 1–4"; after reveal the label gains ", richtige Antwort" / ", deine Antwort" |
| `NotPill` | Pill on the top edge of the prompt card: "NICHT" / "NOT", `negation` fill, `negation-ink` text, 13 px, weight 800 | — | real text; the question sentence also carries NICHT/NOT |
| `LevelPips` | "Level N · Rank" in `foreground-muted` 14 px, five 8 px bars | done `accent`; current `accent` 45 %; open: transparent with a 2 px `border-strong` outline; a miss pip is a `danger` cross | the label is the accessible part and adds sr-only "Frage N von 5"; pips `aria-hidden` |
| `StreakPill` | 40 px pill, flame icon + score 22 px; turns `accent` after passing the gap target | default, passed, "+1" pop | the score is sr-only text ("N richtig"), not an `aria-label` on a span |
| `GapPill` | 13 px line under the streak pill: "Rekord in N" / "Rekord eingestellt" / "Neuer Rekord", or the creator variants | `foreground-muted` → `accent` | plain text |
| `TimerBar` | 12 px `surface` track, `accent` fill by remaining time, number right | `accent` > 5 s, `warning` ≤ 5 s, `danger` ≤ 3 s; dimmed while paused | `role=progressbar` with `aria-valuetext` in seconds, as today |
| `Toast` | Gold pill with star icon, scales in | level-up, record, creator passed | text goes to the persistent `role=status` region |
| `RunStrip` | 14 px squares, 3 px gap, blocks of five with 10 px gap, two blocks per row; more than 10 answers show "×{k}" then the last two blocks | correct `success`; miss `danger` with a cross glyph; timeout `danger` with a clock glyph | `role=img` with a sentence |
| `LearningCard` | `surface`, 2 px `accent` inner ring, "Merk dir das" with bulb icon; correct vs pick (flags 112×84 with captions, or 44 px chips); one sentence; a fact row (`<dl>`) of name and flag, capital, continent, languages, currencies | — | `<section aria-labelledby>`; flags as `role=img` with country names |
| `DidYouKnowCard` | Ships with [prd-did-you-know.md](../prds/prd-did-you-know.md): `info-surface`, globe icon, "Wusstest du?", one fact or a phrase grid, a 44 px source link | fact, phrases (wrapping grid of tiles) | `<aside>`; phrases in a `<dl>` with `lang` and `dir` on each foreign word |
| `Sheet` | Native `<dialog>` opened with `showModal()`, bottom-aligned, `surface`, 28 px top radius, grab handle; `::backdrop` 60–72 % | open | focus moves in; Escape closes; focus returns to the trigger; the background is inert |
| `RankRow` | 50 px row: rank, name (ellipsis), score | default, own (`surface-2`, "(du)"), pinned own row with Play button | `<ol>`; own row `aria-current="true"` |
| `Podium` | Three columns 2-1-3, heights 92/128/72 px, medal colours with their inks | — | real text, no image |
| `Tabs` | 44 px segmented control on `surface` | selected: `surface-2` fill, 3 px `accent` underline, weight 800 | `role=tablist` / `tab` / `tabpanel`, `aria-selected`, roving tabindex with arrow keys |
| `Banner` | Inline alert row with icon and one action | warning (resume), danger (offline) | `role=status` (resume) / `role=alert` (offline) |

Focus ring: 3 px with a 2 px offset. It is `accent` on dark surfaces and `foreground` around `accent` buttons.

## Interaction timings

| Name | Value | Why |
| --- | --- | --- |
| Arming | 400 ms after a question renders; options `aria-disabled` at 30 % opacity | A press carried over from the last question does nothing |
| Hold (touch, pen) | Commits 400 ms after `pointerdown` while the pointer is still on the option | No touch answer can arrive within the server's 300 ms "too fast" window |
| Mouse, keyboard, assistive tech | A click, Enter or Space commits at once once arming ends | The hold guards thumbs; other inputs don't slip |
| Hold cancel | Release before 400 ms, a `pointermove` more than 12 px outside the option, or `pointercancel` | Sliding off is the escape hatch; touch pointers are captured, so `pointerleave` never fires |
| Hold at 0 s | A running hold completes and commits; the expiry waits for it | The server's 2 s grace accepts it |
| Reveal, correct | 650 ms; 1100 ms with a toast | Long enough to see the result, short enough to keep the flow |
| Reveal, wrong | 1300 ms, then the result screen | Time to see the correct answer |
| Result guard | 1000 ms after the result renders; buttons `aria-disabled`, fading in | A late tap from the last question cannot restart or share |
| Timer colours | `warning` at ≤ 5 s, `danger` at ≤ 3 s | As today |
| Haptics | `navigator.vibrate(12)` on a hold commit, where supported | Confirms the hold without looking |

Options suppress the touch callout, text selection, image dragging and the context menu.

## Motion

- Allowed: option fade-in after arming, hold fill, "+1" pop (0.7 s), toast scale-in, sheet rise (0.3 s), wrong shake (0.32 s), confetti on a record.
- The hold fill is a CSS animation, not state updated per frame.
- `prefers-reduced-motion: reduce` turns off the pop, shake, toast, sheet and confetti animations.
  The hold fill stays because it is feedback; only its press-down transform goes.

## Forced colors

In `@media (forced-colors: active)` backgrounds and shadows drop, so:

- options and buttons show their 2 px transparent border, which becomes visible;
- pips and run-strip squares get a 1 px `CanvasText` border;
- the hold fill and the selected tab use `Highlight`.

## Iconography

Lucide icons at 20–24 px, stroke 2–2.6: trophy, play, rotate-ccw, share, x, check, chevron-left/right, lightbulb, globe, message-circle, wifi-off, timer, crown (filled), flame (filled), star.
Decorative icons are `aria-hidden`; icon-only buttons carry `aria-label`.

## Flags

The prototypes draw flags as CSS stripes. The app keeps its flag-icons SVGs (`/flags/<flagKey>.svg`), 4:3, with a 1 px dark ring and 6–12 px radius by size.
Flag images are `draggable=false` and ignore pointer events, so a long press opens no image menu.
