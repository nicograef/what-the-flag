# Plan: Quiz domain, "now" phases

> Source PRD: docs/prds/prd-quiz-knowledge.md (K1, K2, K3, K4, K9) and docs/prds/prd-question-engine.md (E1, E2, E3, E4)

## Goal

Ship the approved "now" phases of both PRDs:
- a question-space check that guards every data and rule change;
- honest language statuses;
- fame from German Wikipedia pageviews;
- German names from the Auswärtiges Amt list;
- familiar and same-subregion distractors;
- a ten-level difficulty ladder;
- giveaway and variety rules;
- the learning-card payload `result.fact` after a miss;
- two quality queries.

After phase 8, the lead releases v0.4.0 and deploys it from `/opt/what-the-flag`. The owner has authorised releases and deploys.

## Architectural decisions

- **Catalogue.** It stays the embedded artefact `backend/internal/country/dataset/countries.json`, built by `backend/cmd/importdata` (D13).
- **Option rules.** They live in `backend/internal/quiz/options.go`:
  - `Cases(cat Catalogue) []Case` enumerates the question space.
  - `Draw(cat Catalogue, c Case, level int, rnd Rand) (Question, bool)` builds one question for a case at a level.
  - The internal `candidates()` returns the case's true set, contested set and false set, the false set in ordered candidate groups. The defensible set is true ∪ contested.
  - `Generate` picks a case and calls `Draw`. `TestQuestionSpace` and the review dump call `Cases` and `Draw`.
- **Case.** `Case{Type, Target, Prompt}`.
  - `Draw` takes the correct option from the true set: the target when the true set holds it, else a uniform draw.
  - The level only orders the false groups; `Draw` ignores it until phase 5.
  - NOT is not built. The three sets let it land later without changing `Case` or the check.
- **Levels.** From phase 5:
  - `level = min(10, 1 + position/5)` over the 0-based position.
  - Level L asks type tiers L−2 to L, extended one tier down until the window holds four types.
  - Fame ceiling: 1 at levels 1–2, 2 at levels 3–5, 3 from level 6.
  - Familiar groups at levels 1–3, subregion groups from level 4.
  - The server sends `level` with every question and with the result; the client never computes it.
- **Language lists.** A country's `languages`, `regionalLanguages` and `blockedLanguages` are disjoint from phase 2 on. `data/regional-languages.json` entries become `{ "spokenIn": [...], "blockedIn": [...], "source": "https://..." }`, with no `kind` and no cap.
- **Country fields.** `Country` gains `Subregion string` in phase 6, together with its only reader. `Fame` keeps tiers 1..3 and gets a new source in phase 3.
- **German names.** The Auswärtiges Amt list decides a German country or capital name only where it uses another name word than CLDR. An example is Kyjiw vs Kiew. Inverted sort forms and state designators ("Korea, Republik") never replace a CLDR common name ("Südkorea").
- **Generate's input.** In phase 6 it takes the stored questions, `[]Question` by position, instead of the used targets. `UnitOfWork.Targets()` and the `ListTargets` query go.
- **Learning-card payload.** After a `wrong` or `timeout` end, the finished-run payload gains `fact: { name, flag, capital, region, languages, currencies, chosenCountry, spokenIn }` in phase 7:
  - `name`, `flag`, `capital`, `region`, `languages` and `currencies` are the target's, with `languages` the official ones and `currencies` the units;
  - `chosenCountry` (`{de,en}`) is the country of the picked option when exactly one pool country holds it, which a country answer always does;
  - `chosenCountry` is null for a value several pool countries hold, on a timeout, and on a too-fast pick of the correct option;
  - `spokenIn` (`[{de,en}]`, only for `regional_language_name`) lists the countries where the language is official or regional.

  The learning card that renders it belongs to `docs/plans/plan-redesign.md`.

## Inventory

- `backend/internal/quiz/generate.go — Generate(), countryOptions(), clashes(), valueOptions(), shuffled(), maxTier(), maxFame()` — today's option rules.
- `backend/internal/quiz/question.go — Types, values(), answerText(), labelKind(), QuestionType.ID()` — the question types; the ids are `<prompt>_<answer>`.
- `backend/internal/quiz/generate_test.go — TestGenerate(), checkRun(), sharedPool, fivePool` — the seeded sampling checks and the test catalogues.
- `backend/internal/quiz/service.go — serveNext()` — calls `Generate` with `uow.Targets()`.
- `backend/internal/quiz/ports.go`, `postgres/repository.go`, `memory_test.go`, `backend/sqlc/queries/quiz.sql — ListTargets` — the unit of work and its double.
- `backend/internal/country/schema.go — Country`; `catalogue.go — Catalogue`.
- `backend/cmd/importdata/build.go — build(), regionalLanguages(), blockedLanguages(), languageLabels(), fameTiers(), validate()`; `sources.go — readSources(), regionalLanguage, mledozeCountry, overrides`.
- `scripts/fetch-data-sources.sh — ALL_SOURCES` — vendoring; `data/sources/wikidata/capitals.rq` is the join pattern on ISO alpha-2 through `wdt:P297`.
- `data/regional-languages.json`, `data/overrides.json`, `data/SOURCES.md`, `NOTICE`, `frontend/src/app/messages.ts` (footer credit).
- `backend/internal/quiz/httpapi/present.go — presenter.state(), question, result, missed`; `backend/internal/contract/testdata/run-playing.json` and `run-finished.json` (target DE). Regenerate the goldens with `make POSTGRES_DB="$POSTGRES_DB" be-integration TEST_ARGS='-count=1 ./internal/contract -args -update'`.
- `database/stats.sql` — owner statistics; `make stats`.
- `Makefile — CLASS_developer`; `docs/game-rules.md`; `docs/UBIQUITOUS_LANGUAGE.md`.

## Open questions / Risks

- **Database.** Phases 5–8 need `make db` running and `make POSTGRES_DB="$POSTGRES_DB" db-migrate` applied to the lane's database. Every make command passes the lane database, as in [programme.md](programme.md#stores).
- **Shared files.** Phase 5 edits `httpapi/present.go` and the contract goldens, which the player lane owns in wave 1. The lane rebases onto player before landing and regenerates the goldens.
- **Hold to answer.** The redesign's hold adds response time. Phase 8's response-time medians are read only over runs started after the redesign release.
- **Network.** Phases 2, 3 and 4 need the network for git, SPARQL, the Wikimedia pageviews REST API and the Auswärtiges Amt site. If a fetch fails, the phase stops and reports. The vendored results are committed, so the gate stays offline.
- **Real defects in today's data.** Phase 1's check may find some. Each one gets its own fix commit inside phase 1.
- **Owner spot-check (phase 2).** The PRD's "owner spot-checks 10 %" of the backfilled sources is a post-run review item. The lead lists the sample in the report; it does not count as verified.
- **Stored questions.** No phase drops a country, language, currency or region code. The 7 deleted regional entries are official languages elsewhere, so their labels stay. v0.4.0 also ships migration `000006` of `plan-anonymous-player.md`, which empties all play data, so no stored code needs a check.
- **Shifted boundaries.** Levels move them by one or two questions:
  - fame 2 opens at question 11, not 9;
  - fame 3 opens at question 26, not 17;
  - subregion groups start at question 16, not 17.

  The phase 5 and 6 sampling checks use level boundaries.

## Phase 1: Question-space check and review dump (K1)

**Depends on**: none

### Context

- `backend/internal/quiz/generate.go — Generate(), countryOptions(), clashes(), valueOptions()` — the rules to move.
- `backend/internal/quiz/generate_test.go — TestGenerate(), checkRun(), sharedPool` — keep the sampling checks; reuse `sharedPool`.
- `Makefile — CLASS_developer` — gains `data-review`.

### What to build

- **Move the rules.** Today's option rules move into `backend/internal/quiz/options.go`: `Cases`, `Draw` and the internal `candidates()`, as in the decisions. `Generate` calls `Draw` at level 1, and behaviour stays unchanged.
- **`TestQuestionSpace`.** Add it in `backend/internal/quiz/questionspace_test.go`. It enumerates `Cases(cat)` over the real catalogue through `sharedPool` and checks each case two ways.
  - The three sets are tested against the raw catalogue lists, not through `candidates()`:
    - every true code holds the asked relation;
    - true ∪ contested equals the defensible set, computed from:
      - the target's official, regional and blocked languages, and their families;
      - the target's currencies and their families;
      - `region` and `otherRegions`;
      - every country holding the prompt language in any of its three lists;
      - under a flag prompt, every value of a look-alike;
    - no member of any false group lies in that defensible set.
  - One fixed-seed `Draw` per case at level 1 is tested for the pairwise rules:
    - at least three wrong options;
    - no two options share a de or en text or a family;
    - no flag question shows two look-alikes;
    - every option has de and en labels.
  - Phase 1 has no ineligibility rules; phase 5 adds the giveaway rule.
  - Cases with fewer than 6 candidates go to `t.Log`.
  - A table of hand-built questions, each breaking one rule, must each be reported by the checker.
- **Remove the redundant check.** Delete `TestGenerate`'s "every type occurs" check, because the question space covers it.
- **The review dump.** Add `backend/cmd/datareview/main.go` and `make data-review`, listed in `CLASS_developer`.
  - It writes to an `io.Writer`, not through `fmt.Println`, which forbidigo rejects.
  - It prints one fixed-seed question per case under a heading `## <typeId> <target> [<prompt>]`, with the de and en texts and the correct option marked.
- **Process check, not a criterion.** Temporarily remove one exclusion in `candidates()`, confirm `TestQuestionSpace` fails, revert, and quote the failure in the commit body.
- **Glossary.** Add "Question space", "Review dump", "Defensible set", "True set" and "Contested set".

### Acceptance criteria

- [ ] `cd backend && go test ./internal/quiz/ -run '^TestQuestionSpace$' -count=1 -v | grep -q -- '--- PASS: TestQuestionSpace'`
- [ ] `test "$(make -s data-review | grep -oE '^## [a-z_]+' | sort -u | wc -l)" -eq "$(grep -c '{Attr' backend/internal/quiz/question.go)"`
- [ ] `make help | grep -A40 -i developer | grep -q data-review`
- [ ] `make check` passes.

## Phase 2: Honest language relation (K2)

**Depends on**: 1

### Context

- `data/regional-languages.json` — 155 entries; 65 without a URL source.
- `backend/cmd/importdata/build.go — regionalLanguages(), blockedLanguages(), languageLabels(), validate()`; `sources.go — regionalLanguage`.
- `backend/internal/quiz/options.go — candidates()` — the spoken-in predicate and the regional prompt.
- `backend/internal/quiz/questionspace_test.go — TestQuestionSpace`.
- `scripts/fetch-data-sources.sh` — the CLDR step also copies `supplemental/territoryInfo.json`, already in its sparse checkout.

### What to build

- **Importer: disjoint lists.**
  - It stops adding every official country to `regionalLanguages`.
  - `spokenIn` lists only countries where the language is established and not official; an official country there is an error.
  - The new `blockedIn` feeds `blockedLanguages` directly. It does not pass through `blockedLanguages()`'s rule that the language must be official in another pool country: Welsh is official nowhere.
  - `validate` gains the invariant that a country's three language lists are disjoint.
  - The cap and `kind` go.
- **Data fixes.**
  - Delete mfe, mi, rm, ss, st, tpi, ve.
  - Quechua gains CL; Welsh moves AR to `blockedIn`.
  - Fix the German labels of szl, hmn, fan and tpi through `overrides.languageLabels`.
- **Generator.** Prompts come from `regionalLanguages` alone. A country holding the prompt language in any list is never a wrong option, as `TestQuestionSpace` already asserts.
- **Sources.** Every entry needs an https `source`, and the importer rejects any other. A `nico:web-researcher` agent drafts the 65 missing URLs.
- **CLDR oracle.** Vendor `territoryInfo.json`. The importer prints a warn-only diff for the curated regional languages only: countries where CLDR lists the language, minus spokenIn ∪ blockedIn ∪ official countries.
  - Fix each gap that meets the completeness rule. List the ignored ones in the commit body.
- **Test.** `TestImporterRejects` in `backend/cmd/importdata/build_test.go` loads the real sources once. Three rows each mutate one fact and must be rejected:
  - a `spokenIn` country where the language is official;
  - an asymmetric look-alike;
  - a non-URL source.
- **Docs.** Update the game-rules language bullets, `data/SOURCES.md`, and the glossary terms "Regional language", "Blocked language" and "Spoken-in list".

### Acceptance criteria

- [ ] `cd backend && go test ./cmd/importdata/ -run '^TestImporterRejects$' -count=1 -v | grep -q -- '--- PASS: TestImporterRejects'`
- [ ] `jq -e '[.[] | select((.source | startswith("https://")) | not)] | length == 0' data/regional-languages.json`
- [ ] `jq -e '.qu.spokenIn | index("CL")' data/regional-languages.json && jq -e '.cy.blockedIn | index("AR")' data/regional-languages.json`
- [ ] `make check` passes.

## Phase 3: Fame from German Wikipedia pageviews (K3)

**Depends on**: 2

### Context

- `backend/cmd/importdata/build.go — fameTiers()`; `sources.go — mledozeCountry` (its `Area` field).
- `data/overrides.json — fameTiers` — 24 raising overrides.
- `scripts/fetch-data-sources.sh — ALL_SOURCES`; `data/sources/wikidata/capitals.rq` — the P297 join pattern.

### What to build

- **Licence first.** The PRD infers CC0; a `nico:web-researcher` agent verifies it. If the data isn't CC0 or compatible, stop and report.
- **New fetch source.** Add `wikimedia` to `ALL_SOURCES`. It must not re-fetch the capitals.
  - `data/sources/wikidata/articles.rq` joins on ISO alpha-2 through `wdt:P297` and writes `data/sources/wikidata/articles.csv` (`iso2,article`) with each pool country's dewiki title.
  - The fetch then sums monthly `agent=user` views over the 12 full months ending at `PAGEVIEWS_END`, its pin. It writes `data/sources/wikimedia/pageviews.csv` (`article,views`).
- **Fame rank.** It replaces the area rank with the same cut-offs. The importer fails when a pool country has no article or no count.
  - Drop `Area` from `mledozeCountry`.
  - Delete the redundant `fameTiers` overrides; the importer rejects redundant ones.
  - Correct outliers in either direction, each with a reason.
- **Docs.** Update the game-rules fame line, `data/SOURCES.md`, `NOTICE`, the footer credit in `frontend/src/app/messages.ts`, and the "Fame tier" term.

### Acceptance criteria

- [ ] `jq -e '[.countries[]|select(.fame==1)|.code] as $f | (["DE","FR","US","IT","ES"]|all(. as $c|$f|index($c))) and (["TD","MR","NE"]|all(. as $c|($f|index($c))==null))' backend/internal/country/dataset/countries.json`
- [ ] `grep -qi pageview data/SOURCES.md && grep -qi pageview NOTICE && grep -qi pageview frontend/src/app/messages.ts`
- [ ] `make check` passes.

## Phase 4: German names from the Auswärtiges Amt list (K9)

**Depends on**: 3

### Context

- `data/overrides.json — countryNames, capitalLabels`.
- `backend/cmd/importdata/build.go — countryNames(), capitals(), applyLabels()`.

### What to build

- **Compare by script.** Download the Auswärtiges Amt Staatennamen file into a scratch directory outside the repo. A script compares it with every pool country's German name and capital in `countries.json`.
- **Apply the decision rule.** A different name word becomes a `countryNames` or `capitalLabels` override. Its reason cites the list's URL on auswaertiges-amt.de. Inverted forms and designators are ignored.
- **Sources.** Add the list to `data/SOURCES.md` as a reference.

### Acceptance criteria

- [ ] `jq -e '[(.countryNames,.capitalLabels)[] | select(.reason|test("auswaertiges-amt.de"))] | length > 0' data/overrides.json`
- [ ] `cd backend && go test ./internal/quiz/ -run '^TestQuestionSpace$' -count=1 -v | grep -q -- '--- PASS: TestQuestionSpace'`
- [ ] `make check` passes.

## Phase 5: Level ladder, familiar options and the giveaway rule (E1)

**Depends on**: 4

### Context

- `backend/internal/quiz/question.go — Types`; `options.go — Case, Cases(), Draw(), candidates()`; `generate.go — Generate(), maxTier(), maxFame()`.
- `backend/internal/quiz/questionspace_test.go`; `generate_test.go — checkRun()`.
- `backend/internal/quiz/httpapi/present.go — presenter.state(), question, result`; `backend/internal/contract/testdata/run-playing.json`, `run-finished.json`.
- `frontend/src/features/play/api.ts` — the question and result schemas; `frontend/src/test/api-contract.test.ts` compares each parsed golden with `toEqual`.

### What to build

- **Levels.** The exported `quiz.Level(position)` as in the decisions.
  - `Types` takes tiers 1–9:
    - 1: flag→name, name→flag, name→continent;
    - 2: name→capital, capital→name, flag→continent;
    - 3: name→currency, capital→continent;
    - 4: flag→capital, capital→flag, name→official language;
    - 6: flag→currency;
    - 7: capital→currency;
    - 8: flag→official language, capital→official language;
    - 9: regional language→name.
  - `maxTier` and `maxFame` go.
- **Type-first selection:**
  - build the window with the four-type extension;
  - shuffle the types, then take the first type with an unused target within the level's fame ceiling;
  - pick the target, then its case;
  - if nothing fits, retry without the ceiling, then with any type.
- **Candidate groups** at levels 1–3:
  1. same continent within the level's fame ceiling;
  2. same continent;
  3. the rest of the pool.

  A value candidate belongs to the best group of any country holding it.
- **Question space.** `TestQuestionSpace` draws each case at the level equal to its type's tier.
- **Giveaway rule.** name → capital and capital → name skip a target whose name and capital share a word in de or en. Words split at spaces and hyphens. `TestQuestionSpace` pins the target list computed from the dataset.
- **Sampling check.** `checkRun` asserts:
  - while more than 20 targets remain unused, each type lies in its level's window, extension included;
  - each target lies within the fame ceiling while such targets remain;
  - at levels 1–3, country distractors come from the target's continent within the fame ceiling whenever that group holds three.
- **Level on the wire.** The presenter adds `level` to each question and to the result. The result's level is that of the run's last question. Regenerate the goldens.
  The question and result schemas in `features/play/api.ts` gain `level`, an integer from 1 to 10, so the contract test still parses the goldens unchanged.
- **Docs.**
  - `docs/game-rules.md`: the tier table and the two position lines become the level table and the type tier table; add the familiar-group row, the defensible-set sentence and the giveaway rule.
  - Glossary: add "Type window", "Fame ceiling", "Candidate group" and "Giveaway"; change "Difficulty tier". "Level" is already there.

### Acceptance criteria

- [ ] `cd backend && go test ./internal/quiz/... -count=1` passes.
- [ ] `set -o pipefail; ! make -s data-review | grep -qE '^## (name_capital|capital_name) SG '`
- [ ] `grep -qE '^\| 10 \| 46' docs/game-rules.md`
- [ ] `jq -e '.question.level == 1' backend/internal/contract/testdata/run-playing.json && jq -e '.result.level == 1' backend/internal/contract/testdata/run-finished.json`
- [ ] `cd frontend && pnpm exec vitest run src/test/api-contract.test.ts`
- [ ] Final gate: `make check && make POSTGRES_DB="$POSTGRES_DB" be-integration TEST_ARGS=-count=1`

## Phase 6: Subregion groups and variety (K4, E2)

**Depends on**: 5

### Context

- `data/sources/mledoze-countries` — `subregion`; `backend/cmd/importdata/build.go — build()`; `backend/internal/country/schema.go — Country`.
- `backend/internal/quiz/options.go`; `generate.go — Generate()`; `service.go — serveNext()`; `ports.go`; `postgres/repository.go`; `memory_test.go`; `backend/sqlc/queries/quiz.sql — ListTargets` (regenerate with `cd backend && go tool sqlc generate`).

### What to build

- **Subregion.** `Country.Subregion` is read from mledoze; the importer fails when a pool country has none.
- **Subregion groups.** From level 4 (position 15), the groups are same subregion, same continent, then the rest of the pool.
- **Stored questions.** `Generate` takes the stored questions. `UnitOfWork.Questions()` replaces `Targets()` in the port, the postgres adapter (a new query; `ListTargets` goes) and the memory double.
- **Variety rules (soft).** No type twice in a row. No language or currency is the correct answer twice within 8 positions.
  - `checkRun` asserts them strictly while more than 20 unused targets remain.
  - A `fivePool` test pins the fallback: a rule yields when no other type fits.
- **Integration test.** A repository test stores questions out of order and reads them back by position.
- **Docs.** Update `docs/game-rules.md` (the subregion-group row and the variety rules) and add the term "Subregion".

### Acceptance criteria

- [ ] `jq -e '[.countries[] | select((.subregion // "") == "")] | length == 0' backend/internal/country/dataset/countries.json`
- [ ] `cd backend && go test ./internal/quiz/... -count=1` passes.
- [ ] Final gate: `make check && make POSTGRES_DB="$POSTGRES_DB" be-integration TEST_ARGS=-count=1`

## Phase 7: Learning-card payload (E3)

**Depends on**: 6

### Context

This phase is backend only, apart from the result schema. Its frontend part, the learning card, is built by `docs/plans/plan-redesign.md`.

- `backend/internal/quiz/httpapi/present.go — presenter.state(), missed`.
- `backend/internal/quiz/` — a new pure function for `chosenCountry` and its test.
- `backend/internal/contract/quiz_integration_test.go`; `testdata/run-finished.json` (target DE, a `regional_language_name` miss picking France), `testdata/run-timeout.json`.
- `frontend/src/features/play/api.ts` — the result schema; `frontend/src/test/api-contract.test.ts`.

### What to build

- **Payload.** After a `wrong` or `timeout` end, the result carries `fact` as in the decisions, all from the catalogue. Regenerate the goldens.
  The result schema in `features/play/api.ts` gains `fact`, optional because only a miss carries it.
- **The `chosenCountry` rule.** A pure function in `backend/internal/quiz/` resolves the picked option to its country, as in the decisions. The presenter calls it.
  - "Holds" means the value lies in that country's list for the question's answer attribute.
  - `TestChosenCountry` has one row each: a country answer, a value one pool country holds, a value several hold, a timeout, and a too-fast pick of the correct option.
- **Docs.** None here. The redesign plan names the learning card in `docs/game-rules.md`; the glossary already holds it.

### Acceptance criteria

- [ ] `jq -e '.result.fact | .capital.de == "Berlin" and .chosenCountry.de == "Frankreich" and ([.spokenIn[].de] | index("Deutschland") != null)' backend/internal/contract/testdata/run-finished.json`
- [ ] `jq -e '.result.fact | has("chosenCountry") and .chosenCountry == null' backend/internal/contract/testdata/run-timeout.json`
- [ ] `cd backend && go test ./internal/quiz/ -run '^TestChosenCountry$' -count=1 -v | grep -q -- '--- PASS: TestChosenCountry'`
- [ ] `cd frontend && pnpm exec vitest run src/test/api-contract.test.ts`
- [ ] Final gate: `make check && make POSTGRES_DB="$POSTGRES_DB" be-integration TEST_ARGS=-count=1`

## Phase 8: Quality measures (E4)

**Depends on**: 7

### Context

- `database/stats.sql` — its `ended` view and the per-type queries. Postgres arrays are 1-based: the chosen code is `q.options[a.option_index + 1]`.

### What to build

- **Miss rates.** `\echo 'Miss share by type and level'`, then per (type, level, computed from the stored 0-based position as `least(10, 1 + position / 5)`): answers, miss share, timeout share, and the median response time of correct answers.
- **Lures.** `\echo 'Distractor lure shares'`, then per (type, target, option): each distractor's pick share, with n.
- **Glossary.** Add the term "Lure share".

### Acceptance criteria

- [ ] `test "$(make -s POSTGRES_DB="$POSTGRES_DB" stats | grep -c -e 'Miss share by type and level' -e 'Distractor lure shares')" -eq 2`
- [ ] Final gate: `make check && make POSTGRES_DB="$POSTGRES_DB" be-integration TEST_ARGS=-count=1`
