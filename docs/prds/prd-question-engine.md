# PRD: Question engine

## Problem Statement

Players judge What The Flag by its questions, and today the options are too often random.
A famous target sits among obscure options, so players can answer by recognition, not knowledge.
West African flags meet East African ones, so the hard trap never forms.
Difficulty stops rising at question 16, so late questions are no harder than question 16.
Some questions give the answer away: "Hauptstadt von Singapur?" offers "Singapur".
A run can ask for the Euro three times, or repeat one type back to back.
A miss teaches nothing, because the result screen never says which country the question was about.
Every answer is stored, yet nothing measures which wrong options lure players.

## Solution

State the option rules once, as one defensible set per question, used by the generator and by the question-space check.
Draw distractors group by group: the familiar ones first early in a run, the same subregion late.
Add two variety rules, a fact card on the miss screen, and statistics that measure question quality.
Add new question types in order of fun per cost, each only when its data and rules exist.
Keep difficulty explainable: tiers, fame gates and candidate groups, with no hidden score.

## User Stories

Player:

- As a player, I see wrong options I could plausibly believe, so that I need knowledge, not elimination.
- As a player, from question 17 the wrong options come from the target's own subregion, so that a long run ends on a challenge, not on luck.
- As a player, I never get a question whose prompt contains its answer, so that every point is earned.
- As a player, I do not get the same kind of question twice in a row, so that the game feels varied.
- As a player, the miss screen tells me which country the question was about and its key facts, so that I learn something.
- As a player, I later meet new kinds of questions, such as capital traps and former names, so that replays stay fresh.

Owner:

- As the owner, I read the option rules in one table, so that I can judge fairness without reading Go.
- As the owner, `make prod-stats` shows which distractors lure players and how fast players answer, so that I tune with evidence.
- As the owner, a new value-prompt type costs a table row and its copy, so that adding one stays cheap.

## Implementation Decisions

### Option rules, stated once

A question's defensible set holds every value or country a player could argue is correct.
The correct option comes from the asked relation. No distractor comes from the defensible set.
One function computes the set. It ships with [knowledge](prd-quiz-knowledge.md) phase K1; `Generate`, the question-space check and the review dump all call it.

| Answer | Correct from | Defensible, so never a distractor |
| --- | --- | --- |
| Official language | `languages` | The target's official, regional and blocked languages, and their language families |
| Currency | `currencies` | The target's currencies and their currency families |
| Continent | `region` | `region` and `otherRegions` |
| Country (name, flag, capital) | The target | Nothing beyond the target itself |
| Country, for a regional-language prompt | A country in the spoken-in list | Every country where the language is official, regional or blocked |

These rules apply to every question:

- A flag prompt also makes every value of the target's look-alikes defensible.
- A flag question never shows two look-alikes.
- No two options show the same text in de or en, nor share a language or currency family.

All of these hold today except the shared function, which K1 extracts.

### Candidate groups

Distractors are drawn group by group. Each group is shuffled, and within a group no candidate is preferred.

| Position | Groups in order |
| --- | --- |
| Questions 1 to 16, while the fame gate excludes some countries | 1. Same continent and within the target's fame gate. 2. Same continent. 3. Rest of the pool |
| From question 17, when every fame tier is allowed | 1. Same subregion. 2. Same continent. 3. Rest of the pool |

- A value candidate, such as a language or a currency, belongs to the best group of any country holding it.
- The continent groups apply only when the continent holds at least eight countries. Today every continent does.
- Subregions hold 2 to 17 countries. A small one falls through to the continent, which is intended.

Why fame first in the early game: this is the owner's own language insight, applied to countries.
An obscure distractor makes the familiar answer easy to spot.
A familiar one can only be ruled out with knowledge.

Examples (inference, after K3):

- Question 3, flag → name, Germany: options from famous Europe, such as France, Spain and Poland, not Liechtenstein.
- Question 25, capital → name, Bratislava: Slovakia among Austria, Czechia, Hungary, Poland and Slovenia (mledoze "Central Europe").
- Question 20, flag → name, Mali: Senegal, Guinea and Burkina Faso (Western Africa), not Lesotho.

### Giveaway rule

- name → capital and capital → name skip a target whose name and capital share a word, split at spaces and hyphens, in de or en.
  This hits 18 targets (fact, from the dataset): AD, CD, CG, CL, DJ, GT, GW, KW, LK, LU, MC, MX, PA, SG, SM, ST, SV, VA.
- SV (El Salvador, San Salvador) and LK (Sri Lanka, Sri Jayawardenepura Kotte) share a word without one containing the other. So the rule compares words, not containment.
- CD, CG and CL leak only in German. One quiz serves both locales, so one language is enough to skip.
- A regional-language label that names a country is already rejected by the importer.
- There is no generic stem detector. It would also drop fair easy items, such as France → French.

### Variety rules

- No question type twice in a row.
- No language or currency is the correct answer twice within 8 positions. This removes the Euro streak (EUR is correct for 27 pool countries).
- Both rules are soft: they skip a type only when another type fits.
- `Generate` receives the quiz's stored questions instead of the set of used targets. The service already loads them.

### Difficulty

There are three levers, and all of them are explainable:

1. The type tier, unlocked by position.
2. The fame gate, opened by position.
3. The candidate groups, which follow the fame gate.

Subregion groups from question 17 add one step of difficulty without new types. After it, difficulty stays flat.
There is no item difficulty score. Each coefficient would be a guess at beta volume, and the owner could not reason about its output.
For a multi-valued answer the correct value stays a uniform draw. Romansh for Switzerland is hard but fair, because it is a national language.

### Measuring question quality

`database/stats.sql` gains two queries (E4):

- per (type, position band 1–5, 6–15, 16–30, 31+): answers, miss share, and the median response time of correct answers;
- per (type, target, option): the pick share of each distractor, with n.

Fame tier is no grouping key. It lives only in the embedded artefact, and plain-psql `stats.sql` has no catalogue table to join (D13).

What a good question is, as guesses to revise:

| Measure | Healthy | Review when |
| --- | --- | --- |
| Miss share, questions 1 to 5 | ≤ 5 % | > 10 % |
| Lure share of one distractor | ≤ 40 % | > 50 % with n ≥ 10: check defensibility or add a look-alike |
| Dead distractors of a (type, target) | Some picks | 0 picks with n ≥ 30: the candidate pool is too easy |

Later positions are reached only by strong players, so raw miss shares mix item and player.
Response time on correct answers is less biased. A skill-adjusted model waits until volume allows it.

### Fact card

- After a `wrong` or `timeout` end, the result shows the target's name, flag, capital, continent, official languages and currency units.
- A wrong country option names its country: "Deine Wahl: die Flagge von Senegal".
- A regional-language miss lists the countries where the language is official or regional.
- All text comes from the catalogue. No Wikipedia prose is shown, so no CC BY-SA obligation arises.

### Question types and modes, ranked by fun per cost

| # | Item | Kind | Fun | Cost | Needs | Phase | Scope |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Fact card | Learning | High | S | — | Now (E3) | Extends the result screen; one game-rules line |
| 2 | Familiar and same-subregion options | Option logic | High | S | K1, K3, K4 | Now (E1, E2) | In scope |
| 3 | Capital traps: from question 11, one distractor of a capital question is the target's trap city, such as Sydney for Australia | Option logic | High | M: a city option kind | K6 | Next (E5) | Modest change: a new curated set and option kind |
| 4 | Former names: "Welches Land hieß früher Ceylon?" | Type, value prompt, tier 3 | High | M: value-prompt generalisation | K6 | Next (E6) | New type in the four-option format |
| 5 | Largest by area: four same-continent countries, the largest at least 1.5 times the second | Type | Medium | S | K7 | Later (E8) | Pulls Further Notes forward |
| 6 | Neighbour: "Welches Land grenzt an Österreich?" | Type | High | M: border rules | K8 | Later (E9) | Pulls Further Notes forward |
| 7 | Landlocked: "Welches Land hat keinen Meerzugang?" | Type | Medium | S plus a Caspian rule | K8 | Later (E9) | Pulls Further Notes forward |
| 8 | EU membership, driving side | Type | Medium | M: data changes over time | K8 | Later (E9) | Pulls Further Notes forward |
| 9 | Flag property: "Welche Flagge zeigt einen Halbmond?" | Type | Medium | M–L: 197 tags | Flag features | Later (E9) | New curated axis |
| 10 | Themed quiz, such as one continent | Mode on the existing quiz model | Medium | M | — | Later (E9) | Scope change |

Not planned:

| Item | Why |
| --- | --- |
| Daily quiz | prd-rebuild Out of Scope |
| Practice mode | L cost; the fact card gives most of its learning value |
| Either-or and estimate | A 50 % guess or a tolerance clashes with sudden death |
| Map tap | Needs Natural Earth shapes and a new UI; microstates are untappable |
| Speed run | Fights the 300 ms rule and network fairness |
| World Heritage sites, peaks, rivers | A new entity kind with L cost |

Capital trap rules (E5):

- A trap is a curated city of the target only, never of another country.
- A trap is never a correct answer and never a pool country's primary capital. The importer checks both.
- A seat of government, such as La Paz for Bolivia, is defensible and never a trap. The importer rejects a trap that equals a validated secondary capital.
- A question shows at most one trap, whenever the target has one. It appears from question 11, when the position unlocks tier 3, on every capital-answer type, name → capital included.
- A trap is stored as a synthetic option code such as `city:AU`, resolved through the curated labels.

Value-prompt generalisation (E6):

- `Question.Prompt` becomes a typed reference: a kind plus a code.
- A small table per kind gives its values, labels and defensible sets.
- The presenter asks the core for display text instead of repeating the mapping.
- The SQL ties `prompt` to the set of value-prompt types, not to one type id.
- Former names is its first new user. Regional languages move onto it.

### Decisions taken

| Decision | Alternatives weighed | Why this one |
| --- | --- | --- |
| Ordered candidate groups | Weighted similarity sampling with a position-dependent sharpness; three closeness levels L1 to L3 | S cost, explainable, testable. The alternatives rest on about seven guessed weights or on deferred data |
| Difficulty from tiers, fame gates and groups | An item difficulty prior with a target schedule; offline calibration; fame per attribute | Beta volume cannot fit coefficients. Tiers stay documented and reversible |
| A shared-word check for the two capital–name types, despite the earlier KISS cut of a build-time giveaway filter | A five-letter stem detector over all types; word containment; no rule | The cut rejected a generic filter over every type. This rule is one word comparison on two types, deterministic, with a fixed list of 18 targets the check pins. A free point such as Singapur is a fairness defect players notice. Containment would miss SV and LK |
| Two soft variety rules | Breathers every sixth question; type weights favouring the top tier | Each alternative is a second difficulty mechanism without evidence |
| Grow look-alikes by hand from lure shares | Rasterised flag similarity; curated flag features with a closed-world list | The beta shows real confusions at no build cost |
| A curated list of about 25 capital traps | Wikidata largest-city and former-capital batches; a city entity keyed by QID | Population ranks produce dull traps, such as Pointe-Noire. A hand list picks famous ones |
| Generalise value prompts at the second such type | Generalise now | One user does not justify the table. Former names is the trigger |
| A uniform correct value for multi-valued answers | Weights from CLDR speaker shares; a primary subset | Shares are noisy. A primary subset waits for player reports (knowledge PRD) |

### Roadmap

Each phase ships alone. E1 to E4 need no new question type.

| Phase | Horizon | Ships | Depends on | Cost |
| --- | --- | --- | --- | --- |
| E1 Fair, familiar options | Now | Fame-first candidate groups, the giveaway rule | K1 (the shared defensible function); better after K3 | S |
| E2 Late ramp and variety | Now | Subregion groups from question 17; the two variety rules | K4 | S |
| E3 Fact card | Now | Result payload, presenter, UI and copy in de and en | — | S–M |
| E4 Measurement | Now | Two `stats.sql` queries | — | S |
| E5 Capital traps | Next | Trap option kind and its rules | K6 | M |
| E6 Value prompts and former names | Next | Prompt reference, attribute table, the former-names type | K6 | M |
| E7 Evidence-driven tuning | Next | New look-alike pairs, primary currencies, fame overrides; continent types dropped late if they prove trivial | E4 data | S each |
| E8 Largest by area | Later | Ranked type 5 | K7 | S |
| E9 New formats | Later | Ranked types 6 to 10 | K8 for types 6 to 8; flag features for type 9 | M each |

### Open decisions

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| 1 | When to pull Further Notes types forward | Now; after the beta; when stats show a need | After four weeks of E4 data, if late runs show repetition or trivial continent questions. Start with largest by area (K7, E8): S cost each, no rule debt |
| 2 | Whether themed quizzes get their own leaderboard | Own global board per theme; quiz leaderboard only | Quiz leaderboard only, so a small player base is not split. It is a scope change either way |

## Testing Decisions

- The question-space check ([knowledge](prd-quiz-knowledge.md) K1) asserts the option rules table for every case against the raw catalogue lists, not through the shared function.
  It also asserts the giveaway skip, and that traps and seats are never correct.
- `checkRun` keeps the sampling properties over seeded runs:
  - the tier and fame gates;
  - no repeated target;
  - the two variety rules;
  - before question 17, country distractors come from the target's continent and fame gate whenever that group holds three;
  - each correct index from 0 to 3 lands between 20 % and 30 % of the time.
- The fact card extends the `run-finished` contract golden. A frontend test renders it through `FakeApi`.
- `stats.sql` gets no test: it is a report.

## Out of Scope

- A difficulty model, calibration from answers, and generate-and-rank selection.
- Weighted similarity sampling and a language-family proximity map.
- Practice mode, daily quiz, either-or, estimate, map tap, speed run.
- Breather questions and type weights.
- A generic eponymy or stem detector.
- A question report button. It is a scope change, revisited before the public launch.
- Time budgets per type. They are revisited if E4 shows long-option types timing out more often.

## Further Notes

Scope changes against [prd-rebuild.md](prd-rebuild.md):

| Item | Change |
| --- | --- |
| Candidate groups, variety rules, giveaway rule, fact card | In scope; game-rules.md changes |
| Capital traps | A new curated set and option kind; extends the Data table |
| Former names | A new question type in the existing format |
| Largest by area, neighbour, landlocked, memberships | Further Notes items, moved into scope only at E8 and E9 |
| Themed quiz | A new mode; needs a PRD entry |

Doc changes this PRD owes:

- `docs/README.md` gains a row for this PRD.
- `docs/game-rules.md`:
  - "Wrong options come from the target's continent …" becomes the two-row candidate-group rule (E1, E2).
  - "Within the allowed tiers, the type is drawn at random" gains the two variety rules (E2).
  - New lines: the defensible-set rule in one sentence and the giveaway rule (E1).
  - The result paragraph gains the fact card (E3).
  - A capital question from question 11 may offer the target's trap city (E5).
  - The capital rule and the language status rules are listed in the [knowledge PRD](prd-quiz-knowledge.md).
- `docs/UBIQUITOUS_LANGUAGE.md` gains the terms below.

New terms for `docs/UBIQUITOUS_LANGUAGE.md`:

| Term | Definition | Avoid |
| --- | --- | --- |
| Defensible set | Every value or country a player could argue is correct for a question; no distractor comes from it. | blocked set |
| Candidate group | One ordered tier of possible distractors, such as same subregion; groups are drawn in order. | proximity level |
| Fame gate | The least famous fame tier a position allows for targets and first-group distractors. | fame filter |
| Giveaway | A question whose name and capital share a word, so the prompt gives away the answer; it is never asked. | eponym |
| Fact card | The target's key facts shown on the result screen after a miss. | info box |
| Capital trap | A famous city of the target that players take for its capital; offered only as a distractor. | decoy city |
| Former name | A name a country had before, used as a prompt whose answer is the country. | old name |
| Value prompt | A prompt that shows an attribute value, not a country attribute, such as a regional language. | reverse question |
| Lure share | The share of answers to a question that picked one given distractor. | pick rate |
