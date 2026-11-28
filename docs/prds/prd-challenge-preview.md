# PRD: Challenge link preview

> Part of the redesign; see [prd-redesign.md](prd-redesign.md). Screen: link preview image (09) in [docs/redesign/screens.md](../redesign/screens.md).

## Problem Statement

A shared challenge link is the game's growth engine, but in a chat every link looks the same: the site's static preview image and title.
The friend sees an ad for a quiz, not a challenge from a person with a score to beat, so fewer friends tap it.

## Solution

Each challenge link gets its own preview once the creator's run has ended: an image and a title that name the creator and the score, such as "Nico schafft 27. Und du?".
While the creator still plays, or when the creator run is hidden, the link keeps today's static preview.

## User Stories

- As a player who shares a challenge, I want the link preview to show my name and score, so that friends see a personal challenge.
- As a friend who gets a link, I want to see the score to beat before I open it, so that I know what I'm signing up for.
- As the owner, I want hidden runs to never appear in previews, so that abuse doesn't spread through chats.
- As the owner, I want preview images cheap to serve, so that a link going viral doesn't load the server.

## Implementation Decisions

### Approach

How crawlers get per-quiz tags, given that the edge serves the SPA as static files and link crawlers don't run JavaScript:

| Approach | Effort | Risk | Reversibility | Pick |
| --- | --- | --- | --- | --- |
| The edge renders `/q/<id>` through a template step that fetches a small block of meta tags from the backend; every other route stays static | Medium | Templates run on the SPA shell, so the shell's other content must not look like template syntax | High: drop the template step | **Yes** |
| The backend serves the HTML shell for `/q/<id>` | Medium | The backend must know the built SPA's asset names | Medium | No |
| Prerender a page per quiz | High | A build step per quiz | Low | No |

How the image is made:

| Approach | Effort | Risk | Pick |
| --- | --- | --- | --- |
| The backend draws it in Go with an embedded font (Baloo 2, OFL) and simple shapes | Medium | Text layout by hand | **Yes** |
| A headless browser service renders HTML | High | A new heavy service in the stack | No |
| A JavaScript renderer (SVG to PNG) in a new service | Medium | A second runtime in the backend stack | No |

### Image

- 1200×630 PNG, the layout of screen 09: the wordmark, "{name} schafft {score}. Und du?", the rules line and the score medallion.
- German or English: crawlers send no language, so the image uses German, the site's main audience, with the score as the main element. A query parameter can select English for later use.
- The name is drawn as plain text, cut at 20 characters (the name limit). No flag of the quiz appears, so nothing is spoiled.
- Served only when the creator run has ended and is not hidden; otherwise the route returns the static image.
- Once the creator run has ended the image never changes, so it is cached long (immutable for a given quiz), and rendered at most once per process per quiz with an in-memory cache.

### Routes

- `GET /api/quizzes/{id}/preview.png`: the image, under the existing per-address read limits.
- `GET /api/quizzes/{id}/meta`: the HTML meta block (`og:title`, `og:description`, `og:image` and the Twitter equivalents) with every value escaped; the static tags when the creator is not ended or hidden. Used only by the edge's template step.
- The CSP stays unchanged: the image is same-origin, and crawlers ignore CSP.

### Edge

- The `/q/*` route renders the SPA shell through Caddy's template step, which includes the backend's meta block. Every other route serves the shell as today.
- The shell's `index.html` gets the include in its head behind a marker that only the `/q/*` route evaluates; how is settled in the plan, with a test that the plain shell stays valid HTML.

## Testing Decisions

- Domain test of the meta and image decision: ended and visible creator → personal tags; playing, hidden or no creator → static tags.
- Go test of the image: correct size, PNG decodes, a long or odd name stays inside the frame (pixel bounds check, no snapshot).
- Contract tests `internal/contract/quiz_preview_integration_test.go` for both routes, including escaping of a name with `<`, `"` and `&`.
- `scripts/smoke.sh` gains a check that `/q/<quizId>` of the smoke run returns HTML with an `og:image` pointing at the quiz's preview route.

## Out of Scope

- Previews for the home page or the leaderboard.
- Story-format share images (9:16) and download of the image from the result screen.
- Localised previews by crawler language.

## Further Notes

- The static `og.png` stays as the fallback and for every other route.
- Messaging apps cache previews per URL; a preview fetched while the creator still played keeps the static image in that chat. The share sheet only offers sharing after the run has ended, which makes this rare.
