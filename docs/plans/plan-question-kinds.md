# Plan: Question kinds

> Source PRD: docs/prds/prd-question-engine.md (E10–E15) and docs/prds/prd-quiz-knowledge.md (K10, K11)
>
> Runs after docs/plans/plan-anonymous-player.md and docs/plans/plan-quiz-domain-now.md. Every phase relies on what they build:
> - migration `000006`, so this plan's migration is `000007`;
> - `Cases()`, `Draw()` and `candidates()` with true, contested and false sets;
> - `TestQuestionSpace`, its checker table of rule-breaking questions, `TestImporterRejects` and `make data-review`;
> - the level table, type-first selection, the four-type window extension and the giveaway word check;
> - subregion groups, the variety rules, and `Generate` over the stored questions;
> - the fact card payload `fact` and its screen;
> - disjoint language lists and fame from pageviews.

## Goal

Ship the six owner-requested question forms, each with its data, rules, copy and docs:
- calling codes (K10, E10);
- NOT questions, starting with the continent NOT (E11);
- neighbours and NOT neighbours (K11, E12);
- calling-code referents (E13);
- currency prompts (E14);
- the language NOT (E15).

After the last phase the quiz holds 29 question types over its ten levels.

## Architectural decisions

- **Type model.** `QuestionType` in `backend/internal/quiz/question.go` grows:
  - `FameCap int` in phase 1: 1 to 3, and every uncapped type lists 3;
  - `PromptStored() bool` in phase 1: true when the prompt attribute is not name, flag or capital;
  - `Not bool` in phase 2: `ID()` then returns `<prompt>_not_<answer>`.
- **New attributes.** `AttrCallingCode` (`calling_code`) lands in phase 1, `AttrNeighbour` (`neighbour`) in phase 3. A neighbour option is a country code, shown by its name.
- **New types.**

  | Type id | Tier | Fame cap | Prompt stored | Phase |
  | --- | --- | --- | --- | --- |
  | `name_calling_code` | 5 | 1 | no | 1 |
  | `calling_code_name` | 5 | 1 | yes | 1 |
  | `region_not_name` | 5 | 3 | yes | 2 |
  | `name_neighbour` | 3 | 3 | no | 3 |
  | `name_not_neighbour` | 6 | 3 | no | 3 |
  | `capital_neighbour` | 7 | 3 | no | 3 |
  | `capital_not_neighbour` | 9 | 2 | no | 3 |
  | `calling_code_capital` | 8 | 1 | yes | 4 |
  | `calling_code_neighbour` | 9 | 1 | yes | 4 |
  | `calling_code_not_neighbour` | 10 | 1 | yes | 4 |
  | `currency_name` | 6 | 3 | yes | 5 |
  | `currency_not_name` | 7 | 3 | yes | 5 |
  | `name_not_language` | 8 | 1 | no | 6 |

- **Migration.** `database/migrations/000007_question_kinds.up.sql` lands in phase 1 with every id above. One transaction rewrites two constraints:
  - `quiz_questions_type_check` to the 16 current ids plus the 13 new ones;
  - `quiz_questions_prompt_check` to `(prompt IS NOT NULL) = (type IN (…))` over the eight prompt-stored types, `regional_language_name` included.

  No later phase touches `database/migrations/`. The type ids are fixed.
- **Fame cap.** `Cases` omits a case whose target is less famous than its type's cap. Every selection fallback keeps the cap.
- **Calling-code labels.** `country.LabelCallingCode` joins the label kinds. `Catalogue.Label` returns a code some pool country holds as its own de and en text. `Family` returns "".
- **Value prompts.** `Question.Prompt` holds the shown code of every prompt-stored type. `presenter.question()` has one branch for it: a non-empty prompt shows `p.label()` of the prompt attribute's `LabelKind()`.
- **NOT drawing**, as in the engine PRD's question model:
  - the three wrong options come from the true set, through the level's groups relative to the target, famous fame tier first;
  - the correct option is the target for a value prompt, else the first fitting false code over the groups.
- **NOT cap.** The level table gains a NOT maximum: 0 at levels 1–4, 1 at levels 5–9, 2 at level 10.
  - It counts a position and the four before it.
  - A NOT question never follows a NOT question.
  - Both rules are soft, like the variety rules.
- **Neighbour groups.** A neighbour answer uses, at every level: two-hop neighbours, same subregion, same continent, rest of the pool.
- **Fact card.** `fact` gains `callingCode` (string, null for an excluded country) in phase 1. It gains `neighbours` (`[{de,en}]` in `borders` order) in phase 3.
  A NOT miss needs no further field. The card's continent, currencies, languages and neighbours already explain the wrong options.
- **NOT pill.** `QuestionCard` shows a NICHT/NOT pill on the prompt when the type id contains `_not_`. It uses the `warning` colour token, never `destructive` or `success`.
- **Overrides.** Both new sections live in `data/overrides.json`:
  - `callingCodes`: `{ "VA": { "blocked": ["+39"], "reason": "…", "source": "https://…" } }`. An entry removes the country's code and sets its blocked codes.
  - `borders`: `{ "remove": [{ "pair": ["IN", "LK"], "reason", "source" }], "blocked": [{ "pair", "reason", "source" }] }`.
- **Copy** in `frontend/src/features/play/messages.ts`:

  | Type | de | en |
  | --- | --- | --- |
  | `name_calling_code` | Welche Landesvorwahl hat dieses Land? | Which country calling code does this country have? |
  | `calling_code_name` | Aus welchem Land kommt ein Anruf mit dieser Landesvorwahl? | Which country does a call with this country calling code come from? |
  | `region_not_name` | Welches Land liegt NICHT auf diesem Kontinent? | Which country is NOT on this continent? |
  | `name_neighbour` | Welches Land grenzt an dieses Land? | Which country borders this country? |
  | `name_not_neighbour` | Welches Land grenzt NICHT an dieses Land? | Which country does NOT border this country? |
  | `capital_neighbour` | Welches Land grenzt an das Land mit dieser Hauptstadt? | Which country borders the country with this capital? |
  | `capital_not_neighbour` | Welches Land grenzt NICHT an das Land mit dieser Hauptstadt? | Which country does NOT border the country with this capital? |
  | `calling_code_capital` | Welche Hauptstadt hat das Land mit dieser Landesvorwahl? | What is the capital of the country with this country calling code? |
  | `calling_code_neighbour` | Welches Land grenzt an das Land mit dieser Landesvorwahl? | Which country borders the country with this country calling code? |
  | `calling_code_not_neighbour` | Welches Land grenzt NICHT an das Land mit dieser Landesvorwahl? | Which country does NOT border the country with this country calling code? |
  | `currency_name` | In welchem Land zahlt man mit dieser Währung? | In which country do people pay with this currency? |
  | `currency_not_name` | In welchem Land zahlt man NICHT mit dieser Währung? | In which country do people NOT pay with this currency? |
  | `name_not_language` | Welche Sprache ist NICHT Amtssprache dieses Landes? | Which language is NOT an official language of this country? |

- **Phase order.** Every phase touches the same choke files:
  - `backend/internal/quiz/question.go`, `options.go` and `questionspace_test.go`;
  - `frontend/src/features/play/api.ts` and `messages.ts`;
  - the `question-types` golden.

  So the phases run in sequence in one lane. The PRD's own needs are weaker: E13 needs E10 and E12; E12, E14 and E15 need E11.
- **Integration commands** pass `POSTGRES_DB="$POSTGRES_DB"` on every make command line. Inside make, `.env` beats the environment.
- **Named subtests.** Rows of the `TestQuestionSpace` checker table and of `TestImporterRejects` run as `t.Run(<row name>)`.
  A phase that finds them otherwise converts the table first.
- **Raw-list oracles.** Each new `candidates()` row adds its own raw-list oracle to `TestQuestionSpace`'s defensible-set computation.

## Inventory

- `backend/internal/quiz/question.go — QuestionType, QuestionType.ID(), Types, Attr, answerText(), values(), labelKind()` — the type table every phase extends.
- `backend/internal/quiz/options.go — Case, Cases(), Draw(), candidates()` — the option rules; new answer and prompt rows land here.
- `backend/internal/quiz/generate.go — Generate(), level()` and its level table — type-first selection, the fame cap and the NOT cap.
- `backend/internal/quiz/questionspace_test.go — TestQuestionSpace` and its checker table — raw-list checks per case.
- `backend/internal/quiz/generate_test.go — TestGenerate(), checkRun(), sharedPool` — seeded sampling checks.
- `backend/internal/quiz/postgres/repository_integration_test.go — TestEveryTypeFitsTheSchema()` — pins `Types` against both CHECKs; sets a prompt only for `AttrRegionalLanguage` today.
- `database/migrations/000005_regional_language_question.up.sql` — the CHECK pattern `000007` repeats.
- `backend/internal/country/schema.go — Country`; `catalogue.go — Catalogue.Label(), Catalogue.Family(), LabelKind`.
- `backend/cmd/importdata/sources.go — mledozeCountry, overrides, readMledoze()`; `build.go — build(), validate()`; `build_test.go — TestImporterRejects`.
- `data/sources/mledoze-countries/countries.json` — vendored `idd`, `cca3` and `borders`. Fact: only VA's `idd` has two suffixes outside +1 and +7; 13 pool countries have root +1; LK→IN is the only pool asymmetry.
- `data/overrides.json`, `data/SOURCES.md`.
- `backend/cmd/datareview/main.go` — the review dump; headings read `## <typeId> <target> [<prompt>]`.
- `backend/internal/quiz/httpapi/present.go — presenter.question(), presenter.option(), presenter.label(), countryItem()` and the `fact` payload.
- `backend/internal/contract/golden_test.go — TestQuestionTypes()`; `testdata/question-types.json`, `testdata/run-finished.json` (target DE). Regenerate with `cd backend && go test -tags=integration ./internal/contract -update`.
- `frontend/src/features/play/api.ts — questionTypes`, the `fact` schema; `messages.ts — questions`; `question-card.tsx — QuestionCard`; `run-result.tsx`; `play.test.tsx`; `fake-run.ts`.
- `frontend/src/test/api-contract.test.ts` — parses every golden and compares `questionTypes` with `question-types.json`.
- `frontend/src/index.css` — the `warning` colour token.
- `docs/game-rules.md` — the level table and the type tier table; `docs/UBIQUITOUS_LANGUAGE.md`.

## Open questions / Risks

- **Phases outside this plan.** Each needs its own plan:
  - E5 capital traps and E6 former names, with their data K6;
  - E7 evidence-driven tuning;
  - K5 stable stored questions, before the public launch;
  - the Later phases E8, E9, K7 and K8.
- **Curated judgements (phases 1 and 3).** The PS reason is an inference and the KZ reason a guess; excluding stays fair either way.
  The blocked-pair list is the PRD's draft. The owner reviews it after the run; it does not count as verified.
- **Network.** The vendored mledoze file already holds `idd` and `borders` (fact). Only the source research needs the network.
- **Explorer counts.** "109 subjects keep three or more neighbours" came from a slightly different draft. The importer and `TestQuestionSpace` decide; a different count is reported, not forced.
- **Thin NOT types.** `name_not_language` has few subjects: fame 1 and three official languages of distinct families. Each phase logs thin cases through `TestQuestionSpace`. A NOT type with no eligible case stops its phase.
- **Database.** Phase 1 applies `000007` to the lane database. It only widens the CHECKs, so stored rows stay valid. Staging is disposable.
- **Shifting windows.** New tiers fill the level windows, for example tier 5 from phase 1. `checkRun` reads the windows from `Types`, so no boundary is hard-coded.

## Phase 1: Calling codes (K10, E10)

**Depends on**: none

### Context

- `backend/cmd/importdata/sources.go — mledozeCountry, overrides`; `build.go — build(), validate()`; `build_test.go — TestImporterRejects`.
- `backend/internal/country/schema.go — Country`; `catalogue.go — Catalogue.Label(), LabelKind`.
- `backend/internal/quiz/question.go — QuestionType, Types, Attr, answerText(), values(), labelKind()`; `options.go — Cases(), candidates()`; `generate.go — Generate()`.
- `backend/internal/quiz/questionspace_test.go — TestQuestionSpace`; `generate_test.go — checkRun()`; `postgres/repository_integration_test.go — TestEveryTypeFitsTheSchema()`.
- `database/migrations/` — new `000007_question_kinds.up.sql`.
- `backend/internal/quiz/httpapi/present.go — presenter.question(), presenter.option()` and the `fact` payload.
- `backend/internal/contract/testdata/question-types.json`, `run-finished.json`.
- `frontend/src/features/play/api.ts`, `messages.ts`, `run-result.tsx`, `play.test.tsx`, `fake-run.ts`.
- `data/overrides.json`, `data/SOURCES.md`, `docs/game-rules.md`, `docs/UBIQUITOUS_LANGUAGE.md`.

### What to build

- **Data.**
  - `mledozeCountry` reads `idd`. Root "+1" gives "+1" and root "+7" gives "+7". Exactly one suffix gives root plus suffix.
  - Anything else fails the import unless a `callingCodes` override covers the country.
  - `overrides.callingCodes` excludes VA, XK, PS and KZ with the blocked codes of the knowledge PRD's table. Each entry needs a reason and an https source. A no-op entry fails.
  - Each source is the ITU or national assignment page for the country. Excluding is always fair, so no research pass runs.
  - `Country` gains `CallingCode string` (`callingCode`) and `BlockedCallingCodes []string` (`blockedCallingCodes`) after `Currencies`. `blockedCallingCodes` is always emitted. Run `make data`.
  - `validate` gains two invariants: +1 is the only code with several holders; a blocked code is never the country's own.
  - `TestImporterRejects` gains the row `second_shared_calling_code`: a second country on +49 must be rejected.
- **Migration.** Add `000007_question_kinds.up.sql` as in the decisions, then run `make POSTGRES_DB="$POSTGRES_DB" db-migrate`. `go tool sqlc generate` should change nothing.
- **Engine.**
  - `QuestionType` gains `FameCap` and `PromptStored()`. `Cases` drops cases above the cap; `Generate` keeps the cap in every fallback.
  - `AttrCallingCode` and `country.LabelCallingCode` land as in the decisions.
  - `name_calling_code` and `calling_code_name` join `Types`, tier 5, fame cap 1.
  - `candidates()` gains two rows:
    - calling-code answer: true is `callingCode`; a target without a code has no case;
    - calling-code prompt: true is every holder; contested is every country blocking the code and every country without one.
- **Checks.**
  - `TestQuestionSpace` asserts against the raw lists: no false country holds or blocks the prompt code; every case's target is within its type's fame cap.
  - The checker table gains `nanp_holder_as_option`: a `calling_code_name` question on +1 offering CA beside US.
  - `checkRun` asserts a stored prompt exactly for `PromptStored()` types. `TestEveryTypeFitsTheSchema` sets a prompt for those types.
  - `checkRun` asserts at every position, exhaustion included, that the target's fame is within its type's `FameCap`.
  - New `TestFameCapHolds` in `generate_test.go` runs seeded runs over `sharedPool` to exhaustion. No `name_calling_code` or `calling_code_name` question may have a target with fame above 1.
- **API.**
  - Export `Attr.LabelKind()`. `presenter.option()` and the value-prompt branch use it; the presenter's own attribute switch for value kinds goes.
  - `presenter.question()` takes the one value-prompt branch. `presenter.option()` shows a calling code as its own text.
  - `fact` gains `callingCode`. Regenerate the goldens.
- **UI.**
  - `questionTypes` and both sentences per locale join `api.ts` and `messages.ts`.
  - The fact schema gains `callingCode`; the fact card shows it when it is not null.
  - A play test named "shows the calling code on the fact card" finds "+49" through `FakeApi`.
- **Docs.**
  - `docs/game-rules.md`: "A calling code is the ITU country code, such as +49; the NANP countries share +1."
  - Also there: calling-code questions ask only about fame tier 1 countries; VA, XK, PS and KZ have no calling code in the quiz.
  - The type tier table gains a fame-cap column and the two tier-5 rows.
  - `data/SOURCES.md`: the mledoze row names `idd`; the overrides row names the `callingCodes` section.
  - Glossary: add "Calling code", "Blocked calling code", "Fame cap" and "Value prompt" from the PRDs.

### Acceptance criteria

- [ ] `jq -e '([.countries[] | select(.callingCode == "+1")] | length == 13) and ([.countries[] | select(.code == "DE") | .callingCode] == ["+49"]) and ([.countries[] | select((.code | IN("VA","XK","PS","KZ")) and ((.callingCode // "") == "") and (.blockedCallingCodes | length > 0))] | length == 4)' backend/internal/country/dataset/countries.json`
- [ ] `cd backend && go test ./cmd/importdata/ -run '^TestImporterRejects$' -count=1 -v | grep -q -- '--- PASS: TestImporterRejects/second_shared_calling_code'`
- [ ] `diff <(grep -oE "'[a-z_]+'" database/migrations/000007_question_kinds.up.sql | tr -d "'" | sort -u) <(printf '%s\n' flag_name name_flag name_region name_capital capital_name flag_region name_currency flag_capital capital_flag name_language capital_region flag_currency flag_language capital_currency capital_language regional_language_name name_calling_code calling_code_name region_not_name name_neighbour name_not_neighbour capital_neighbour capital_not_neighbour calling_code_capital calling_code_neighbour calling_code_not_neighbour currency_name currency_not_name name_not_language | sort)`
- [ ] `diff <(awk '/ADD CONSTRAINT quiz_questions_prompt_check/{f=1} f; f && /;/{exit}' database/migrations/000007_question_kinds.up.sql | grep -oE "'[a-z_]+'" | tr -d "'" | sort -u) <(printf '%s\n' regional_language_name calling_code_name region_not_name calling_code_capital calling_code_neighbour calling_code_not_neighbour currency_name currency_not_name | sort)`
- [ ] `make -s data-review | awk '/^## (name_calling_code|calling_code_name) /{print $3}' | sort -u | jq -Rse --slurpfile d backend/internal/country/dataset/countries.json '(split("\n") | map(select(. != ""))) as $t | [$d[0].countries[] | select(.code | IN($t[])) | .fame] | length > 0 and all(. == 1)'`
- [ ] `cd backend && go test ./internal/quiz/ -count=1 -v | grep -q -- '--- PASS: .*/nanp_holder_as_option'`
- [ ] `cd backend && go test ./internal/quiz/ -run '^TestFameCapHolds$' -count=1 -v | grep -q -- '--- PASS: TestFameCapHolds'`
- [ ] `jq -e '.result.fact.callingCode == "+49"' backend/internal/contract/testdata/run-finished.json && jq -e 'index("name_calling_code") and index("calling_code_name")' backend/internal/contract/testdata/question-types.json`
- [ ] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'calling code on the fact card' --reporter=json --outputFile=/tmp/kinds-vitest.json && jq -e '.numPassedTests >= 1' /tmp/kinds-vitest.json`
- [ ] `grep -q 'ITU country code' docs/game-rules.md && grep -q 'idd' data/SOURCES.md && test "$(grep -cE '^\| (Calling code|Blocked calling code|Fame cap|Value prompt) \|' docs/UBIQUITOUS_LANGUAGE.md)" -eq 4`
- [ ] Final gate: `make check && GOFLAGS=-count=1 make POSTGRES_DB="$POSTGRES_DB" be-integration`

## Phase 2: Negation and the continent NOT (E11)

**Depends on**: 1

### Context

- `backend/internal/quiz/question.go — QuestionType, QuestionType.ID(), Types`; `options.go — Cases(), Draw(), candidates()`; `generate.go — Generate(), level()` and its level table.
- `backend/internal/quiz/questionspace_test.go — TestQuestionSpace`; `generate_test.go — checkRun(), sharedPool`.
- `backend/internal/contract/testdata/question-types.json`.
- `frontend/src/features/play/api.ts`, `messages.ts`, `question-card.tsx — QuestionCard`, `play.test.tsx`, `fake-run.ts`; `frontend/src/index.css`.
- `docs/game-rules.md`, `docs/UBIQUITOUS_LANGUAGE.md`.

### What to build

- **Engine.**
  - `QuestionType` gains `Not`; `ID()` inserts `_not_`.
  - `Draw` gains the NOT branch of the decisions. A NOT case needs three fitting true codes and one fitting false code.
  - The pairwise option rules stay the same for both polarities.
  - `region_not_name` joins `Types`, tier 5. Its cases are each target with each continent outside its `region` and `otherRegions`.
  - `candidates()` gains the continent-prompt row: true is every country whose `region` is the prompt; contested is every country with it in `otherRegions`.
  - The level table gains the NOT maximum. `Generate` skips a NOT type over the cap or right after a NOT question, unless no other type fits.
- **Checks.**
  - `TestQuestionSpace` asserts for every NOT case: the three wrong options lie in the raw true set; the correct option lies outside the raw defensible set.
  - The checker table gains `not_option_outside_true_set`: a `region_not_name` question whose wrong option lies outside the prompt continent.
  - New `TestNotCap` in `generate_test.go` runs seeded runs over the real catalogue. While more than 20 targets remain unused, it asserts:
    - at most the level's NOT maximum among a position and the four before it;
    - no two NOT questions in a row.

    It also asserts that some NOT question occurred, so it cannot pass vacuously.
- **UI.**
  - `region_not_name` and its sentences join `api.ts` and `messages.ts`. NICHT and NOT stay uppercase in the sentence.
  - `QuestionCard` shows the pill of the decisions; `messages.ts` gains its label "NICHT" / "NOT".
  - A play test named "shows the NICHT pill on a NOT question" finds the pill through `FakeApi`.
- **Docs.**
  - `docs/game-rules.md`: "A NOT question shows three options that hold the relation; the correct option is the one that does not."
  - Also there: the level table gains the NOT maximum column; the type tier table gains `region_not_name`.
  - Glossary: add "NOT question"; rewrite "Question type" to the engine PRD's five-part definition.

### Acceptance criteria

- [ ] `make -s data-review > /tmp/kinds-review.md && grep -qF '## region_not_name JP [Africa]' /tmp/kinds-review.md && ! grep -qE '^## region_not_name RU \[(Europe|Asia)\]' /tmp/kinds-review.md`
- [ ] `cd backend && go test ./internal/quiz/ -run '^TestNotCap$' -count=1 -v | grep -q -- '--- PASS: TestNotCap'`
- [ ] `cd backend && go test ./internal/quiz/ -count=1 -v | grep -q -- '--- PASS: .*/not_option_outside_true_set'`
- [ ] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'NICHT pill' --reporter=json --outputFile=/tmp/kinds-vitest.json && jq -e '.numPassedTests >= 1' /tmp/kinds-vitest.json`
- [ ] `grep -q 'A NOT question shows three options that hold the relation' docs/game-rules.md && grep -qE '^\| NOT question \|' docs/UBIQUITOUS_LANGUAGE.md && grep -qE '^\| Question type \|.*polarity' docs/UBIQUITOUS_LANGUAGE.md`
- [ ] Final gate: `make check && GOFLAGS=-count=1 make POSTGRES_DB="$POSTGRES_DB" be-integration`

## Phase 3: Neighbours (K11, E12)

**Depends on**: 2

### Context

- `backend/cmd/importdata/sources.go — mledozeCountry, overrides`; `build.go — build(), validate()`; `build_test.go — TestImporterRejects`.
- `backend/internal/country/schema.go — Country`.
- `backend/internal/quiz/question.go — Attr, Types, answerText()`; `options.go — Cases(), Draw(), candidates()` and the giveaway word check.
- `backend/internal/quiz/questionspace_test.go — TestQuestionSpace`; `generate_test.go — checkRun()`.
- `backend/internal/quiz/httpapi/present.go — presenter.option()` and the `fact` payload.
- `backend/internal/contract/testdata/question-types.json`, `run-finished.json`.
- `frontend/src/features/play/api.ts`, `messages.ts`, `run-result.tsx`, `play.test.tsx`, `fake-run.ts`.
- `data/overrides.json`, `data/SOURCES.md`, `docs/game-rules.md`, `docs/UBIQUITOUS_LANGUAGE.md`.

### What to build

- **Data.**
  - `mledozeCountry` reads `cca3` and `borders`. The importer maps them to alpha-2 and drops the non-pool partners GF, GI, EH, HK and MO.
  - It fails on any asymmetry that no `remove` entry fixes. The only `remove` entry is IN-LK.
  - `blocked` holds the PRD's draft pairs. A blocked pair leaves `borders` on both sides.
  - Every mledoze border of XK or PS becomes blocked by one importer rule that cites the recognition rule.
  - Each entry needs a reason and an https source; a `nico:web-researcher` agent drafts the sources. An entry that changes nothing fails.
  - `Country` gains `Borders` and `BlockedBorders` (`borders`, `blockedBorders`), sorted and always emitted. Run `make data`.
  - `validate` gains the invariant: borders symmetric and disjoint from blocked borders.
  - `TestImporterRejects` gains the rows `asymmetric_border` and `blocked_pair_also_border`.
  - `blocked_pair_also_border` mutates the built countries, adding a blocked partner to `borders`, and calls `validate`. The importer removes blocked pairs, so no source mutation reaches the invariant.
- **Engine.**
  - `AttrNeighbour` lands. `name_neighbour` (tier 3), `name_not_neighbour` (6), `capital_neighbour` (7) and `capital_not_neighbour` (9, fame cap 2) join `Types`.
  - `candidates()` gains the neighbour row. True is `borders`; contested is `blockedBorders`, the target and every country sharing a name word with it.
  - A border partner sharing a name word is contested, not true, such as CG for CD.
  - A positive case needs one true neighbour; its correct option is a uniform draw. A NOT case needs three.
  - Neighbour answers use the neighbour groups of the decisions at every level.
- **Checks.**
  - `TestQuestionSpace` asserts against the raw lists: no false country is in the target's `borders` or `blockedBorders`.
  - It also asserts that XK, PS and TW are never the target of a neighbour case.
  - The checker table gains `neighbour_sharing_name_word` (CG offered for CD) and `blocked_border_as_option` (XK offered for AL).
  - `checkRun` shows neighbour options by country name and exempts neighbour answers from the familiar-group assertion. `name_neighbour` is tier 3, so level-3 runs reach it.
- **API.** `presenter.option()` shows a neighbour option by the country's name. `fact` gains `neighbours`. Regenerate the goldens.
- **UI.**
  - The four types and their sentences join `api.ts` and `messages.ts`.
  - The fact schema gains `neighbours`; the fact card lists them when there are any.
  - A play test named "lists the neighbours on the fact card" finds one neighbour's name through `FakeApi`.
- **Docs.**
  - `docs/game-rules.md`: "Neighbours share a land border both states agree on; a border a player could argue either way is never asked."
  - The type tier table gains the four rows.
  - `data/SOURCES.md`: the mledoze row names `borders`; the overrides row names the `borders` section.
  - Glossary: add "Neighbour", "Blocked border" and "Two-hop neighbour"; change "Giveaway" to cover neighbour options.

### Acceptance criteria

- [ ] `jq -e '([.countries[] | select(.code == "DE") | .borders | index("AT")] | .[0] != null) and ([.countries[] | select(.code == "LK") | .borders] == [[]]) and ([.countries[] | select(.code == "XK") | (.borders == []) and (.blockedBorders | length > 0)] == [true])' backend/internal/country/dataset/countries.json`
- [ ] `test "$(cd backend && go test ./cmd/importdata/ -run '^TestImporterRejects$' -count=1 -v | grep -cE -- '--- PASS: TestImporterRejects/(asymmetric_border|blocked_pair_also_border) ')" -eq 2`
- [ ] `make -s data-review > /tmp/kinds-review.md && test "$(grep -oE '^## (name|capital)_(not_)?neighbour ' /tmp/kinds-review.md | sort -u | wc -l)" -eq 4 && grep -qE '^## name_not_neighbour DE( |$)' /tmp/kinds-review.md && ! grep -qE '^## [a-z_]*neighbour (XK|PS|TW)( |$)' /tmp/kinds-review.md`
- [ ] `test "$(cd backend && go test ./internal/quiz/ -count=1 -v | grep -cE -- '--- PASS: .*/(neighbour_sharing_name_word|blocked_border_as_option) ')" -eq 2`
- [ ] `jq -e '[.result.fact.neighbours[].de] | index("Österreich")' backend/internal/contract/testdata/run-finished.json`
- [ ] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx -t 'neighbours on the fact card' --reporter=json --outputFile=/tmp/kinds-vitest.json && jq -e '.numPassedTests >= 1' /tmp/kinds-vitest.json`
- [ ] `grep -q 'land border both states agree on' docs/game-rules.md && grep -q 'borders' data/SOURCES.md && test "$(grep -cE '^\| (Neighbour|Blocked border|Two-hop neighbour) \|' docs/UBIQUITOUS_LANGUAGE.md)" -eq 3`
- [ ] Final gate: `make check && GOFLAGS=-count=1 make POSTGRES_DB="$POSTGRES_DB" be-integration`

## Phase 4: Calling-code referents (E13)

**Depends on**: 3

### Context

- `backend/internal/quiz/question.go — Types`; `options.go — Cases(), candidates()`.
- `backend/internal/quiz/questionspace_test.go — TestQuestionSpace`.
- `backend/internal/contract/testdata/question-types.json`.
- `frontend/src/features/play/api.ts`, `messages.ts`.
- `docs/game-rules.md`, `docs/UBIQUITOUS_LANGUAGE.md`.

### What to build

- **Engine.**
  - `calling_code_capital` (tier 8), `calling_code_neighbour` (9) and `calling_code_not_neighbour` (10) join `Types`, each with fame cap 1.
  - The prompt is the target's calling code. The answer rows are the capital and neighbour rows already in `candidates()`.
  - Referent uniqueness: a code refers only when exactly one country holds it and no country blocks it.
  - So +1, +7, +39, +377, +381, +386 and +972 never refer.
  - There is no calling code → continent type.
- **Checks.** `TestQuestionSpace` asserts referent uniqueness against the raw lists for every calling-code referent case.
- **UI.** The three types and their sentences join `api.ts` and `messages.ts`.
- **Docs.**
  - `docs/game-rules.md`: "A calling code names a country only when exactly one country holds it and no country uses it in practice."
  - The type tier table gains the three rows.
  - Glossary: add "Referring prompt".

### Acceptance criteria

- [ ] `make -s data-review > /tmp/kinds-review.md && test "$(grep -oE '^## calling_code_(capital|neighbour|not_neighbour) ' /tmp/kinds-review.md | sort -u | wc -l)" -eq 3 && grep -qF '## calling_code_capital DE [+49]' /tmp/kinds-review.md && ! grep -qE '^## calling_code_(capital|neighbour|not_neighbour) [A-Z]{2} \[\+(1|7|39|377|381|386|972)\]' /tmp/kinds-review.md`
- [ ] `grep -q 'A calling code names a country only when exactly one country holds it' docs/game-rules.md && grep -qE '^\| Referring prompt \|' docs/UBIQUITOUS_LANGUAGE.md`
- [ ] Final gate: `make check && GOFLAGS=-count=1 make POSTGRES_DB="$POSTGRES_DB" be-integration`

## Phase 5: Currency prompts (E14)

**Depends on**: 4

### Context

- `backend/internal/quiz/question.go — Types`; `options.go — Cases(), Draw(), candidates()`.
- `backend/internal/country/catalogue.go — Catalogue.Label(), Catalogue.Family()` — unit labels and currency families.
- `backend/internal/quiz/questionspace_test.go — TestQuestionSpace`.
- `backend/internal/contract/testdata/question-types.json`.
- `frontend/src/features/play/api.ts`, `messages.ts`.
- `docs/game-rules.md`.

### What to build

- **Engine.**
  - `currency_name` (tier 6) and `currency_not_name` (tier 7) join `Types`.
  - `candidates()` gains the currency-prompt row. True is every country whose every currency carries the prompt's unit label in de and en.
  - Contested is every other holder of a currency in the prompt's family.
  - A positive case's prompt is one of the target's own currencies, with the target in the true set.
  - A NOT case's prompt is the first code, in sort order, of each distinct unit label.
  - A NOT target lies outside the defensible set, and its continent holds at least three true members.
  - So Denmark meets Finland, Ireland and Estonia for the Euro; Japan never does.
- **Checks.** `TestQuestionSpace` asserts the currency-NOT rule against the raw lists.
- **UI.** Both types and their sentences join `api.ts` and `messages.ts`.
- **Docs.**
  - `docs/game-rules.md`: "A currency prompt shows a unit name; a country pays with it when every currency it has carries that name."
  - Also there: "A NOT currency question asks only about a country whose continent has three countries paying with that unit."
  - The type tier table gains both rows.

### Acceptance criteria

- [ ] `make -s data-review > /tmp/kinds-review.md && grep -qF '## currency_name MX [MXN]' /tmp/kinds-review.md && grep -qF '## currency_not_name DK [EUR]' /tmp/kinds-review.md && ! grep -qF '## currency_not_name JP [EUR]' /tmp/kinds-review.md`
- [ ] `grep -q 'A NOT currency question asks only about a country whose continent' docs/game-rules.md`
- [ ] Final gate: `make check && GOFLAGS=-count=1 make POSTGRES_DB="$POSTGRES_DB" be-integration`

## Phase 6: Language NOT (E15)

**Depends on**: 5

### Context

- `backend/internal/quiz/question.go — Types`; `options.go — Cases(), Draw(), candidates()`.
- `backend/internal/quiz/questionspace_test.go — TestQuestionSpace`.
- `backend/internal/contract/testdata/question-types.json`.
- `frontend/src/features/play/api.ts`, `messages.ts`.
- `docs/game-rules.md`.

### What to build

- **Engine.**
  - `name_not_language` joins `Types`, tier 8, fame cap 1.
  - A case needs at least three official languages with distinct families.
  - The three wrong options are official languages of the target. The odd one out is the first fitting false language over the value groups, such as Luxemburgisch for Switzerland.
  - The existing official-language row of `candidates()` serves it unchanged.
- **UI.** The type and its sentences join `api.ts` and `messages.ts`.
- **Docs.**
  - `docs/game-rules.md`: "A NOT language question asks about a fame tier 1 country with three official languages of distinct families."
  - The type tier table gains the row.

### Acceptance criteria

- [ ] `make -s data-review > /tmp/kinds-review.md && grep -qE '^## name_not_language CH( |$)' /tmp/kinds-review.md && ! grep -qE '^## name_not_language (DE|FR|JP)( |$)' /tmp/kinds-review.md`
- [ ] `jq -e 'length == 29 and index("name_not_language")' backend/internal/contract/testdata/question-types.json`
- [ ] `grep -q 'A NOT language question asks about a fame tier 1 country' docs/game-rules.md`
- [ ] Final gate: `make check && GOFLAGS=-count=1 make POSTGRES_DB="$POSTGRES_DB" be-integration`
