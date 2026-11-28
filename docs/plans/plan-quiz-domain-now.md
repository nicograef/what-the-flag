# Plan: Quiz domain, "now" phases

> Source PRD: docs/prds/prd-quiz-knowledge.md (K1, K2, K3, K4, K9) and docs/prds/prd-question-engine.md (E1, E2, E3, E4)

## Goal

Ship the approved "now" phases of both PRDs:
- a question-space check that guards every data and rule change;
- honest language statuses;
- fame from German Wikipedia pageviews;
- German names from the Auswärtiges Amt list;
- familiar and same-subregion distractors;
- giveaway and variety rules;
- a fact card after a miss;
- two quality queries.

After phase 8, the lead releases v0.4.0 and deploys it from `/opt/what-the-flag`. The owner has authorised releases and deploys.

## Architectural decisions

- **Catalogue.** It stays the embedded artefact `backend/internal/country/dataset/countries.json`, built by `backend/cmd/importdata` (D13).
- **Option rules.** They live in `backend/internal/quiz/options.go`:
  - `Cases(cat Catalogue) []Case` enumerates the question space.
  - `Draw(cat Catalogue, c Case, rnd Rand) (Question, bool)` builds one question for a case.
  - The internal `candidates()` returns a case's defensible set and its ordered candidate groups.
  - `Generate` picks a case and calls `Draw`. `TestQuestionSpace` and the review dump call `Cases` and `Draw`.
- **Case.** `Case{Type, Target, Prompt, Correct}` in phase 1; phase 5 adds `Band`. Bands are 0-based positions:
  - band 1: positions 0–7, fame gate 1;
  - band 2: positions 8–15, fame gate 2;
  - late: position 16 and later, all tiers, subregion groups.
- **Language lists.** A country's `languages`, `regionalLanguages` and `blockedLanguages` are disjoint from phase 2 on. `data/regional-languages.json` entries become `{ "spokenIn": [...], "blockedIn": [...], "source": "https://..." }`, with no `kind` and no cap.
- **Country fields.** `Country` gains `Subregion string` in phase 6, together with its only reader. `Fame` keeps tiers 1..3 and gets a new source in phase 3.
- **German names.** The Auswärtiges Amt list decides a German country or capital name only where it uses a different name word than CLDR, such as Kyjiw vs Kiew. Inverted sort forms and state designators ("Korea, Republik") never replace a CLDR common name ("Südkorea").
- **Generate's input.** In phase 6 it takes the stored questions, `[]Question` by position, instead of the used targets. `UnitOfWork.Targets()` and the `ListTargets` query go.
- **Fact card.** The finished-run payload gains `fact` in phase 7:
  - the target's name, flag, capital, continent, official languages and currency units;
  - `chosenCountry` (`{de,en}`, null on a timeout or a value answer);
  - `spokenIn` (`[{de,en}]`, only for `regional_language_name`).

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
- `backend/internal/quiz/httpapi/present.go — presenter.state(), missed`; `backend/internal/contract/testdata/run-finished.json` (target DE; regenerate with `cd backend && go test -tags=integration ./internal/contract -update`); `frontend/src/test/api-contract.test.ts` (parses the golden).
- `frontend/src/features/play/run-result.tsx`, `api.ts`, `messages.ts`, `play.test.tsx`, `fake-run.ts`.
- `database/stats.sql` — owner statistics; `make stats`.
- `Makefile — CLASS_developer`; `docs/game-rules.md`; `docs/UBIQUITOUS_LANGUAGE.md`.

## Open questions / Risks

- **Database.** Phases 6–8 need `make db` running and `make db-migrate` applied.
- **Network.** Phases 2, 3 and 4 need the network for git, SPARQL, the Wikimedia pageviews REST API and the Auswärtiges Amt site. If a fetch fails, the phase stops and reports. The vendored results are committed, so the gate stays offline.
- **Pageview licence (phase 3).** The PRD infers CC0. A `nico:web-researcher` agent verifies it first. If the data isn't CC0 or compatible, the phase stops and reports.
- **Real defects in today's data.** Phase 1's check may find some. Each one gets its own fix commit inside phase 1.
- **Owner spot-check (phase 2).** The PRD's "owner spot-checks 10 %" of the backfilled sources is a post-run review item. The lead lists the sample in the report; it does not count as verified.
- **Stored questions.** No phase drops a country, language, currency or region code. The 7 deleted regional entries are official languages elsewhere, so their labels stay. Before deploying, the lead runs a read-only probe: every distinct stored target, prompt and option code must have a label in the new `countries.json`. Staging is reset only if the probe fails, per the owner's beta decision.

## Pending before the run

1. The question-kinds design must land. It covers calling codes, NOT as a polarity axis, chained referring prompts and the owner's 10-level ladder (`level = min(10, 1 + position/5)`, level 10 hardest only). Its level table replaces the fame bands of phases 5 and 6 and may change `Case`.
2. Amend both PRDs with that design, and this plan with its plan impact.
3. Write the second plan, for the new question kinds and the "next" phases, then run a fresh-context `opus` critic on it.
4. Run `/simplify` over both PRDs and both plans, then commit them.
5. Execute this plan with `nico:implement-plan`.

## Phase 1: Question-space check and review dump (K1)

**Depends on**: none

### Context

- `backend/internal/quiz/generate.go — Generate(), countryOptions(), clashes(), valueOptions()` — the rules to move.
- `backend/internal/quiz/generate_test.go — TestGenerate(), checkRun(), sharedPool` — keep the sampling checks; reuse `sharedPool`.
- `Makefile — CLASS_developer` — gains `data-review`.

### What to build

- **Move the rules.** Today's option rules move into `backend/internal/quiz/options.go`: `Cases`, `Draw` and the internal `candidates()`, as in the decisions. `Generate` calls `Draw`, and behaviour stays unchanged.
- **`TestQuestionSpace`.** Add it in `backend/internal/quiz/questionspace_test.go`. It enumerates `Cases(cat)` over the real catalogue through `sharedPool` and checks each case two ways.
  - Every member of every candidate group is tested against the defensible set, computed from the raw catalogue lists, not from `candidates()`:
    - the target's official, regional and blocked languages, and their families;
    - the target's currencies and their families;
    - `region` and `otherRegions`;
    - every country holding the prompt language in any of its three lists;
    - under a flag prompt, every value of a look-alike.
  - One fixed-seed `Draw` per case is tested for the pairwise rules:
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
  - It prints one fixed-seed question per case under a heading `## <typeId> <target> [<prompt>] <correct>`, with the de and en texts and the correct option marked.
- **Process check, not a criterion.** Temporarily remove one exclusion in `candidates()`, confirm `TestQuestionSpace` fails, revert, and quote the failure in the commit body.
- **Glossary.** Add "Question space" and "Review dump".

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
- `scripts/fetch-data-sources.sh` — the CLDR sparse checkout gains `supplemental/territoryInfo.json`.

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

- **Licence first.** If the pageview data isn't CC0 or compatible, stop and report.
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

## Phase 5: Familiar options and the giveaway rule (E1)

**Depends on**: 4

### Context

- `backend/internal/quiz/options.go — Case, Cases(), Draw(), candidates()`; `generate.go — maxFame()`.
- `backend/internal/quiz/questionspace_test.go`; `generate_test.go — checkRun()`.

### What to build

- **Bands.** `Case` gains `Band` (band 1 or band 2 here), and `Cases` enumerates both.
- **Candidate groups** for positions below 16:
  1. same continent within the band's fame gate;
  2. same continent;
  3. the rest of the pool.

  A value candidate belongs to the best group of any country holding it.
- **Giveaway rule.** name → capital and capital → name skip a target whose name and capital share a word in de or en, split at spaces and hyphens. `TestQuestionSpace` pins the target list computed from the dataset.
- **Sampling check.** `checkRun` asserts that below position 16, country distractors come from the target's continent within the fame gate whenever that group holds three.
- **Docs.** Update `docs/game-rules.md`: the candidate-group row, the defensible-set sentence and the giveaway rule. Add the terms "Defensible set", "Candidate group", "Fame gate" and "Giveaway".

### Acceptance criteria

- [ ] `cd backend && go test ./internal/quiz/ -count=1 -v | grep -q -- '--- PASS: TestQuestionSpace'`
- [ ] `set -o pipefail; ! make -s data-review | grep -qE '^## (name_capital|capital_name) SG '`
- [ ] `make check` passes.

## Phase 6: Subregion, late ramp and variety (K4, E2)

**Depends on**: 5

### Context

- `data/sources/mledoze-countries` — `subregion`; `backend/cmd/importdata/build.go — build()`; `backend/internal/country/schema.go — Country`.
- `backend/internal/quiz/options.go`; `generate.go — Generate()`; `service.go — serveNext()`; `ports.go`; `postgres/repository.go`; `memory_test.go`; `backend/sqlc/queries/quiz.sql — ListTargets` (regenerate with `cd backend && go tool sqlc generate`).

### What to build

- **Subregion.** `Country.Subregion` is read from mledoze; the importer fails when a pool country has none.
- **Late band.** From position 16 the groups are same subregion, same continent, then the rest of the pool. `Cases` enumerates the late band too.
- **Stored questions.** `Generate` takes the stored questions. `UnitOfWork.Questions()` replaces `Targets()` in the port, the postgres adapter (a new query; `ListTargets` goes) and the memory double.
- **Variety rules (soft).** No type twice in a row. No language or currency is the correct answer twice within 8 positions.
  - `checkRun` asserts them strictly while more than 20 unused targets remain.
  - A `fivePool` test pins the fallback: a rule yields when no other type fits.
- **Integration test.** A repository test stores questions out of order and reads them back by position.
- **Docs.** Update `docs/game-rules.md` (the late-band row and the variety rules) and add the term "Subregion".

### Acceptance criteria

- [ ] `jq -e '[.countries[] | select((.subregion // "") == "")] | length == 0' backend/internal/country/dataset/countries.json`
- [ ] `cd backend && go test ./internal/quiz/... -count=1` passes.
- [ ] `GOFLAGS=-count=1 make be-integration` passes.
- [ ] `make check` passes.

## Phase 7: Fact card (E3)

**Depends on**: 6

### Context

- `backend/internal/quiz/httpapi/present.go — presenter.state(), missed`.
- `backend/internal/contract/quiz_integration_test.go`; `testdata/run-finished.json` (target DE).
- `frontend/src/test/api-contract.test.ts`; `frontend/src/features/play/run-result.tsx`, `api.ts`, `messages.ts`, `play.test.tsx`, `fake-run.ts`.

### What to build

- **Payload.** After a `wrong` or `timeout` end, the result carries `fact` as in the decisions, all from the catalogue. Regenerate the golden.
- **Result screen.** It shows the fact card under the missed question.
  - A wrong country pick reads "Deine Wahl: die Flagge von Senegal" from `chosenCountry`.
  - A regional-language miss lists `spokenIn`.
- **Docs.** The `docs/game-rules.md` result paragraph names the fact card; add the term "Fact card".

### Acceptance criteria

- [ ] `jq -e '.result.fact.capital.de == "Berlin"' backend/internal/contract/testdata/run-finished.json`
- [ ] `GOFLAGS=-count=1 make be-integration` passes.
- [ ] `cd frontend && pnpm exec vitest run src/features/play/play.test.tsx src/test/api-contract.test.ts` passes. A play test finds the target's capital on the fact card through `FakeApi`.
- [ ] `make check` passes.

## Phase 8: Quality measures (E4)

**Depends on**: 7

### Context

- `database/stats.sql` — its `ended` view and the per-type queries. Postgres arrays are 1-based: the chosen code is `q.options[a.option_index + 1]`.

### What to build

- **Miss rates.** `\echo 'Miss share by type and position band'`, then per (type, band 1–5, 6–15, 16–30, 31+): answers, miss share, and the median response time of correct answers.
- **Lures.** `\echo 'Distractor lure shares'`, then per (type, target, option): each distractor's pick share, with n.
- **Glossary.** Add the term "Lure share".

### Acceptance criteria

- [ ] `test "$(make -s stats | grep -c -e 'Miss share by type and position band' -e 'Distractor lure shares')" -eq 2`
- [ ] `make check` passes.
