# PRD: Question engine

## Problem Statement

Players judge What The Flag by its questions, and today the options are too often random.
A famous target sits among obscure options, so players can answer by recognition, not knowledge.
West African flags meet East African ones, so the hard trap never forms.
Difficulty stops rising at question 16.
Some questions give the answer away: "Hauptstadt von Singapur?" offers "Singapur".
A run can ask for the Euro three times, or repeat one type back to back.
A miss teaches nothing, because the result screen never says which country the question was about.
Every answer is stored, yet nothing measures which wrong options lure players.

## Solution

State the option rules once, as one defensible set per question, used by the generator and by the question-space check.
Draw distractors group by group: the familiar ones first early in a run, the same subregion late.
Add two variety rules, a fact card on the miss screen, and statistics that measure question quality.
Add new question types in order of fun per cost, each only when its data and rules exist.
Keep difficulty explainable. One table of ten levels sets, per level, a window of type tiers, a fame ceiling, candidate groups and a NOT cap. There is no hidden score.

## User Stories

Player:

- As a player, I see wrong options I could plausibly believe, so that I need knowledge, not elimination.
- As a player, the quiz climbs one level every five questions, from level 1 to level 10, so that a long run gets harder until only the hardest questions remain.
- As a player, from question 16 the wrong options come from the target's own subregion, so that a long run ends on a challenge, not on luck.
- As a player, I never get a question whose prompt contains its answer, so that every point is earned.
- As a player, I do not get the same kind of question twice in a row, so that the game feels varied.
- As a player, a NOT question is marked where I look, so that I lose to my knowledge, not to a misread.
- As a player, the miss screen tells me which country the question was about and its key facts, so that I learn something.
- As a player, I later meet new kinds of questions, such as calling codes, neighbours, capital traps and former names, so that replays stay fresh.

Owner:

- As the owner, I read the option rules in one table, so that I can judge fairness without reading Go.
- As the owner, `make prod-stats` shows which distractors lure players and how fast players answer, so that I tune with evidence.
- As the owner, a new value-prompt type costs a table row and its copy, so that adding one stays cheap.

## Implementation Decisions

### Option rules, stated once

Every case splits its option codes into three disjoint sets:

- **True set:** codes that hold the asked relation beyond dispute.
- **Contested set:** codes a player could argue either way. They are never an option.
- **False set:** every other code. Options from it are drawn through the candidate groups.

The defensible set is the true set plus the contested set.
One function, `candidates()`, computes this split. `Generate`, the question-space check and the review dump all call it.

| Answer | True set | Contested set |
| --- | --- | --- |
| Country itself (name, flag, capital) | The target | Under a flag prompt or flag answer: the target's look-alikes |
| Continent | `region` | `otherRegions` |
| Official language | `languages` | `regionalLanguages`, `blockedLanguages`, and every language sharing a family with a true or contested one |
| Currency | `currencies` | Every currency sharing a family with a true one |
| Calling code (K10) | `callingCode` | — |
| Neighbour (K11) | `borders` | `blockedBorders`; the target; countries sharing a name word with the target |
| Country, regional-language prompt | Countries with the language in `regionalLanguages` | Countries with it in `languages` or `blockedLanguages` |
| Country, calling-code prompt | Countries holding the code | Countries whose `blockedCallingCodes` hold it; every country without a code |
| Country, continent prompt | Countries whose `region` is the prompt | Countries whose `otherRegions` hold it |
| Country, currency prompt | Countries whose every currency carries the prompt's unit label in de and en | Other holders of a currency in the prompt's family |

These rules apply to every question:

- A flag prompt also makes every true value of the target's look-alikes contested.
- A flag question never shows two look-alikes.
- No two options show the same text in de or en, nor share a language or currency family.

### Question model

- An **attribute** is one kind of fact about a country: name, flag, capital, continent, official language, currency, regional language, calling code (K10), neighbour (K11) or former name (K6).
- A **question type** has five parts: a prompt attribute, an answer attribute, a polarity (positive or NOT), a tier from 1 to 10 and a fame cap from 1 to 3.
- **Prompt kinds:**
  - A subject prompt shows the target by name, flag or capital.
  - A value prompt shows a value whose answer is a country: a regional language, calling code, continent, currency or former name.
  - A referring prompt names the target by flag, capital or calling code and asks a further fact, such as flag → currency. It has one referent and one relation, never more.
- **Case:** `Case{Type, Target, Prompt}`.
  - The target is the country the question is about. The fact card shows it, and it is a target once per quiz.
  - The prompt is the shown code ("+49", "EUR", "Africa", a language code) for value prompts and calling-code referents. Otherwise it is empty.
- `candidates(cat, case, level)` returns the split into true, contested and false sets. Only the order of the false groups depends on the level.
- `Draw(cat, case, level, rnd)` builds the question:
  - **Positive:** the correct option is the target when the true set holds it, else a uniform draw from the true set. The three distractors are the first fitting false codes over the shuffled groups.
  - **NOT:** the three wrong options come from the true set, through the level's candidate groups relative to the target. The correct option is the target for a value prompt, else the first fitting false code over the groups.
  - The rules between pairs of options do not depend on polarity.
- **Case eligibility** follows from the set sizes:
  - a positive case needs one true code and three fitting false codes;
  - a NOT case needs three fitting true codes and one fitting false code.

  Named rules come on top: the giveaway rule, referent uniqueness, the fame cap and the currency-NOT rule.
- **Storage** is unchanged: `Question{Type, Target, Prompt, Options[4], Correct}`.
  - `Correct` is the option to pick. In a NOT question it is the option that does not hold the relation.
  - `Prompt` stores the shown code even when it can be derived, so a data edit never changes a stored question.
  - There is no new column. Each batch of types rewrites the type CHECK and the prompt CHECK `(prompt IS NOT NULL) = (type IN (<value-prompt and calling-code-referent types>))`.
- **Type ids:** `<prompt>_<answer>`. A NOT type is `<prompt>_not_<answer>`.
- **Presenter:**
  - A non-empty prompt shows the label for the prompt attribute's kind. A calling code is its own label in de and en.
  - Neighbour options show country names.
  - The wire does not change.
- **Value prompts:** the prompt attribute (`Type.Prompt`) names the kind of a value prompt, so no typed prompt reference exists. `calling_code_name` (E10), the second value-prompt type, lands this rule; former names (E6) reuse it.

### Polarity

Polarity is a generation axis of the type table, not a coin flip per question.
A NOT type is its own row, with its own tier, sentence and fame cap.
A NOT form reads slower, so it sits 1 to 4 tiers above its positive form.
The generator draws it at random like any type in the level's window, under the NOT cap of the variety rules.

A type gets a NOT variant only when all three hold:

1. **Many-valued:** for some targets, the true set holds at least three members.
2. **Checkable:** the true set is a sourced, closed list a player can verify.
3. **No complement:** the NOT question is not just the positive question about the opposite fact.

| Types | NOT variant | Reason |
| --- | --- | --- |
| `flag_name`, `name_flag`, `name_capital`, `capital_name`, `flag_capital`, `capital_flag` | No | The true set is the target alone |
| `name_region`, `flag_region`, `capital_region` | No | One continent is true |
| `name_currency`, `flag_currency`, `capital_currency` | No | 186 of 197 countries have one currency (fact) |
| `name_language` | `name_not_language`: tier 8, fame cap 1 | 22 countries have at least 3 official languages (fact); the family rule thins them further |
| `flag_language`, `capital_language` | No | A referent plus NOT over 22 subjects is too little volume |
| `regional_language_name` | No | Fails rule 2: players cannot verify three "spoken in" facts |
| `name_calling_code`, `calling_code_name`, `calling_code_capital` | No | One code per country; only +1 has three holders |
| `name_neighbour`, `capital_neighbour`, `calling_code_neighbour` | `name_not_neighbour` (tier 6), `capital_not_neighbour` (tier 9, fame cap 2), `calling_code_not_neighbour` (tier 10, fame cap 1) | 109 subjects keep at least 3 unblocked neighbours (explorer count over a draft of the blocked pairs) |
| Continent prompt → country | `region_not_name` only, tier 5 | The positive form repeats `name_region` |
| `currency_name` | `currency_not_name`: tier 7 | 11 currency families have at least 3 pure holders (fact) |
| `former_name_name`, largest by area | No | One-to-one; a superlative |
| Landlocked | No | Fails rule 3: NOT landlocked means "has a coast" |

Referring prompts:

- NOT negates the relation, never the referent. A question holds at most one NOT.
- NOT on a referring prompt starts at tier 9, behind fame caps.
- A flag never refers in a NOT type.

Wording and UI:

- German uses NICHT, never KEIN or KEINE. English uses NOT. Both are uppercase in the `messages.ts` sentence.
- The question card shows a NICHT/NOT pill attached to the prompt card.
  - Its accent colour is neither the error red nor the success colour.
  - The frontend marks a type as negated when its id contains `_not_`.
- Landlocked copy says "Binnenstaat", never "keinen Meerzugang".

### Candidate groups

Distractors are drawn group by group. Each group is shuffled, and within a group no candidate is preferred, except on a NOT question's true side.

| Levels | Groups in order |
| --- | --- |
| 1–3, "familiar" | 1. Same continent, within the level's fame ceiling. 2. Same continent. 3. Rest of the pool |
| 4–10, "subregion" | 1. Same subregion. 2. Same continent. 3. Rest of the pool |
| Every level, neighbour answers | 1. Two-hop: neighbours of the target's neighbours. 2. Same subregion. 3. Same continent. 4. Rest of the pool |

- A value candidate, such as a language, currency or calling code, belongs to the best group of any country holding it.
- The continent groups apply only when the continent holds at least eight countries. Today every continent does.
- Subregions hold 2 to 17 countries. A small one falls through to the continent, which is intended.
- In a NOT question, the true side uses the same groups relative to the target, with the more famous fame tier first within a group.

Why fame first in the early game: this is the owner's own language insight, applied to countries.
An obscure distractor makes the familiar answer easy to spot.
A familiar one can only be ruled out with knowledge.

Examples (inference, after K3):

- Question 3, flag → name, Germany: options from famous Europe, such as France, Spain and Poland, not Liechtenstein.
- Question 20, capital → name, Bamako: Senegal, Guinea and Burkina Faso (Western Africa), not Lesotho.
- Question 28, `name_not_neighbour`, Germany: Austria, Poland, France and Liechtenstein. Liechtenstein is correct and comes from the two-hop group.

### Giveaway rule

- name → capital and capital → name skip a target whose name and capital share a word, split at spaces and hyphens, in de or en.
  This hits 18 targets (fact, from the dataset): AD, CD, CG, CL, DJ, GT, GW, KW, LK, LU, MC, MX, PA, SG, SM, ST, SV, VA.
- SV (El Salvador, San Salvador) and LK (Sri Lanka, Sri Jayawardenepura Kotte) share a word without one containing the other. So the rule compares words, not containment.
- CD, CG and CL leak only in German. One quiz serves both locales, so one language is enough to skip.
- A regional-language label that names a country is already rejected by the importer.
- There is no generic stem detector. It would also drop fair easy items, such as France → French.
- In a neighbour question, a country that shares a name word with the target is contested, such as CG/CD, SD/SS and GN/GW/GQ.

### Variety rules

- No question type twice in a row.
- No language or currency is the correct answer twice within 8 positions. This removes the Euro streak (fact: EUR is correct for 27 pool countries).
- The NOT cap: at most the level's NOT maximum among a position and the four before it, and never two NOT questions in a row.
- All rules are soft: they skip a type only when another type fits.
- `Generate` receives the quiz's stored questions instead of the set of used targets.

### Difficulty

There is one ladder: `level = min(10, 1 + position/5)` over the 0-based position. Level 10 starts at question 46.
Each level sets four levers: a window of type tiers, a fame ceiling, the candidate groups and the NOT cap.
Besides the window, each level changes at most one lever.

**Level table.** "Types" counts the window twice: over the 29 types of the type tier table, after E15, and over today's 16.

| Level | Questions | Type tiers | Types (after E15 / today) | Fame ceiling | Groups | NOT max in 5 | NOT types in the window | Referring prompts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1–5 | 1 | 3 / 3 | 1 | familiar | 0 | — | — |
| 2 | 6–10 | 1–2 | 6 / 6 | 1 | familiar | 0 | — | flag |
| 3 | 11–15 | 1–3 | 9 / 8 | 2 | familiar | 0 | — | flag, capital |
| 4 | 16–20 | 2–4 | 9 / 8 | 2 | subregion | 0 | — | flag, capital |
| 5 | 21–25 | 3–5 | 9 / 5 | 2 | subregion | 1 | `region_not_name` | flag, capital |
| 6 | 26–30 | 4–6 | 9 / 4 | 3 | subregion | 1 | `region_not_name`, `name_not_neighbour` | flag, capital |
| 7 | 31–35 | 5–7 | 9 / 5 (tiers 4–7) | 3 | subregion | 1 | `region_not_name`, `name_not_neighbour`, `currency_not_name` | flag, capital |
| 8 | 36–40 | 6–8 | 10 / 4 | 3 | subregion | 1 | `name_not_neighbour`, `currency_not_name`, `name_not_language` | flag, capital, calling code |
| 9 | 41–45 | 7–9 | 10 / 4 | 3 | subregion | 1 | `currency_not_name`, `name_not_language`, `capital_not_neighbour` | flag, capital, calling code; capital with NOT |
| 10 | 46+ | 8–10 | 8 / 4 (tiers 7–10) | 3 | subregion | 2 | `name_not_language`, `capital_not_neighbour`, `calling_code_not_neighbour` | flag, capital, calling code; capital and calling code with NOT |

**Type tiers.** A type without a fame cap allows fame 3. Later types take the tier of the ranked list below.

| Tier | Types | Fame cap | Phase |
| --- | --- | --- | --- |
| 1 | `flag_name`, `name_flag`, `name_region` | — | Today |
| 2 | `name_capital`, `capital_name`, `flag_region` | — | Today |
| 3 | `name_currency`, `capital_region` | — | Today |
| 3 | `name_neighbour` | — | E12 |
| 4 | `flag_capital`, `capital_flag`, `name_language` | — | Today |
| 5 | `name_calling_code`, `calling_code_name` | 1 | E10 |
| 5 | `region_not_name` | — | E11 |
| 6 | `flag_currency` | — | Today |
| 6 | `currency_name` | — | E14 |
| 6 | `name_not_neighbour` | — | E12 |
| 7 | `capital_currency` | — | Today |
| 7 | `capital_neighbour` | — | E12 |
| 7 | `currency_not_name` | — | E14 |
| 8 | `flag_language`, `capital_language` | — | Today |
| 8 | `calling_code_capital` | 1 | E13 |
| 8 | `name_not_language` | 1 | E15 |
| 9 | `regional_language_name` | — | Today |
| 9 | `calling_code_neighbour` | 1 | E13 |
| 9 | `capital_not_neighbour` | 2 | E12 |
| 10 | `calling_code_not_neighbour` | 1 | E13 |

**Selection** is type-first:

1. Build the window: tiers L−2 to L. While it holds fewer than four types, extend it one tier down, as far as tier 1.
2. Shuffle the window and drop the types a soft rule skips.
3. Take the first type with an unused target whose fame tier is within both the level's ceiling and the type's cap.
4. Pick the target uniformly, then its case uniformly.
5. If no type fits:
   - retry without the level's ceiling;
   - then retry with any type.

   The type's fame cap always holds. `flag_name` fits every target, so the `completed` end stays reachable.

Further rules:

- Type-first selection keeps the stated shares true. NOT and neighbour types fit only some targets.
- Moving a type to another tier changes only `Types` and game-rules.md. Stored rows hold type ids, so no migration is needed.
- There is no item difficulty score. Each coefficient would be a guess at beta volume, and the owner could not reason about its output.
- For a multi-valued answer, the correct value stays a uniform draw. Romansh for Switzerland is hard but fair, because it is a national language.

Examples (inference):

- Question 3, level 1: "Welche Flagge hat dieses Land? [Frankreich]".
- Question 22, level 5: "Welche Landesvorwahl hat dieses Land? [Polen]" offers +48, +420, +421 and +36. `flag_name` has left the window.
- Question 47, level 10: "Welches Land grenzt NICHT an das Land mit dieser Landesvorwahl? [+49]" offers Österreich, Frankreich, Polen and Liechtenstein, which is correct.

### Measuring question quality

`database/stats.sql` gains two queries (E4):

- Per (type, level): answers, miss share, timeout share, and the median response time of correct answers. The level is computed from the stored position, as in Difficulty.
- Per (type, target, option): the pick share of each distractor, with n.

Fame tier is no grouping key. It lives only in the embedded artefact, and plain-psql `stats.sql` has no catalogue table to join (D13).

What a good question is, as guesses to revise:

| Measure | Healthy | Review when |
| --- | --- | --- |
| Miss share, level 1 | ≤ 5 % | > 10 % |
| Lure share of one distractor | ≤ 40 % | > 50 % with n ≥ 10: check defensibility or add a look-alike |
| Dead distractors of a (type, target) | Some picks | 0 picks with n ≥ 30: the candidate pool is too easy |

Later positions are reached only by strong players, so raw miss shares mix item and player.
Response time on correct answers is less biased. A skill-adjusted model waits until volume allows it.

Time budget:

- Every type has 15 seconds.
- A per-type budget lands only when E4 shows a type's timeout share at least twice the median type's at the same level.
- The budget change would be backend-only (explorer finding: the wire carries the limit per question).

### Fact card

- After a `wrong` or `timeout` end, the result shows the target's name, flag, capital, continent, official languages and currency units.
  - The calling code joins with E10; the neighbours join with E12.
- A wrong country option names its country: "Deine Wahl: die Flagge von Senegal".
- A regional-language miss lists the countries where the language is official or regional.
- A miss on a referring prompt needs no extra line: the target line resolves the referent ("+49" → Deutschland).
- After a NOT miss, the target's facts show why the three wrong options held the relation.
- All text comes from the catalogue. No Wikipedia prose is shown, so no CC BY-SA obligation arises.

### Question types and modes, ranked by fun per cost

| # | Item | Tier | Fun | Cost | Needs | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Fact card | — | High | S | — | Now (E3) |
| 2 | Familiar and same-subregion options; the level ladder | — | High | S | K1, K3, K4 | Now (E1, E2) |
| 3 | Calling codes: "Welche Landesvorwahl hat Polen?", "Aus welchem Land kommt ein Anruf mit dieser Landesvorwahl? [+43]" | 5 | High in Europe | S | K10 | Next (E10) |
| 4 | First NOT type: "Welches Land liegt NICHT auf diesem Kontinent? [Afrika]". It is easy by design and teaches the format | 5 | Medium | S | E1, E2 | Next (E11) |
| 5 | Neighbours and NOT neighbours, by name and by capital | 3, 6, 7, 9 | Highest | M | K11, E11 | Next (E12) |
| 6 | Calling-code referents: capital, neighbour, NOT neighbour of "+49" | 8–10 | High at levels 8–10 | S | E10, E12 | Next (E13) |
| 7 | Currency prompts: "In welchem Land zahlt man mit dieser Währung? [Peso]", "… NICHT … [Euro]" | 6, 7 | High | S | E11 | Next (E14) |
| 8 | Capital traps | From level 3 | High | M | K6 | Next (E5) |
| 9 | Former names: "Welches Land hieß früher Ceylon?" | 5 | High | S | K6, E10 | Next (E6) |
| 10 | "Welche Sprache ist NICHT Amtssprache dieses Landes? [Schweiz]" | 8 | Medium; few subjects | S | E11 | Next (E15) |
| 11 | Largest by area | 6 | Medium | S | K7 | Later (E8) |
| 12 | Landlocked: "Welches Land ist ein Binnenstaat?" | 4 | Medium | S plus a Caspian rule | K8 | Later (E9) |
| 13 | Borders-both: "Welches Land grenzt an Frankreich UND an Österreich?" | 7 | High | S plus a two-country prompt | E12 | Later (E9) |
| 14 | EU membership, driving side | — | Medium | M | K8 | Later (E9) |
| 15 | Flag property; flag odd-one-out by continent | — | Medium | M–L | Flag features, E11 | Later (E9) |
| 16 | Themed quiz, such as one continent | Mode | Medium | M | — | Later (E9) |

Copy for the new types (de / en):

| Type | de | en |
| --- | --- | --- |
| `name_calling_code` | Welche Landesvorwahl hat dieses Land? | Which country calling code does this country have? |
| `calling_code_name` | Aus welchem Land kommt ein Anruf mit dieser Landesvorwahl? | Which country does a call with this country calling code come from? |
| `calling_code_capital` | Welche Hauptstadt hat das Land mit dieser Landesvorwahl? | What is the capital of the country with this country calling code? |
| `name_neighbour` / `capital_neighbour` / `calling_code_neighbour` | Welches Land grenzt an dieses Land? / … an das Land mit dieser Hauptstadt? / … an das Land mit dieser Landesvorwahl? | Which country borders this country? / … the country with this capital? / … the country with this country calling code? |
| `*_not_neighbour` | Welches Land grenzt NICHT an … | Which country does NOT border … |
| `region_not_name` | Welches Land liegt NICHT auf diesem Kontinent? | Which country is NOT on this continent? |
| `currency_name` / `currency_not_name` | In welchem Land zahlt man (NICHT) mit dieser Währung? | In which country do people (NOT) pay with this currency? |
| `name_not_language` | Welche Sprache ist NICHT Amtssprache dieses Landes? | Which language is NOT an official language of this country? |

Rules per new form:

- **Calling code** (E10):
  - A target needs a code and fame 1.
  - For a +1 prompt, no other NANP country is ever an option.
  - The copy always says "Landesvorwahl", because "Vorwahl von Berlin" means 030.
- **Calling-code referent** (E13):
  - A code refers only when exactly one country holds it and no country blocks it. This excludes +1, +7, +39, +377, +381, +386 and +972.
  - There is no calling code → continent type: the zone digit gives it away.
- **Neighbour** (E12):
  - "grenzt an" means a land border.
  - A positive case needs one unblocked neighbour; a NOT case needs three.
  - XK and PS have only blocked borders, so they are never subjects. TW has no land border.
  - The correct option of a positive question is a uniform draw.
- **Continent NOT** (E11):
  - The target is the odd one out, and the prompt is a continent outside its `region` and `otherRegions`.
  - The three true options come from the rest group, famous tier first.
- **Currency prompt** (E14):
  - A positive target holds the prompt currency.
  - A NOT target lies outside the defensible set, and its continent holds at least three true members. Denmark meets Finland, Ireland and Estonia for the Euro; Japan never does.
- **Language NOT** (E15):
  - The subject has fame 1 and at least three official languages with distinct families.
  - The odd one out comes from the value groups, such as Luxemburgisch for Switzerland.

Not planned:

| Item | Why |
| --- | --- |
| Daily quiz | prd-rebuild Out of Scope |
| Practice mode | L cost; the fact card gives most of its learning value |
| Either-or and estimate | A 50 % guess or a tolerance clashes with sudden death |
| Map tap | Needs Natural Earth shapes and a new UI; microstates are untappable |
| Speed run | Fights the 300 ms rule and network fairness |
| World Heritage sites, peaks, rivers | A new entity kind with L cost |
| Flag or capital → calling code | One memorised fact on top of another, with no reasoning. Calling-code referents give the same depth better |
| Same calling code, same currency, same language as X | Only US-CA and RU-KZ share a code; the Euro and English make the rest trivial |
| Neighbour count | Blocked pairs make the count disputable |
| Calling code → currency or language | No player value beyond the neighbour and capital referents |
| Subregion odd-one-out | Players do not know mledoze subregion names |

Capital trap rules (E5):

- A trap is a curated city of the target only, never of another country.
- A trap is never a correct answer and never a pool country's primary capital. The importer checks both.
- A seat of government, such as La Paz for Bolivia, is defensible and never a trap. The importer rejects a trap that equals a validated secondary capital.
- A question shows at most one trap, whenever the target has one. It appears from level 3 (question 11), on every capital-answer type, name → capital included.
- A trap is stored as a synthetic option code such as `city:AU`, resolved through the curated labels.

### Decisions taken

| Decision | Alternatives weighed | Why this one |
| --- | --- | --- |
| Ordered candidate groups | Weighted similarity sampling with a position-dependent sharpness; three closeness levels L1 to L3 | S cost, explainable, testable. The alternatives rest on about seven guessed weights or on deferred data |
| One ladder of ten levels, a level every five questions, each a window of three tiers | Cumulative tiers; a 16-type ladder spread over 10 tiers; a table of knobs per level; rating a case by type plus target fame | Owner decision. The window drops easy types, so level 10 asks only tiers 8–10. Spreading today's 16 types would make every question from question 36 a language question. A case rating needs guessed coefficients |
| A window holds at least four types and extends downward | A clamp to the highest tier; empty levels | One loop keeps every level playable while tiers are empty, today at tiers 5 and 10 |
| Fame stays three tiers, with a ceiling per level and a cap per type | `fameRank` 1..197 with ceilings 25 to 160 | A rank needs seven guessed ceilings and re-keyed overrides. Caps cover the real problem: calling codes and NOT questions about obscure countries become lotteries |
| Type-first selection | Target-first | NOT and neighbour types fit only some targets. With target-first, their share would depend on chance |
| Polarity as a property of each type | A NOT coin flip over every type; no NOT | 11 of 16 types have one true member. A coin flip makes the share uncontrollable. Each NOT form needs its own sentence and tier |
| An explicit NOT cap per level; never two NOT in a row | A share derived from the window | Under sudden death a NOT miss is usually a misread. The share players feel must not move when tiers move |
| True, contested and false sets from K1 on | One defensible set, split at the first NOT type | The case and the check change once, not twice. `valueOptions` already separates own and blocked values |
| Two-hop neighbours first for neighbour answers | Subregion only | It is the natural closeness of a border relation and costs one set union. It yields the Liechtenstein trap for Germany |
| Referring prompts of depth one; NOT only on the relation | Deeper chains; a negated referent | Readable in 15 seconds. One negation per question |
| Calling-code referents and calling-code types at fame 1 | Rank ≤ 60 or ≤ 30; a curated set of familiar codes | Reuses the existing tiers. Tuning follows E4 lure shares |
| NICHT in uppercase plus a pill on the prompt card, in a non-error accent | Uppercase only; a red frame | Players look at the prompt card. Red already means "wrong" after an answer |
| 15 seconds for every type | Budgets per type | Raised only by the E4 timeout trigger |
| A shared-word check for the two capital–name types and neighbour options | A five-letter stem detector over all types; word containment; no rule | A filter over every type drops fair items, such as France → French. This rule is one word comparison, deterministic, with a list the check pins. Containment would miss SV and LK |
| Two soft variety rules plus the NOT cap | Breathers every sixth question; type weights favouring the top tier | Each alternative is a second difficulty mechanism without evidence |
| Grow look-alikes by hand from lure shares | Rasterised flag similarity; curated flag features with a closed-world list | The beta shows real confusions at no build cost |
| A curated list of about 25 capital traps | Wikidata largest-city and former-capital batches; a city entity keyed by QID | Population ranks produce dull traps, such as Pointe-Noire. A hand list picks famous ones |
| Value prompts generalise at `calling_code_name`, the second value-prompt type; no typed prompt reference | A typed reference with a kind | The prompt attribute already names the kind |
| A uniform correct value for multi-valued answers | Weights from CLDR speaker shares; a primary subset | Shares are noisy. A primary subset waits for player reports (knowledge PRD) |
| Owner-requested forms (E10–E15) start after the "now" programme, with no wait for E4. E8 and E9 wait four weeks for E4 statistics | Wait for run-length data first | Owner decision. E4 then tunes the step size of 5 and the caps |
| A themed quiz counts only on its quiz leaderboard | A global board per theme | A small player base stays on one board; revisited at E9 |

### Roadmap

Each phase ships alone. E1 to E4 need no new question type.

| Phase | Horizon | Ships | Depends on | Cost |
| --- | --- | --- | --- | --- |
| E1 Fair options and the level ladder | Now | True, contested and false sets; the level table; today's 16 types on tiers 1–9; type-first selection; familiar groups; the giveaway rule | K1; better after K3 | S |
| E2 Subregion groups and variety | Now | Subregion groups from level 4; the two variety rules | K4 | S |
| E3 Fact card | Now | Result payload, presenter, UI and copy in de and en | — | S–M |
| E4 Measurement | Now | Two `stats.sql` queries: per (type, level), with timeout share, and per (type, target, option) | — | S |
| E5 Capital traps | Next | Trap option kind and its rules | K6 | M |
| E6 Former names | Next | `former_name_name` on the value-prompt rule | K6, E10 | S |
| E7 Evidence-driven tuning | Next | New look-alike pairs, primary currencies, fame overrides, tier moves, the step size | E4 data | S each |
| E8 Largest by area | Later | Ranked type 11 | K7 | S |
| E9 New formats | Later | Ranked types 12 to 16 | K8 for 12 and 14; E12 for 13; flag features for 15 | M each |
| E10 Calling codes | Next | `name_calling_code`, `calling_code_name`; the value-prompt rule; the code on the fact card | K10, E1 | S |
| E11 Negation | Next | NOT types, Draw's NOT branch, the NOT cap, the NICHT/NOT pill; `region_not_name` | E1, E2 | S |
| E12 Neighbours | Next | `name_neighbour`, `name_not_neighbour`, `capital_neighbour`, `capital_not_neighbour`; two-hop groups; neighbours on the fact card | K11, E11 | M |
| E13 Calling-code referents | Next | `calling_code_capital`, `calling_code_neighbour`, `calling_code_not_neighbour`; the referent uniqueness rule | E10, E12 | S |
| E14 Currency prompts | Next | `currency_name`, `currency_not_name` | E11 | S |
| E15 Language NOT | Next | `name_not_language` | E11 | S |

## Testing Decisions

- The question-space check ([knowledge](prd-quiz-knowledge.md) K1 and its Testing Decisions) tests every case against the raw catalogue lists, not through `candidates()`. True plus contested must equal the raw defensible set.
- It draws each case once with a fixed seed, at the level equal to its type's tier, and checks the rules between options.
  - In a NOT case, the three wrong options hold the relation beyond dispute, and the correct option lies outside the defensible set.
  - It also checks the giveaway skip, calling-code referent uniqueness, and that traps and seats are never correct.
- `checkRun` keeps the sampling properties over seeded runs:
  - while more than 20 targets remain unused, each type lies in its level's window, extension included;
  - each target lies within its type's fame cap, and within the level's fame ceiling while such targets remain;
  - no repeated target; the variety rules; the NOT cap and no two NOT questions in a row;
  - at levels 1 to 3, country distractors come from the target's continent within the fame ceiling whenever that group holds three;
  - each correct index from 0 to 3 lands between 20 % and 30 % of the time.
- The fact card extends the `run-finished` contract golden. A frontend test renders it through `FakeApi`.
- From E11 on, one play test finds the NICHT pill on a NOT question through `FakeApi`.
- `stats.sql` gets no test: it is a report.

## Out of Scope

- A difficulty model, calibration from answers, generate-and-rank selection, and a fame rank finer than three tiers.
- Weighted similarity sampling and a language-family proximity map.
- Practice mode, daily quiz, either-or, estimate, map tap, speed run.
- Breather questions and type weights.
- A generic eponymy or stem detector.
- A question report button. It is a scope change, revisited before the public launch.
- A NOT coin flip per question, double negation, a negated referent, and referring prompts deeper than one referent.
- Maritime neighbours.
- Time budgets per type, until the E4 timeout trigger fires.

## Further Notes

Scope changes against [prd-rebuild.md](prd-rebuild.md):

| Item | Change |
| --- | --- |
| Level ladder, candidate groups, variety rules, giveaway rule, fact card | In scope; game-rules.md changes |
| Capital traps | A new curated set and option kind; extends the Data table |
| Former names, calling codes, currency prompts, NOT types | New question types in the existing four-option format |
| Neighbours | Pulled from Further Notes into Next (E12) by owner decision |
| Largest by area, landlocked, memberships | Further Notes items, in scope only at E8 and E9 |
| Themed quiz | A new mode; needs a PRD entry |

Doc changes this PRD owes:

- `docs/game-rules.md`:
  - The tier table and the two position lines become the level table, the type tier table and the fame ceilings (E1).
  - "Wrong options come from the target's continent …" becomes the familiar and subregion group rule (E1, E2).
  - "Within the allowed tiers, the type is drawn at random" gains the variety rules (E2) and the NOT cap (E11).
  - New lines: the defensible-set sentence and the giveaway rule (E1).
  - The result paragraph gains the fact card (E3).
  - A capital question from level 3 may offer the target's trap city (E5).
  - "A calling code is the ITU country code, such as +49; the NANP countries share +1" (E10).
  - "A NOT question shows three options that hold the relation; the correct option is the one that does not" (E11).
  - "Neighbours share a land border both states agree on; a border a player could argue either way is never asked" (E12).
- `docs/UBIQUITOUS_LANGUAGE.md` gains the terms below.

New and changed terms for `docs/UBIQUITOUS_LANGUAGE.md`:

| Term | Definition | Avoid |
| --- | --- | --- |
| Level | The difficulty step of a position, 1 to 10, one per five questions; it sets the type window, fame ceiling, candidate groups and NOT cap. | stage, band |
| Question type (changed) | A prompt attribute, an answer attribute, a polarity, a difficulty tier and a fame cap, e.g. flag to capital. | mode, quiz mode |
| Difficulty tier (changed) | How hard a question type is, 1 to 10; a level asks the tiers of its type window. | level |
| Type window | The tiers a level asks: L−2 to L, extended down until it holds four types. | tier range |
| Fame ceiling | The least famous fame tier a level allows for targets and first-group distractors. | fame gate |
| Fame cap | The least famous fame tier a question type allows for its targets at any level. | fame limit |
| Defensible set | The true set plus the contested set: every value or country a player could argue is correct. | blocked set |
| True set | The option codes that hold a question's relation beyond dispute. | correct set |
| Contested set | The option codes a player could argue either way; never an option. | grey set |
| Candidate group | One set of possible options, such as same subregion; groups are drawn in order. | proximity level |
| NOT question | A question whose correct option is the one that does not hold the relation; its type id contains `_not_`. | negative question, inverse question |
| Referring prompt | A prompt that names the target by flag, capital or calling code and asks a further fact about it. | chain |
| Giveaway | A question whose prompt gives the answer away through a shared name word; it is never asked, and in neighbour questions such a country is never an option. | eponym |
| Fact card | The target's key facts shown on the result screen after a miss. | info box |
| Capital trap | A famous city of the target that players take for its capital; offered only as a distractor. | decoy city |
| Former name | A name a country had before, used as a prompt whose answer is the country. | old name |
| Value prompt | A prompt that shows an attribute value whose answer is a country, such as a regional language or a calling code. | reverse question |
| Lure share | The share of answers to a question that picked one given distractor. | pick rate |
