# PRD: Quiz knowledge

## Problem Statement

Curated country facts are What The Flag's only edge over other quizzes. So are the rules that turn them into fair options.
The database, the API and the UI are only the environment they run in.

The owner curates alone, and today a data edit can create an unfair question that no check catches.
The language relation is spread over three overlapping lists. 65 of its 155 curated entries cite no source.
Fame comes from area, so the opening questions ask about Chad and Mauritania.
Vendored data that would make options more plausible sits unused.
The owner wants to know which data to add next, and in which shape, before the schema grows by accident.

## Solution

The knowledge stays one embedded, validated artefact. It is built from vendored sources plus small curated overlays.
Three gates protect it: the importer as the only way in, the committed artefact diff, and an exhaustive check over every question the artefact can produce.
Each (country, language) pair gets exactly one status, held as three disjoint lists.
Every curated fact carries a URL. CLDR flags likely gaps, and the curator decides on each.
German Wikipedia pageviews replace area as the fame signal.
Data is added only when a question or option rule consumes it, in roadmap order.

| Owner question | Answered in |
| --- | --- |
| Where is data missing? What do we have but not use? | Data inventory; Sources and licences |
| How do we structure and protect the core? | Domain architecture; Protections |
| What does a simple, flexible schema look like? | Schema |
| What is a good pipeline from sources to the database? | Ingestion pipeline |
| Which questions, modes, options and difficulty rules? | [prd-question-engine.md](prd-question-engine.md) |

## User Stories

Player:

- As a player, I never lose a run on an answer I can defend, so that a miss feels like my own mistake.
- As a player, the first questions ask about countries I know, so that I get into the game.
- As a player, I read names and languages the way German speakers know them, so that no label puzzles or offends me.

Curator (the owner):

- As the curator, I review a data edit through `git diff` of `countries.json` and, on demand, the review dump, so that I see the questions behind the JSON.
- As the curator, a data edit that makes any question unfair or unplayable fails `make check`, so that I cannot ship it by mistake.
- As the curator, I know where every curated fact came from, so that I can re-check it when a player disputes it.
- As the curator, CLDR lists the spoken-in countries I probably missed, so that completeness does not rest on memory.
- As the curator, a new attribute costs a source, an importer step and a rule, so that the schema needs no rewrite.

## Implementation Decisions

### Current state

- The only entity is Country, with 197 in the pool. Its attributes are name, capital, continent, other continents, official, regional and blocked languages, currencies, fame, flag key and look-alikes.
- `cmd/importdata` builds `internal/country/dataset/countries.json`. It reads vendored mledoze, CLDR, Wikidata and flag-icons data plus three curated files. `make check` fails when the artefact differs from the importer's output.
- Currency options show unit names with currency families. Language options respect language families.
- Language distractors exclude the target's regional and blocked languages. Regional prompts are never official in the target.
- Fame uses area rank: up to rank 50 is tier 1, up to 120 tier 2. All 24 overrides raise a country. Tier 1 holds 23 African countries, CF, TD, MR, NE and SS among them.
- There are 3 look-alike pairs.

Critique of the landed language work:

| Defect | Evidence | Fix |
| --- | --- | --- |
| `regionalLanguages` also holds official languages | 55 pairs overlap with `languages`, because the importer adds every country a language is official in. `spokenIn` lists official countries too (ca: AD; qu: BO, EC) | Make the lists disjoint (K2) |
| The five-country cap is a build error, so curators truncate lists | Quechua omits Chile | Delete the cap; add `blockedIn` (K2) |
| A diaspora country can be the correct answer | Welsh `spokenIn` is [AR, GB] | Move AR to `blockedIn` (K2) |
| Facts cannot be audited | 65 of 155 entries cite `regional.json note (no URL)`; the importer accepts any non-blank source | Require an https URL and backfill (K2) |
| Dead field | `kind` is validated but never emitted | Delete it (K2) |
| The value prompt is a one-off patch | A presenter branch, a `prompt` column tied to one type id, extra switch cases | Generalise when a second value-prompt type lands ([engine](prd-question-engine.md) E6) |

### Data inventory

Vendored but unused. Counts are facts over the pool.

| Data | Source | Value | Decision |
| --- | --- | --- | --- |
| Subregion: 24 values, 2 to 17 countries each | mledoze | Plausible distractors from the same subregion | Now (K4), as a grouping key |
| Language status and population share per territory | CLDR `supplemental/territoryInfo.json`, already in the fetch's sparse checkout but not copied | Checkable completeness and official status | Now (K2), warn-only |
| Validated secondary capitals | Wikidata, dropped after validation | Seats such as La Paz, kept out of capital traps | Next (K6) |
| Area | mledoze | "Which is largest?" | Later (K7), an S step of its own. Today it feeds only the fame rank; after K3 nothing reads it |
| Land borders: 158 countries have some | mledoze | Neighbour question | Later (K8). Needs rules for overseas parts (France–Brazil) and disputed borders |
| Landlocked: 45 countries | mledoze | "Which has no sea access?" | Later (K8). Needs a Caspian rule |
| Organisation flags (EU, UN, ASEAN …) | flag-icons | Membership questions | Later (K8) |
| `tld`, `idd`, `cioc`, official names, `latlng`, demonyms (no German) | mledoze | Niche or leaking | Rejected |

Missing data, to curate or fetch:

| Data | Source | Value | Phase |
| --- | --- | --- | --- |
| Familiarity rank | Wikimedia pageviews, dewiki, `agent=user`, 12 full months, joined by each country's dewiki sitelink | Fame that matches German players | Now (K3) |
| Complete spoken-in lists with a diaspora split | Curated, checked against CLDR | Fair regional and language questions | Now (K2) |
| German language labels without pejorative or archaic terms | `languageLabels` override | Replaces szl "Schlesisch (Wasserpolnisch)", hmn "Miao", fan "Pangwe", tpi "Neumelanesisch" | Now (K2) |
| Capital traps, about 25 rows | Curated with sources | The Sydney-for-Canberra moment | Next (K6) |
| Former country names, about 15 rows | Curated; Wikidata P1448/P1365 as a draft | A value-prompt question type | Next (K6) |
| More look-alike pairs | Curated from beta pick rates | Fair flag questions | Next, on evidence |
| Primary currency for the 11 multi-currency countries (BN, BS, BT, KH, LS, NA, PA, PS, SV, SZ, ZW) | Curated | Undisputed correct answers, such as PS and KH | Next, on player reports |
| Driving side, memberships, population, highest point | Wikidata P1622, P463, P1082, P610 | Predicate questions | Later (K8) |

### Sources and licences

| Source | Licence | Status |
| --- | --- | --- |
| mledoze/countries | ODbL-1.0 | Vendored; read the subregion too |
| Unicode CLDR `cldr-core`, `cldr-localenames-full` | Unicode-3.0 | Vendored; also copy `territoryInfo.json` |
| Wikidata SPARQL | CC0-1.0 | Capitals vendored; dewiki sitelinks in K3; batches later |
| lipis/flag-icons | MIT | Vendored |
| Wikimedia pageviews | Inference: CC0. The web-researcher verifies this before vendoring | New CSV under `data/sources/wikimedia/` |
| Wikipedia article text | CC BY-SA 4.0 | Never copied. Facts only, cited by URL |

A new source updates `data/SOURCES.md`, `NOTICE` and the footer credit in `frontend/src/app/messages.ts` in one change.

### Domain architecture

There are three contexts, and each rule lives in exactly one of them.

| Context | Code | Owns | Never holds |
| --- | --- | --- | --- |
| Knowledge | `data/`, `cmd/importdata`, `internal/country` | Facts, labels, curated judgements, source interpretation | Question rules |
| Question engine | `internal/quiz` `question.go`, `generate.go` | Types, tiers, candidates, defensible sets, option rules | Timing, storage |
| Game | `internal/quiz` run, service, leaderboards | Runs, clock, quizzes, scores | Facts, option rules |

Adapters (Postgres, HTTP presenter, frontend) only map. Each known duplication gets a decision:

| Duplication | Decision |
| --- | --- |
| Type ids in the SQL CHECK and the zod enum | Keep. The repo rule asks for a CHECK, and both ship in one release (D05) |
| One question sentence per type in `messages.ts` | Keep, because UI strings live there. The review dump prints the type id beside each question, so the curator checks each sentence once |
| Attribute-to-label mapping in `present.go` | Keep until the second value-prompt type lands (engine E6) |
| `quiz.Catalogue` returns `[]country.Country` | Keep. It has one implementation, so a view layer would be ceremony |

Refactor triggers, so the model grows only when a consumer exists:

- A prompt reference (country or value) plus one attribute table: when a second value-prompt type is scheduled.
- A relation model with a status on every multi-valued fact: when a third relation needs statuses, such as borders or memberships.
- A separate `internal/question` package: when `quiz` grows several times beyond its 915 non-test lines.

### Protections

| Gate | Catches | Where |
| --- | --- | --- |
| Vendored sources, pinned where the source has revisions | Upstream drift and vandalism between fetches | `scripts/fetch-data-sources.sh` |
| Strict decoding and CSV header checks; a reason on every override; no-op overrides rejected | Typos, changed upstream shapes, stale overrides | Importer |
| https source on every curated fact entry | Unauditable facts | Importer (K2) |
| Invariants: unique names and capitals, symmetric look-alikes, disjoint language lists, de and en labels, no label naming a country | Corrupt or ambiguous artefact | Importer `validate` |
| Artefact equals importer output | Hand edits, bad merges | `make check` (`data-check`) |
| Committed artefact diff | Unintended fact changes | `git diff` of `countries.json` |
| Question-space check over every (type, target, prompt, correct value) | Unfair, unplayable or unlabelled questions | `make check` (K1) |
| Review dump | Odd questions no rule describes | `make data-review`, on demand (K1) |
| depguard on the domain cores | HTTP or SQL inside rules | `backend/.golangci.yml` |

The core does not validate again at `Load`. `data-check` already rejects any artefact the importer did not build.

### Schema

The artefact stays typed structs plus label maps. There is no graph and no EAV.

Country after this PRD:

| Field | Cardinality | Meaning | Change |
| --- | --- | --- | --- |
| code | 1 | ISO alpha-2 | — |
| name, capital | 1 | `{de, en}` | — |
| region | 1 | Main continent | — |
| otherRegions | 0..n | Continents it also counts in; never a wrong option | — |
| subregion | 1 | mledoze subregion, an opaque grouping key | New (K4) |
| area | 1 | km², from mledoze | New (K7) |
| languages | 1..n | Official at national level | — |
| regionalLanguages | 0..n | Regional, minority, indigenous or creole languages established here and not official here | Official ones removed (K2) |
| blockedLanguages | 0..n | Languages with a lesser status or a community here; never asked, never a wrong option | Widened by `blockedIn` (K2) |
| currencies | 1..n | ISO 4217 | — |
| fame | 1 | 1..3 from the dewiki pageview rank | New source (K3) |
| flagKey, lookalikes | 1, 0..n | — | — |

The three language lists are disjoint. A pair's list is its status:

| Status | List | Correct answer of | Never a distractor in |
| --- | --- | --- | --- |
| Official | `languages` | Official-language questions about the country | Language questions about the country; regional questions about the language |
| Regional | `regionalLanguages` | Regional-language questions, where the country is the answer | Both |
| Blocked | `blockedLanguages` | Nothing | Both |

Labels stay as they are: languages and currencies `{de, en, family}`, regions `{de, en}`.

Curated files:

| File | Holds | Each entry needs |
| --- | --- | --- |
| `overrides.json` | Corrections to sources and editorial judgements | `reason`, citing a statute or source where it states a fact |
| `currency-units.json` | Unit labels and families | Non-empty de, en and family |
| `regional-languages.json` | Per language: `spokenIn`, the new `blockedIn`, `source`; no `kind` | An https `source` |
| `capital-traps.json` (K6) | Per country: one or two trap cities `{de, en}` | `source`, `reason` |
| `former-names.json` (K6) | Per entry: former name `{de, en}`, country, last year in use | `source` |

Rules for `regional-languages.json` (K2):

- `spokenIn` lists countries where the language is established and not official. Listing an official country is an error, because the dataset already knows it.
- `blockedIn` lists countries with a diaspora or a small community.
- Neither list has a cap. The cap's stated reason was three wrong countries without the language. That holds for any list size, because the generator falls back to the whole pool. K1's check fails any case with fewer than three.
- An entry needs at least one `spokenIn` country. The 7 entries that name only official countries (mfe, mi, rm, ss, st, tpi, ve) are deleted.
- So all 148 remaining entries are prompt-eligible (fact: 148 of today's 155 name a non-official country).
- Completeness rule: every pool country with an established community appears in `spokenIn` or `blockedIn`, or has the language as official.

`overrides.blockedLanguages` stays for other countries' official languages with a lesser status, such as Arabic in Israel. Both inputs feed `blockedLanguages`.

The generator follows the disjoint lists (K2):

- A country counts as spoken-in for a prompt when the language is in its `languages`, `regionalLanguages` or `blockedLanguages`. This replaces the `RegionalLanguages`-only predicate at `generate.go:68`. Otherwise Andorra becomes a wrong option for Catalan, Bolivia and Ecuador for Quechua, and Argentina for Welsh.
- Prompts come from `regionalLanguages` alone (`generate.go:63`). The official-language filter goes, because the lists are disjoint.
- `values` for the regional attribute (`question.go:92`) serves no answer type and keeps `regionalLanguages`.

### Ingestion pipeline

The pipeline ends at the embedded artefact, not at Postgres. Postgres stores what play produces: quizzes, questions, runs and answers. That becomes decision D13.

| # | Stage | Does | Fails when |
| --- | --- | --- | --- |
| 1 | Fetch | Pins revisions where the source has them, copies files unchanged. Wikidata has no pin; the pageview window is pinned by its end month | A download or checkout fails |
| 2 | Read | Decodes each source strictly, checks CSV headers, applies CLDR aliases | A field, header or file is unknown or missing |
| 3 | Pool | Joins on alpha-2; applies `unMember` and `poolAdditions` | Not 193 members or not 197 countries |
| 4 | Overlay | Applies the curated files | A reason or source is missing, an override changes nothing, a code is unknown |
| 5 | Derive | Fame from the pageview rank, subregion, disjoint language lists, labels | A label or a pool country's rank is missing |
| 6 | Validate | Checks every invariant and reports all violations at once | Any violation |
| 7 | Emit | Writes `countries.json`, flags and LICENSE; wipes stray files | `-check` finds a difference |
| 8 | Report | Prints the CLDR diff; `make data-review` prints the review dump | Never; reports only |
| 9 | Check | Runs the question-space check in `make check` | A question is unfair or unplayable |

A data change flows: edit `data/` → `make data` → read the CLDR diff and `make data-review` → commit → deploy.
Until K5, a data edit that removes a code also resets the staging database.

### Editorial rules

- A fact needs a source URL; a judgement, such as fame or a look-alike, needs a reason.
- The capital rule goes into game-rules.md: "The primary capital is the city the country's constitution or law names. Where law names several, it is the seat of the executive. Where the state has never controlled the named city, it is the seat of government."
  Inference: this rule reproduces all six `primaryCapitals` choices and NL Amsterdam:
  - BO Sucre, LK Sri Jayawardenepura Kotte, NL Amsterdam: the named capital.
  - SZ Mbabane, ZA Pretoria: law names several; the seat of the executive.
  - PS Ramallah: the state has never controlled East Jerusalem.
  - YE Sanaa: the state controlled it before 2014, so Aden's temporary seat does not count.
  The curator confirms each against its source.
- Labels follow CLDR unless they name a country (already enforced), or are pejorative or archaic.
- A spoken-in list is complete for established communities. CLDR is evidence, not truth.
- A look-alike pair is two flags a player cannot tell apart at card size, including under red–green colour blindness.
- No attribute's truth may depend on recognition, such as UN membership or borders involving XK, PS or TW.
- No religion, ethnicity, heads of state or fast-changing figures.

### Decisions taken

| Decision | Alternatives weighed | Why this one |
| --- | --- | --- |
| Embedded artefact; no catalogue tables in Postgres (D13) | Catalogue tables seeded each deploy; a read-only snapshot table for SQL joins | Tables add a seed path, migrations per data edit and a second source of truth. Either way is reversible |
| Typed structs; language status as three disjoint lists | A fact graph with relation and status vocabularies; a relations array; a six-value status enum per pair | The graph is an M-cost rewrite for relations that are all deferred. The lists cost S and change no consumer. The trigger above revisits it |
| The importer is the anti-corruption layer; no validation at `Load` | `country.Validate` at import and at `Load` | `data-check` already rejects any artefact the importer did not build |
| CLDR `territoryInfo` as a warn-only oracle | Derive statuses from CLDR; a failing lint with exception maps | CLDR shares include diaspora and immigrant languages. A failing lint would grow a third curated file |
| Fame from the 12-month dewiki pageview rank alone | de plus en sum; a blend with area and population; fame per attribute; a calibrated difficulty model | The audience reads German, and one quiz serves both locales, so one fame. Blends add weights without ground truth. Beta volume cannot fit a model |
| Subregion as mledoze's string key | An M49 code with CLDR labels | No label is shown yet. The mapping waits for a consumer that displays it |
| No cap on spoken-in lists; `blockedIn` holds diaspora | Keeping the build cap; the cap as a prompt filter; a heartland and also-spoken rewrite of 155 entries | The build cap caused truncation. As a prompt filter it would disable Quechua once Chile is added, and 11 languages sit at exactly five today. The generator's pool fallback already guarantees three wrong countries. `blockedIn` is additive |
| An https URL on curated fact entries; no dates | URL plus a checked date and a staleness report on every entry | In-scope facts rarely change, so dates are bookkeeping |

### Roadmap

Each phase ships alone. K1 goes first because it guards the rest. K2 depends on K1, because it changes what the generator reads. K3 and K4 are independent.

| Phase | Horizon | Ships | Depends on | Cost |
| --- | --- | --- | --- | --- |
| K1 Question-space check | Now | One deterministic candidate and defensible-set function shared by `Generate`, the check and the dump. The check runs in `make check`. `make data-review` prints one fixed-seed question per (type, target, prompt) as Markdown to stdout | — | M |
| K2 Honest language relation | Now | Disjoint lists, `blockedIn`, the build cap deleted, `kind` deleted, four label fixes, the 7 official-only entries deleted. The generator reads spoken-in from all three lists and prompts from `regionalLanguages`. `territoryInfo` is vendored and its diff printed. Gaps found are fixed, Quechua in Chile first. The 65 sources are backfilled: a `sonnet` agent drafts, the owner spot-checks 10% | K1 | M |
| K3 Fame from pageviews | Now | A new Wikidata query `data/sources/wikidata/articles.rq` fetches each country's dewiki sitelink by QID. The fetch script reads monthly `agent=user` views of that title over the last 12 full months into a CSV; the end month is its pin. The rank replaces area with the same cut-offs. The importer then rejects redundant `fameTiers` overrides, and lowering overrides become possible | — | S |
| K4 Subregion | Now | `subregion` on Country, read from mledoze | — | S |
| K5 Stable stored questions | Before the public launch | Open decision 1 | — | S–M |
| K6 Trap and former-name data | Next | `capital-traps.json`, `former-names.json` and their importer checks, shipped with engine E5 and E6 | K1 | S each |
| K7 Area | Later | `area` on Country, read from mledoze, for engine E8 | — | S |
| K8 More attributes | Later | Borders, landlocked, memberships, each with its question type, once the beta shows a need for variety | — | M each |

K3's join and its failure modes:

- A sitelink names the item's own article, never a redirect or a disambiguation page.
- Views through redirect titles, such as "Kongo", are not counted. Inference: this skews few countries; the curator reads the tier diff and corrects an outlier through `fameTiers`.
- The importer fails when a pool country has no sitelink or no view count.

### Open decisions

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| 1 | How stored questions survive data edits | (a) Store the displayed texts per question. (b) The importer refuses to drop a code that stored questions can reference; the presenter falls back to the code. (c) Reset the database, leaderboards included, after a breaking data edit | (c) during the beta. (a) at the public launch, after one final reset. A quiz is drawn lazily, so it can span a deploy; (a) keeps each question self-contained. Changes prd-rebuild ("The database stores country codes and attribute values only") and extends D09 |
| 2 | The authority for German country and capital names, such as Kiew or Kyjiw | CLDR as is; the Auswärtiges Amt list of state names; Duden | The Auswärtiges Amt list where it has an entry, else CLDR, applied through the existing override sections. Inference: the list exists and covers capitals; the web-researcher verifies |

## Testing Decisions

- The question-space check is a Go test in `internal/quiz` over the real embedded catalogue.
  It enumerates every type × target × prompt × correct value: about 10,000 cases in milliseconds.
- It takes each case's options from the shared candidate function. It asserts against the raw catalogue lists, never through that function:
  - at least three candidates remain, or a named rule makes the case ineligible;
  - no wrong language or currency is in the target's `languages`, `regionalLanguages`, `blockedLanguages` or `currencies`, nor shares a family with one;
  - no wrong country holds the prompt language in any of its three lists;
  - no wrong continent is the target's `region` or in its `otherRegions`;
  - under a flag prompt, no wrong option is a value of a look-alike, and no two options are look-alikes;
  - no two options share a family or a de or en text;
  - every option code has de and en labels.
- Thin pools, fewer than six candidates, go to `t.Log` as a report.
- It replaces "every type occurs in 200 seeds" as the feasibility guard. `checkRun` keeps the sampling properties.
- An importer table test loads the real sources once. Its three rows each mutate one fact:
  - a `spokenIn` country where the language is official;
  - an asymmetric look-alike;
  - a non-URL source.
- The CLDR diff and the review dump are reports, not tests.

## Out of Scope

- Catalogue tables in Postgres, a knowledge graph, EAV, and validation at `Load`.
- Fame per attribute and a calibrated difficulty model.
- A flag rasteriser and flag feature tags.
- New entity kinds: World Heritage sites, peaks, rivers, cities as entities.
- Demonyms, IOC codes, calling codes, TLDs, official names, religion, heads of state.
- Checked dates and a freshness report.
- Applying play statistics to data automatically. The curator copies an accepted finding into a curated file.

## Further Notes

Scope changes against [prd-rebuild.md](prd-rebuild.md):

| Item | Change |
| --- | --- |
| Pageviews as the fame source | In scope under "Tuning after the beta"; adds a row to the Data table |
| CLDR `territoryInfo` | In scope; adds a source file under the existing CLDR row |
| Subregion | Pulls "position" from Further Notes forward, as an internal grouping key only |
| K5 option (a) | Changes the Implementation Decisions line "The database stores country codes and attribute values only" |
| Capital traps, former names | New curated sets; extend the Data table |
| Area | Stays in Further Notes until K7 |
| Borders, landlocked, memberships | Stay in Further Notes until K8 |

Doc changes this PRD owes:

| Doc | Change | Phase |
| --- | --- | --- |
| `docs/README.md` | A row for this PRD | With the PRD |
| `docs/decisions.md` | D13 | With the PRD |
| `docs/game-rules.md` | The capital rule, once the curator has confirmed each choice against its source | K6 |
| `docs/game-rules.md` | "The 50 largest by area are tier 1 …" becomes "the 50 most-viewed on German Wikipedia over 12 months are tier 1, ranks 51 to 120 tier 2" | K3 |
| `docs/game-rules.md` | The language bullets restate: each (country, language) pair has one status, official, regional or blocked; diaspora countries are blocked; a regional-language question's wrong options hold the language in no status; "at most five" goes | K2 |
| `data/SOURCES.md` | The `regional-languages.json` row drops "each with its kind" and names `spokenIn`, `blockedIn` and the source; the CLDR row gains `territoryInfo.json` | K2 |
| `data/SOURCES.md`, `NOTICE`, footer credit | The Wikimedia pageviews source and the sitelink query | K3 |
| `data/SOURCES.md`, the curated-file list in `NOTICE`, the `AGENTS.md` layout | `capital-traps.json` and `former-names.json` | K6 |
| `docs/UBIQUITOUS_LANGUAGE.md` | The glossary changes below | With each term's phase |

Glossary changes for `docs/UBIQUITOUS_LANGUAGE.md`:

| Term | Definition | Avoid |
| --- | --- | --- |
| Regional language (changed) | A curated regional, minority, indigenous or creole language established in a country where it is not official. | dialect |
| Blocked language (changed) | A language with a lesser status or a community in a country; never asked about it and never a wrong option for it. | excluded language |
| Spoken-in list | A regional language's countries where it is established and not official; the possible correct answers of its question. | heartland |
| Subregion | The mledoze subregion of a country, used only to group distractors. | area, zone |
| Question space | Every question the generator can produce from the catalogue: each type, target, prompt and correct value. | question pool |
| Review dump | A Markdown listing of one fixed-seed question per case of the question space, for editorial review. | sample report |
| Fame tier (changed) | How well known a country is, from its German Wikipedia pageview rank and adjusted by a curated list. | popularity |
