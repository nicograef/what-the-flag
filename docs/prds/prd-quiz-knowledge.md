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
| The value prompt is a one-off patch | A presenter branch, a `prompt` column tied to one type id, extra switch cases | Generalise when `calling_code_name`, the second value-prompt type, lands ([engine](prd-question-engine.md) E10) |

### Data inventory

Vendored but unused. Counts are facts over the pool.

| Data | Source | Value | Decision |
| --- | --- | --- | --- |
| Subregion: 24 values, 2 to 17 countries each | mledoze | Plausible distractors from the same subregion | Now (K4), as a grouping key |
| Language status and population share per territory | CLDR `supplemental/territoryInfo.json`, already in the fetch's sparse checkout but not copied | Checkable completeness and official status | Now (K2), warn-only |
| Validated secondary capitals | Wikidata, dropped after validation | Seats such as La Paz, kept out of capital traps | Next (K6) |
| Calling codes: 183 distinct, 181 with one holder; +1 shared by 13 NANP members, +7 by RU and KZ (fact, explorer script) | mledoze `idd` | Calling-code questions and referents | Next (K10) |
| Land borders: 158 countries have some, 111 have at least 3 (fact); LK→IN is the only asymmetric entry | mledoze `borders` | Neighbour and NOT-neighbour questions, two-hop distractors | Next (K11), with a blocked-pair overlay |
| Area | mledoze | "Which is largest?" | Later (K7), an S step of its own. Today it feeds only the fame rank; after K3 nothing reads it |
| Landlocked: 45 countries | mledoze | "Welches Land ist ein Binnenstaat?" | Later (K8). Needs a Caspian rule |
| Organisation flags (EU, UN, ASEAN …) | flag-icons | Membership questions | Later (K8) |
| `tld`, `cioc`, official names, `latlng`, demonyms (no German) | mledoze | Niche or leaking | Rejected |

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
| mledoze/countries | ODbL-1.0 | Vendored; also read `subregion`, `idd` and `borders` |
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
| Question engine | `internal/quiz` `question.go`, `options.go`, `generate.go` | Types, tiers, levels, true and contested sets, candidates, option rules | Timing, storage |
| Game | `internal/quiz` run, service, leaderboards | Runs, clock, quizzes, scores | Facts, option rules |

Adapters (Postgres, HTTP presenter, frontend) only map. Each known duplication gets a decision:

| Duplication | Decision |
| --- | --- |
| Type ids in the SQL CHECK and the zod enum | Keep. The repo rule asks for a CHECK, and both ship in one release (D05) |
| One question sentence per type in `messages.ts` | Keep, because UI strings live there. The review dump prints the type id beside each question, so the curator checks each sentence once |
| Attribute-to-label mapping in `present.go` | Keep until the second value-prompt type lands (engine E10) |
| `quiz.Catalogue` returns `[]country.Country` | Keep. It has one implementation, so a view layer would be ceremony |

Refactor triggers, so the model grows only when a consumer exists:

- No generic relation model. A relation with a status keeps a true list and a blocked list:
  - `languages`/`blockedLanguages` (with `regionalLanguages`);
  - `callingCode`/`blockedCallingCodes`;
  - `borders`/`blockedBorders`.

  The engine's true and contested sets are the one reader of statuses. Revisit when a relation needs a status beyond true, regional and blocked.
- A separate `internal/question` package: when `quiz` grows several times beyond its 915 non-test lines.

### Protections

| Gate | Catches | Where |
| --- | --- | --- |
| Vendored sources, pinned where the source has revisions | Upstream drift and vandalism between fetches | `scripts/fetch-data-sources.sh` |
| Strict decoding and CSV header checks; a reason on every override; no-op overrides rejected | Typos, changed upstream shapes, stale overrides | Importer |
| https source on every curated fact entry | Unauditable facts | Importer (K2) |
| Invariants: unique names and capitals, symmetric look-alikes, disjoint language lists, de and en labels, no label naming a country; borders symmetric and disjoint from blocked borders; +1 the only calling code with several holders; a blocked calling code never the country's own | Corrupt or ambiguous artefact | Importer `validate` |
| Artefact equals importer output | Hand edits, bad merges | `make check` (`data-check`) |
| Committed artefact diff | Unintended fact changes | `git diff` of `countries.json` |
| Question-space check over every (type, target, prompt) | Unfair, unplayable or unlabelled questions | `make check` (K1) |
| Review dump | Odd questions no rule describes | `make data-review`, on demand (K1) |
| depguard on the domain cores | HTTP or SQL inside rules | `backend/.golangci.yml` |

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
| callingCode | 0..1 | ITU country code such as "+49"; empty for an excluded country | New (K10) |
| blockedCallingCodes | 0..n | Codes an excluded country uses in practice; never a referent, and the country is never an option for them | New (K10) |
| borders | 0..n | Pool countries sharing an undisputed land border; sorted, symmetric | New (K11) |
| blockedBorders | 0..n | Pool countries whose land border with this one a player could argue either way; symmetric, disjoint from `borders` | New (K11) |
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
| `overrides.json` | Corrections to sources and editorial judgements, including the `callingCodes` and `borders` sections | `reason`, citing a statute or source where it states a fact |
| `currency-units.json` | Unit labels and families | Non-empty de, en and family |
| `regional-languages.json` | Per language: `spokenIn`, the new `blockedIn`, `source`; no `kind` | An https `source` |
| `capital-traps.json` (K6) | Per country: one or two trap cities `{de, en}` | `source`, `reason` |
| `former-names.json` (K6) | Per entry: former name `{de, en}`, country, last year in use | `source` |

Rules for `regional-languages.json` (K2):

- `spokenIn` lists countries where the language is established and not official. Listing an official country is an error, because the dataset already knows it.
- `blockedIn` lists countries with a diaspora or a small community.
- Neither list has a cap. K1's check fails any case with fewer than three wrong countries.
- An entry needs at least one `spokenIn` country. The 7 entries that name only official countries (mfe, mi, rm, ss, st, tpi, ve) are deleted.
- So all 148 remaining entries are prompt-eligible (fact: 148 of today's 155 name a non-official country).
- Completeness rule: every pool country with an established community appears in `spokenIn` or `blockedIn`, or has the language as official.

`overrides.blockedLanguages` stays for other countries' official languages with a lesser status, such as Arabic in Israel. Both inputs feed `blockedLanguages`.

The generator follows the disjoint lists (K2):

- A country counts as spoken-in for a prompt when the language is in its `languages`, `regionalLanguages` or `blockedLanguages`. This replaces today's `RegionalLanguages`-only predicate. Otherwise Andorra becomes a wrong option for Catalan, Bolivia and Ecuador for Quechua, and Argentina for Welsh.
- Prompts come from `regionalLanguages` alone. The official-language filter goes, because the lists are disjoint.
- `values()` for the regional attribute serves no answer type and keeps `regionalLanguages`.

Calling codes (K10):

- The importer reads mledoze `idd`:
  - root "+1" gives "+1"; root "+7" gives "+7";
  - exactly one suffix gives root plus suffix;
  - anything else fails the import unless an override covers it.
- NANP area codes, such as +1-876, are never shown.
- `overrides.callingCodes` excludes four countries. Each entry has a reason and an https source. Excluding is always fair, so these need no web research.

| Country | Code | Blocked | Reason |
| --- | --- | --- | --- |
| VA | — | +39 | Dialled through Italy's +39 06 698; +379 is assigned but unused |
| XK | — | +381, +377, +386 | +383 since 2017; the Serbian landline code and the Monaco and Slovenia mobile codes were in use before |
| PS | — | +972 | Israeli networks also serve the territories (inference; the curator confirms the source) |
| KZ | — | +7 | Shares +7 with Russia; a move to +997 is announced (guess) |

- A country without a code is contested in every calling-code question. +7 then has one holder, but RU still cannot be a calling-code referent, because KZ blocks +7.

Borders (K11):

- The importer maps mledoze `borders` from cca3 to alpha-2 and drops non-pool partners: GF, GI, EH, HK, MO.
- It fails on any asymmetry that no `remove` entry fixes.
- `overrides.borders` holds two lists:
  - `remove`: mledoze errors. The only one is LK-IN, a shoal chain with no land border.
  - `blocked`: pairs a player could argue either way. A blocked pair leaves `borders`.

  Each entry has a reason and an https source. An entry that changes nothing fails.
- Every mledoze border of XK or PS becomes blocked by an importer rule that cites the recognition rule. No pair-by-pair entries.

Blocked pairs, a draft for the curator:

| Kind | Pairs |
| --- | --- |
| Overseas or exclave territory | FR-BR, FR-SR (French Guiana); FR-NL (Saint Martin); GB-ES (Gibraltar); GB-CY (sovereign base areas); ES-MA (Ceuta, Melilla); US-CU (Guantánamo) |
| Recently settled or occupied land | DK-CA (Hans Island, 2022); MA-MR (Western Sahara) |
| Fixed links | GB-FR, DK-SE, MY-SG, BH-SA |
| Caspian shore only | AZ-KZ, AZ-TM, IR-KZ, IR-RU, RU-TM |
| Narrow straits | RU-US, RU-JP |
| Claims and recognition | IN-AF (Gilgit-Baltistan claim); AL-RS (through Kosovo) |

- Surprising but undisputed borders stay true: AZ-TR, RU-PL, RU-LT, BW-ZM, CN-AF, AO-CG.
- Explorer count for its slightly different draft: 155 subjects keep one or more unblocked borders, and 109 keep three or more.

### Ingestion pipeline

The pipeline ends at the embedded artefact, not at Postgres. Postgres stores what play produces: quizzes, questions, runs and answers (D13).

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
- No attribute's truth may depend on recognition, such as UN membership.
- A land border counts when both states agree it exists. A border a player could argue either way is blocked, never asked in either direction. Disputed alignments of an agreed border (CN-IN, IN-PK, VE-GY) stay true.
- A calling code is the ITU country code. A country whose code a player could argue is excluded from calling-code questions.
- No religion, ethnicity, heads of state or fast-changing figures.

### Decisions taken

| Decision | Alternatives weighed | Why this one |
| --- | --- | --- |
| Embedded artefact; no catalogue tables in Postgres (D13) | Catalogue tables seeded each deploy; a read-only snapshot table for SQL joins | Tables add a seed path, migrations per data edit and a second source of truth. Either way is reversible |
| Typed structs; each relation a true list plus a blocked list; language status as three disjoint lists | A fact graph with relation and status vocabularies; a relations array; a six-value status enum per pair; a relation model with a status per fact | The graph is an M-cost rewrite. Each relation's contested rule differs. The lists cost S, change no consumer, and the engine reads them in one place. The refactor trigger revisits it |
| The importer is the anti-corruption layer; no validation at `Load` | `country.Validate` at import and at `Load` | `data-check` already rejects any artefact the importer did not build |
| CLDR `territoryInfo` as a warn-only oracle | Derive statuses from CLDR; a failing lint with exception maps | CLDR shares include diaspora and immigrant languages. A failing lint would grow a third curated file |
| Fame from the 12-month dewiki pageview rank alone | de plus en sum; a blend with area and population; fame per attribute; a calibrated difficulty model | The audience reads German, and one quiz serves both locales, so one fame. Blends add weights without ground truth. Beta volume cannot fit a model |
| Subregion as mledoze's string key | An M49 code with CLDR labels | No label is shown yet. The mapping waits for a consumer that displays it |
| No cap on spoken-in lists; `blockedIn` holds diaspora | Keeping the build cap; the cap as a prompt filter; a heartland and also-spoken rewrite of 155 entries | The build cap caused truncation. As a prompt filter it would disable Quechua once Chile is added, and 11 languages sit at exactly five today. The generator's pool fallback already guarantees three wrong countries. `blockedIn` is additive |
| An https URL on curated fact entries; no dates | URL plus a checked date and a staleness report on every entry | In-scope facts rarely change, so dates are bookkeeping |
| Stored questions keep codes and reset with breaking data edits during the beta; at the public launch, after one final reset, each stored question also stores its displayed texts (K5) | Snapshot texts now; the importer refuses to drop referenced codes | Data still changes weekly, so a snapshot now costs a migration per change. Refusing drops blocks every cleanup. Changes prd-rebuild's "The database stores country codes and attribute values only" at K5 and extends D09 |
| German country and capital names follow the Auswärtiges Amt list of state names where it has an entry, else CLDR, through the existing override sections (K9) | CLDR as is; Duden | Official, consistent and neutral. Duden is no list of state names |
| Calling codes in scope from mledoze `idd`, with four excluded countries and their blocked codes | Keep `idd` rejected; VA on +39; include KZ after research | Owner request. The "leaking" argument fits TLDs, not calling codes. Excluding is always fair |
| Borders from mledoze with a blocked-pair overlay in `overrides.json` | A separate `contested-borders.json`; dropping disputed pairs at import; Wikidata P47 | A dropped pair would become "false", and NOT-neighbour would make it the correct answer. One file keeps the curation in one place. P47 mixes maritime and historical borders |

### Roadmap

Each phase ships alone. K1 goes first because it guards the rest. K2 depends on K1, because it changes what the generator reads. K3, K4 and K9 are independent.

| Phase | Horizon | Ships | Depends on | Cost |
| --- | --- | --- | --- | --- |
| K1 Question-space check | Now | One deterministic function returning each case's true, contested and false sets, shared by `Generate`, the check and the dump. The check runs in `make check`. `make data-review` prints one fixed-seed question per (type, target, prompt) as Markdown to stdout | — | M |
| K2 Honest language relation | Now | Disjoint lists, `blockedIn`, the build cap deleted, `kind` deleted, four label fixes, the 7 official-only entries deleted. The generator reads spoken-in from all three lists and prompts from `regionalLanguages`. `territoryInfo` is vendored and its diff printed. Gaps found are fixed, Quechua in Chile first. The 65 sources are backfilled: a `nico:web-researcher` agent drafts, the owner spot-checks 10% | K1 | M |
| K3 Fame from pageviews | Now | A new Wikidata query `data/sources/wikidata/articles.rq` fetches each country's dewiki sitelink, joined on ISO alpha-2 through `wdt:P297` like `capitals.rq`. The fetch script reads monthly `agent=user` views of that title over the last 12 full months into a CSV; the end month is its pin. The rank replaces area with the same cut-offs. The importer then rejects redundant `fameTiers` overrides, and lowering overrides become possible | — | S |
| K4 Subregion | Now | `subregion` on Country, read from mledoze | — | S |
| K5 Stable stored questions | Before the public launch | One final reset, then each stored question also stores its displayed texts | — | S–M |
| K6 Trap and former-name data | Next | `capital-traps.json`, `former-names.json` and their importer checks, shipped with engine E5 and E6 | K1 | S each |
| K7 Area | Later | `area` on Country, read from mledoze, for engine E8 | — | S |
| K8 More attributes | Later | Landlocked and memberships, each with its question type, once the beta shows a need for variety | — | M each |
| K9 German names | Now | A curation pass of German country and capital names against the Auswärtiges Amt list; differences land as `countryNames` and `capitalLabels` overrides with the list as source | — | S |
| K10 Calling codes | Next | `callingCode`, `blockedCallingCodes`, the `callingCodes` overrides, the invariants; shipped with engine E10 | K1 | S |
| K11 Borders | Next | `borders`, `blockedBorders`, the `borders` overrides, the XK/PS rule, the symmetry invariant; shipped with engine E12 | K1 | M |

K3's join and its failure modes:

- A sitelink names the item's own article, never a redirect or a disambiguation page.
- Views through redirect titles, such as "Kongo", are not counted. Inference: this skews few countries; the curator reads the tier diff and corrects an outlier through `fameTiers`.
- The importer fails when a pool country has no sitelink or no view count.

## Testing Decisions

- The question-space check is a Go test in `internal/quiz` over the real embedded catalogue.
  - It enumerates every type × target × prompt, a few thousand cases in milliseconds (inference).
  - It tests each case's true, contested and false sets against the raw catalogue lists, never through the shared function:
    - every true code holds the relation;
    - at least three candidates remain, or a named rule makes the case ineligible;
    - no wrong language or currency is in the target's `languages`, `regionalLanguages`, `blockedLanguages` or `currencies`, nor shares a family with one;
    - no wrong country holds the prompt language in any of its three lists;
    - no wrong continent is the target's `region` or in its `otherRegions`;
    - under a flag prompt, no wrong option is a value of a look-alike, and no two options are look-alikes;
    - no two options share a family or a de or en text;
    - every option code has de and en labels;
    - no false country is in the target's `borders` or `blockedBorders`;
    - no false country holds or blocks the prompt calling code.
- Thin pools, fewer than six candidates, go to `t.Log` as a report.
- It replaces "every type occurs in 200 seeds" as the feasibility guard. `checkRun` keeps the sampling properties.
- An importer table test loads the real sources once. Its six rows each mutate one fact:
  - a `spokenIn` country where the language is official;
  - an asymmetric look-alike;
  - a non-URL source;
  - an asymmetric border;
  - a blocked pair that is also a border after the overlay;
  - a second shared calling code besides +1.
- The CLDR diff and the review dump are reports, not tests.

## Out of Scope

- Catalogue tables in Postgres, a knowledge graph, EAV, and validation at `Load`.
- Fame per attribute and a calibrated difficulty model.
- A flag rasteriser and flag feature tags.
- New entity kinds: World Heritage sites, peaks, rivers, cities as entities.
- Demonyms, IOC codes, TLDs, official names, religion, heads of state, maritime borders.
- Checked dates and a freshness report.
- Applying play statistics to data automatically. The curator copies an accepted finding into a curated file.

## Further Notes

Scope changes against [prd-rebuild.md](prd-rebuild.md):

| Item | Change |
| --- | --- |
| Pageviews as the fame source | In scope under "Tuning after the beta"; adds a row to the Data table |
| CLDR `territoryInfo` | In scope; adds a source file under the existing CLDR row |
| Subregion | Pulls "position" from Further Notes forward, as an internal grouping key only |
| K5 stored texts | Changes the Implementation Decisions line "The database stores country codes and attribute values only" |
| Capital traps, former names | New curated sets; extend the Data table |
| Area | Stays in Further Notes until K7 |
| Calling codes | A new attribute (K10); extends the Data table |
| Borders | Pulled from Further Notes into Next (K11) by owner decision |
| Landlocked, memberships | Stay in Further Notes until K8 |

Doc changes this PRD owes:

| Doc | Change | Phase |
| --- | --- | --- |
| `docs/game-rules.md` | The capital rule, once the curator has confirmed each choice against its source | K6 |
| `docs/game-rules.md` | "The 50 largest by area are tier 1 …" becomes "the 50 most-viewed on German Wikipedia over 12 months are tier 1, ranks 51 to 120 tier 2" | K3 |
| `docs/game-rules.md` | The language bullets restate: each (country, language) pair has one status, official, regional or blocked; diaspora countries are blocked; a regional-language question's wrong options hold the language in no status; "at most five" goes | K2 |
| `data/SOURCES.md` | The `regional-languages.json` row drops "each with its kind" and names `spokenIn`, `blockedIn` and the source; the CLDR row gains `territoryInfo.json` | K2 |
| `data/SOURCES.md`, `NOTICE`, footer credit | The Wikimedia pageviews source and the sitelink query | K3 |
| `data/SOURCES.md`, the curated-file list in `NOTICE`, the `AGENTS.md` layout | `capital-traps.json` and `former-names.json` | K6 |
| `data/SOURCES.md` | The mledoze row names `idd`; the overrides row names the `callingCodes` section | K10 |
| `data/SOURCES.md` | The mledoze row names `borders`; the overrides row names the `borders` section | K11 |
| `docs/UBIQUITOUS_LANGUAGE.md` | The glossary changes below | With each term's phase |

Glossary changes for `docs/UBIQUITOUS_LANGUAGE.md`:

| Term | Definition | Avoid |
| --- | --- | --- |
| Regional language (changed) | A curated regional, minority, indigenous or creole language established in a country where it is not official. | dialect |
| Blocked language (changed) | A language with a lesser status or a community in a country; never asked about it and never a wrong option for it. | excluded language |
| Spoken-in list | A regional language's countries where it is established and not official; the possible correct answers of its question. | heartland |
| Subregion | The mledoze subregion of a country, used only to group distractors. | area, zone |
| Question space | Every question the generator can produce from the catalogue: each type, target and prompt. | question pool |
| Review dump | A Markdown listing of one fixed-seed question per case of the question space, for editorial review. | sample report |
| Fame tier (changed) | How well known a country is, from its German Wikipedia pageview rank and adjusted by a curated list. | popularity |
| Calling code | A country's ITU country code, such as +49; German copy says "Landesvorwahl". | phone code, Vorwahl |
| Blocked calling code | A code an excluded country uses in practice; it never refers to a country. | alias code |
| Neighbour | A pool country sharing an undisputed land border with another. | adjacent country |
| Blocked border | A land border a player could argue either way; never asked in either direction. | disputed border |
| Two-hop neighbour | A neighbour of a country's neighbour that is not its own neighbour; the first distractor group of neighbour questions. | ring 2 |
