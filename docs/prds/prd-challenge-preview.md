# PRD: Challenge link preview

> Part of the redesign; see [prd-redesign.md](prd-redesign.md). Screen: link preview image (09) in [docs/redesign/screens.md](../redesign/screens.md).

## Problem Statement

A shared challenge link is the game's growth engine. But in a chat every link looks the same: the site's static preview image and title.
The friend sees an ad for a quiz, not a challenge from a person with a score to beat. So fewer friends tap it.

## Solution

Each challenge link gets its own preview once the creator's run has ended.
An image and a title name the creator and the score, such as "Nico schafft 27. Und du?".
While the creator still plays, or when the creator run is hidden, the link keeps the static preview.

## User Stories

- As a player who shares a challenge, I want the link preview to show my name and score, so that friends see a personal challenge.
- As a friend who gets a link, I want to see the score to beat before I open it, so that I know what I'm signing up for.
- As the owner, I want hidden runs to drop out of previews, so that abuse doesn't spread through chats.
- As the owner, I want preview images cheap to serve, so that a link going viral doesn't load the server.

## Implementation Decisions

### Approach

Link crawlers don't run JavaScript, and the edge serves the SPA as static files. So crawlers need per-quiz tags in the HTML.

| Approach | Effort | Risk | Reversibility | Pick |
| --- | --- | --- | --- | --- |
| The edge renders `/q/<id>` from a template copy of the shell that includes a meta block from the backend | Medium | A second shell file to keep in step | High: drop the template route | **Yes** |
| The backend serves the HTML shell for `/q/<id>` | Medium | The backend must know the built SPA's asset names | Medium | No |
| Prerender a page per quiz | High | A build step per quiz | Low | No |

How the image is made:

| Approach | Effort | Risk | Pick |
| --- | --- | --- | --- |
| The backend draws it in Go with an embedded TTF (Baloo 2, OFL) and simple shapes | Medium | Text layout by hand | **Yes** |
| A headless browser service renders HTML | High | A new heavy service in the stack | No |
| A JavaScript renderer (SVG to PNG) in a new service | Medium | A second runtime in the backend stack | No |

### Image

- 1200×630 PNG, the layout of screen 09: the wordmark, "{name} schafft {score}. Und du?", the rules line and the score medallion.
- Crawlers send no language, so the image is German, the site's main audience. The score is the main element.
- The name is drawn as plain text, cut at 20 characters (the name limit). No flag of the quiz appears, so nothing is spoiled.
- The route serves it only while the creator run has ended and is not hidden. Otherwise it returns the static image.

### Font

- The app's `@fontsource-variable/baloo-2` ships woff2, and Go's `opentype` package reads TTF.
- So the backend embeds a static ExtraBold TTF. It is instanced from Google Fonts' `ofl/baloo2/Baloo2[wght].ttf` with fontTools' `instancer`.
- The TTF and its OFL licence are vendored, and NOTICE credits them.

### Caching

- Every request reads the creator run's state, so a hidden run drops out at once.
- An in-process LRU of at most 256 entries holds rendered images. The key is the quiz id, the name and the score.
- Responses carry `Cache-Control: public, max-age=600`. Chats may still keep a preview they fetched before the hide.

### Routes

- `GET /api/quizzes/{id}/preview.png`: the image, under the existing per-address read limits.
- `GET /api/quizzes/{id}/meta`: the HTML meta block for the edge.
  - It holds `og:title`, `og:description`, `og:image` and the Twitter equivalents, every value escaped.
  - Without an ended, visible creator, it holds the static tags.
- The CSP stays unchanged: the image is same-origin, and crawlers ignore CSP.

### Edge

- The edge image build copies `index.html` to `q.html`.
  - It drops the static Open Graph and Twitter tags.
  - It inserts a `httpInclude` of the quiz's meta route before `</head>`.
- `/q/*` serves `q.html` through Caddy's `templates`. Every other route serves `index.html` unchanged, so no other page carries template syntax.
- A build check fails when `index.html` holds `{{`, which `templates` would evaluate.
- Unverified: whether the `httpInclude` sub-request keeps the client's address for the rate limiter (D10).
  The plan's first phase checks it. If it does not, the meta route skips the per-address limit and is served from the cache.

## Testing Decisions

- Domain test of the meta and image decision: ended and visible creator → personal tags; playing, hidden or no creator → static tags.
- Go test of the image: correct size, the PNG decodes, a long or odd name stays inside the frame (pixel bounds check, no snapshot).
- Go test of the cache: it never exceeds 256 entries, and a hidden creator returns the static image although an entry exists.
- Contract tests `internal/contract/quiz_preview_integration_test.go` for both routes, including escaping of a name with `<`, `"` and `&`.
- `scripts/smoke.sh` checks that `/q/<quizId>` of the smoke run returns HTML with an `og:image` pointing at the quiz's preview route.

## Out of Scope

- Previews for the home page or the leaderboard.
- Story-format share images (9:16) and download of the image from the result screen.
- Localised previews by crawler language.

## Further Notes

- The static `og.png` stays as the fallback and for every other route.
- Messaging apps cache previews per URL. A preview fetched while the creator still played keeps the static image in that chat.
  The share sheet offers sharing only after the run has ended, which makes this rare.
- When it lands, `docs/decisions.md` gains a D-entry for the template route.
