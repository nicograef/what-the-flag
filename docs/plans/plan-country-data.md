# Plan: Country data

> Source PRD: docs/prds/prd-rebuild.md

## Goal

Vendor the open country sources, curate their fixes and generate one checked dataset plus keyed flag files.
`backend/internal/country` serves the catalogue from memory. `make data-check` gates every change.
Runs after the foundation plan: `backend/` module, `Makefile` Go blocks and `.github/workflows/ci.yml` exist.

## Architectural decisions

- **Sources and their roles.** Each fact has exactly one source; the importer never mixes two for one field.

| Field | Source | Path read |
| --- | --- | --- |
| code, English name, UN membership, region, subregion, latlng, area, borders | mledoze/countries `fa4f62182d19ff4f8b325cde6387c9cd9d80955a` | `dist/countries.json` |
| German name | cldr-json tag `49.0.0` | `cldr-json/cldr-localenames-full/main/de/territories.json` |
| capitals (QID, en, de), population | Wikidata SPARQL, CSV checked in | query below |
| flag SVG | lipis/flag-icons tag `v7.6.0` | `flags/4x3/<lower-alpha2>.svg` |

- **Vendored layout.** Files keep their upstream bytes; only the directory differs.
  - `data/sources/mledoze-countries/countries.json`, `data/sources/mledoze-countries/LICENSE`
  - `data/sources/cldr/de/territories.json`, `data/sources/cldr/LICENSE`
  - `data/sources/flag-icons/4x3/*.svg` (all 271 files, 2.7 MB), `data/sources/flag-icons/LICENSE`
  - `data/sources/wikidata/capitals.rq`, `data/sources/wikidata/capitals.csv` (CRLF as served, RFC 4180)
- **mledoze fields read**: `cca2`, `cca3`, `name.common`, `unMember`, `region`, `subregion`, `latlng` (`[lat, lng]`), `area` (km², int or float), `borders` (cca3 codes, mapped to cca2 via `cca3`). `capital` and `translations` are not read.
- **CLDR fields read**: `main.de.localeDisplayNames.territories.<CC>`. Keys with `-alt-` are not read.
- **Wikidata CSV header**: `iso2,capital,capitalEn,capitalDe,population,populationDate`. `capital` is an entity URI; the importer keeps the QID after the last `/`. `population` is a decimal string such as `89752.0`; it must be integral. Rows of non-pool codes (today only `GI`) are ignored.
- **The query** (verified 2026-11-16: 214 rows, 199 codes, every pool code has a capital and a population). Labels fall back de → mul → en:

```sparql
SELECT DISTINCT ?iso2 ?capital ?capitalEn ?capitalDe ?population ?populationDate WHERE {
  ?country wdt:P297 ?iso2 ; wdt:P31/wdt:P279* wd:Q3624078 .
  OPTIONAL { ?country wdt:P36 ?capital .
    OPTIONAL { ?capital rdfs:label ?capEn FILTER(LANG(?capEn) = "en") }
    OPTIONAL { ?capital rdfs:label ?capMul FILTER(LANG(?capMul) = "mul") }
    OPTIONAL { ?capital rdfs:label ?capDe FILTER(LANG(?capDe) = "de") }
    BIND(COALESCE(?capEn, ?capMul) AS ?capitalEn)
    BIND(COALESCE(?capDe, ?capMul, ?capEn) AS ?capitalDe) }
  OPTIONAL { ?country p:P1082 ?popSt . ?popSt a wikibase:BestRank ; ps:P1082 ?population .
    OPTIONAL { ?popSt pq:P585 ?populationDate } }
}
ORDER BY ?iso2 ?capital ?populationDate ?population
```

- **Population rule.** `wikibase:BestRank` keeps preferred statements, else all normal ones. The importer takes the row with the latest `populationDate`. Equal dates with different values fail the import. VA has 9 normal rows, TW 2.
- **Fetch script** `scripts/fetch-data-sources.sh` (handbook header, `set -euo pipefail`, env defaults `MLEDOZE_REV`, `CLDR_TAG`, `FLAG_ICONS_TAG`, `DATA_DIR`):
  1. Clones into a `mktemp -d` directory removed by `trap`. mledoze: `git init` + `git fetch --depth 1 origin "$MLEDOZE_REV"`. Tags: `git clone --depth 1 --branch`. cldr-json adds `--filter=blob:none --sparse` and sparse-checks out `cldr-json/cldr-localenames-full/main/de`.
  2. Replaces each `data/sources/<source>/` with the files listed above.
  3. POSTs `capitals.rq` to `https://query.wikidata.org/sparql` with `Accept: text/csv`, `--fail --retry 3 --retry-delay 65` and User-Agent `what-the-flag-data-fetch/1.0 (https://what-the-flag.de)`. Wikidata rate-limits to 1 request per minute during outages.
  4. Writes nothing outside `data/sources/`. A pin change also updates `data/SOURCES.md` by hand.
- **Pool rule.** Pool = mledoze `unMember` after overrides, plus `poolAdditions`. The PRD fixes the 197; the importer judges no recognition question.
- **Capital rule.** Wikidata's truthy `P36` is the only capital source. One capital: it is primary. Several: `primaryCapitals` names the primary by QID; the rest become `otherCapitals`. Editorial cases follow the same rule:
  - Jerusalem: Wikidata's truthy P36 for IL is Jerusalem only; kept as is.
  - Palestine: Wikidata lists Ramallah and East Jerusalem. Ramallah is primary as the seat of government in practice.
  - Taiwan, Kosovo: in the pool by PRD decision; capitals Taipei and Pristina from Wikidata unchanged.
  - Equatorial Guinea: Wikidata has Ciudad de la Paz only; it wins. Malabo is not stored.
- **Override hygiene.** Every override entry carries a non-empty `reason`. An override for an unknown code or QID fails. An override equal to the source value fails, so stale entries surface.
- **`data/overrides.json`** (complete content known today):

| Section | Key | Value | Reason |
| --- | --- | --- | --- |
| `unMember` | VA | `false` | Holy See is a UN observer; mledoze says `true`. UN count must be 193 |
| `poolAdditions` | – | `["PS","TW","VA","XK"]` | PRD pool: 193 UN members + 4 = 197 |
| `primaryCapitals` | BO | `Q2907` Sucre | Constitutional capital; La Paz (`Q1491`) is the seat of government |
| `primaryCapitals` | LK | `Q41963` Sri Jayawardenepura Kotte | Official capital; Colombo (`Q35381`) is the commercial one |
| `primaryCapitals` | PS | `Q158119` Ramallah | Seat of government; East Jerusalem (`Q212938`) is claimed |
| `primaryCapitals` | SZ | `Q3904` Mbabane | Executive capital; Lobamba (`Q101418`) is royal and legislative |
| `primaryCapitals` | YE | `Q2471` Sanaa | Constitutional capital; Aden (`Q131694`) is temporary |
| `primaryCapitals` | ZA | `Q3926` Pretoria | Executive capital; Bloemfontein (`Q37701`), Cape Town (`Q5465`) are others |
| `capitalLabels` | Q31026 | `{"en": "Yaren"}` | Wikidata en says "Yaren District"; de already "Yaren" |
| `capitalLabels` | Q41963 | `{"de": "Sri Jayawardenepura Kotte"}` | Wikidata de "Jayewardenepura" differs from en and the official spelling |
| `capitalLabels` | Q23438 | `{"de": "Aschgabat"}` | Wikidata de uses Turkmen "Aşgabat"; Duden form wins |
| `countryNames` | PS | `{"de": "Palästina"}` | CLDR `PS` is "Palästinensische Autonomiegebiete"; CLDR `PS-alt-short` matches "Palestine" |

- **Cases with no override, and why:**
  - AG, NG, NO lack a German Wikidata label. The mul fallback yields "St. John's", "Abuja", "Oslo", correct German forms.
  - Ulaanbaatar (MN), Reykjavík, Nukuʻalofa, "Washington, D.C.", San Marino: Wikidata spelling wins; mledoze is no capital source.
  - Other CLDR vs mledoze `deu` differences (BN, BW, CD, CG, CI, CV, MD, TL): CLDR wins as the PRD's German source.
- **`countries.json` schema.** Top level `{"countries": [...]}`, sorted by `code`, all 250 mledoze entries. Field order is fixed by the Go struct:

| Field | Type | Pool | Non-pool |
| --- | --- | --- | --- |
| `code` | alpha-2, upper case | required | required |
| `inPool` | bool | `true` | `false` |
| `name` | `{"de","en"}` | both non-empty | both non-empty (CLDR covers all 250) |
| `capital` | `{"qid","de","en"}` or `null` | required | `null` |
| `otherCapitals` | array of `{"qid","de","en"}`, sorted by `qid` | may be `[]` | `[]` |
| `region` | mledoze value (`Africa`, `Americas`, `Asia`, `Europe`, `Oceania`, `Antarctic`) | required | required |
| `subregion` | mledoze value | required | may be `""` (AQ, BV, GS, HM, TF) |
| `population` | int64 or `null` | required, > 0 | `null` |
| `areaKm2` | float64 | required, > 0 | as source |
| `latlng` | `[lat, lng]` float64 | required | required |
| `borders` | alpha-2 array, sorted | may be `[]` | may be `[]` |
| `flagKey` | 10 hex chars | required | `""` |

- **Flag key and file.** `country.FlagKey(code)` = first 10 hex chars of SHA-256 of `"wtf-flag:" + code` (upper-case code). The importer writes `frontend/public/flags/<flagKey>.svg` for pool entries only. Each upstream SVG carries `id="flag-icons-<lower-alpha2>"` on its root; the importer removes that attribute and fails unless it occurred exactly once. It also copies the flag-icons `LICENSE` to `frontend/public/flags/LICENSE`, so the MIT notice ships with the flags.
- **Determinism.** `json.MarshalIndent` with two spaces, trailing newline, sorted slices, no maps in the output. The importer owns `frontend/public/flags/` entirely and deletes files it did not write.
- **Importer CLI** `backend/cmd/importdata`: `-root` (repo root, default `..`), `-check`. `-check` builds in memory, compares `countries.json` and the flags directory byte for byte, prints each differing path and exits 1.
- **Invariants the importer enforces** (exit 1 with every violation listed): UN count 193; pool count 197; every pool field per the schema; every multi-capital pool entry has a `primaryCapitals` entry naming one of its QIDs; no two pool entries share a country or primary-capital label in either language; a flag source exists per pool code.
- **Catalogue API** (`backend/internal/country`): `type Lang string` with `LangDE = "de"`, `LangEN = "en"`. `type Names struct{ DE, EN string }` with `func (n Names) In(l Lang) string`. `type Capital struct{ QID string; Names }`. `type Country` mirrors the schema. `func Load() (*Catalogue, error)` parses the embedded file. Methods: `ByCode(code string) (Country, bool)`, `Pool() []Country` (sorted by code, a copy). The catalogue is immutable, so it is safe for concurrent reads.
- **No wiring in `main.go`.** The quiz-practice plan calls `country.Load()` at start. This plan leaves the choke file untouched.
- **Licences.** Code MIT (root `LICENSE`), data ODbL-1.0 (`data/LICENSE`, official plain text from opendatacommons.org). `NOTICE` credits mledoze (ODbL-1.0), Unicode CLDR (Unicode-3.0), Wikidata (CC0-1.0), flag-icons (MIT, © 2013 Panayiotis Lipiridis).

## Inventory

- `docs/prds/prd-rebuild.md — Data, Testing Decisions` — pool size, completeness rule, gate step.
- `Makefile — be-check, CLASS_developer` (from the foundation plan) — gains `data`, `data-check`.
- `.github/workflows/ci.yml — backend-ci, changes` (from the foundation plan) — gains the dataset check and path filters.
- `README.md` (from the foundation plan) — gains a Licence section.

## Open questions / Risks

- **Equatorial Guinea capital.** Recommended: Ciudad de la Paz, as Wikidata states since the 2026 transfer decree. Alternative: override to Malabo, which most players know.
- **Flag key is reversible.** Anyone who knows the scheme hashes 197 codes. The brief fixes the scheme; it hides the code from casual inspection only.
- **Wikidata drift.** A re-fetch changes `capitals.csv`. The stale-override check and the invariants surface every effect in `make data`.
- **Root `LICENSE`.** This plan creates it. The foundation plan must not also create it.

## Phase 1: Vendored sources and licences

**Depends on**: none

### Context

- `.claude/rules/scripts.md` of the handbook — script header and style.
- `README.md` — foundation's README; gains a section.

### What to build

- `scripts/fetch-data-sources.sh` (executable) per the fetch decision.
- `data/sources/wikidata/capitals.rq` with the query above.
- Run the script once; commit `data/sources/mledoze-countries/countries.json`, `data/sources/mledoze-countries/LICENSE`, `data/sources/cldr/de/territories.json`, `data/sources/cldr/LICENSE`, `data/sources/flag-icons/4x3/*.svg`, `data/sources/flag-icons/LICENSE`, `data/sources/wikidata/capitals.csv`.
- `data/SOURCES.md`: one table row per source with URL, commit or tag, files, licence, fetch date. A sentence names the fetch script as the way to refresh.
- `data/LICENSE` (ODbL-1.0 text), root `LICENSE` (MIT, Nico Gräf), root `NOTICE`.
- `README.md`: a `## Licence` section: "Code: MIT (`LICENSE`). Data: ODbL-1.0 (`data/LICENSE`). Credits: `NOTICE`."

### Acceptance criteria

- [ ] The script is valid bash: `bash -n scripts/fetch-data-sources.sh`
- [ ] The vendored files reproduce from the pins (manual, needs network): `scripts/fetch-data-sources.sh && git diff --exit-code -- data/sources ':(exclude)data/sources/wikidata/capitals.csv'`
- [ ] 271 flag sources are vendored: `test "$(ls data/sources/flag-icons/4x3/*.svg | wc -l)" -eq 271`
- [ ] `make check` passes

## Phase 2: Overrides, importer and gate

**Depends on**: 1

### Context

- `data/sources/**` — the inputs from phase 1.
- `Makefile — be-check, CLASS_developer` — gate and help classes.
- `.github/workflows/ci.yml — backend-ci, changes` — CI gate and its path filter.

### What to build

- `data/overrides.json` with exactly the table above. Shape: `unMember` (code → bool + `reason`), `poolAdditions` (`codes`, `reason`), `primaryCapitals` (code → `qid`, `reason`), `capitalLabels` (QID → optional `de`/`en`, `reason`), `countryNames` (code → optional `de`/`en`, `reason`).
- `backend/internal/country/schema.go`: the JSON record types of the schema table and `FlagKey(code string) string`. Shared by importer and catalogue, so the schema exists once.
- `backend/cmd/importdata/main.go`: flags, run, exit codes.
- `backend/cmd/importdata/sources.go`: readers for mledoze, CLDR, the Wikidata CSV (`encoding/csv`) and overrides.
- `backend/cmd/importdata/build.go`: merge per the rules, pool, invariants, override hygiene.
- `backend/cmd/importdata/output.go`: write or compare `backend/internal/country/dataset/countries.json`, `frontend/public/flags/*.svg` and `frontend/public/flags/LICENSE`.
- Generated and committed: `backend/internal/country/dataset/countries.json`, `frontend/public/flags/<flagKey>.svg` (197 files), `frontend/public/flags/LICENSE`.
- `Makefile`: `data: ## Regenerate the country dataset and flags from data/` runs `cd $(BACKEND_DIR) && go run ./cmd/importdata`. `data-check: ## Fail when the generated dataset differs from the importer's output` runs it with `-check`. `be-check` gains the prerequisite `data-check`. Both join `CLASS_developer`.
- `.github/workflows/ci.yml`: `backend-ci` step "Check generated dataset is current" runs `go run ./cmd/importdata -check` after "Check generated code is current". The `backend` filter adds `data/**` and `frontend/public/flags/**`.
- No unit tests: the `-check` gate and phase 3's invariant test cover the importer's behaviour.

### Acceptance criteria

- [ ] The importer is deterministic and the committed output is current: `make data && make data-check && git diff --exit-code`
- [ ] 197 keyed flags plus the licence exist: `test "$(ls frontend/public/flags | wc -l)" -eq 198`
- [ ] No flag file leaks its code: `! grep -rl 'flag-icons-' frontend/public/flags`
- [ ] The gate catches drift (manual): `echo >> backend/internal/country/dataset/countries.json && ! make data-check; git checkout backend/internal/country/dataset/countries.json`
- [ ] Both targets are classified for `make help`: `! make help | grep -q UNCLASSIFIED`
- [ ] `make check` passes

## Phase 3: Embedded catalogue

**Depends on**: 2

### Context

- `backend/internal/country/schema.go — FlagKey()` — record types from phase 2.
- `backend/internal/country/dataset/countries.json` — the embedded file.
- `frontend/public/flags/` — the flag files the test checks.

### What to build

- `backend/internal/country/catalogue.go`: `//go:embed dataset/countries.json`, `Lang`, `Names.In()`, `Capital`, `Country`, `Catalogue`, `Load()`, `ByCode()`, `Pool()` per the API decision.
- `backend/internal/country/catalogue_test.go`: `TestPoolInvariants`, one table of named checks over `Load().Pool()`:
  - pool count is 197;
  - every entry complete: both names, primary capital in both languages, region, subregion, population > 0, flag key of 10 hex chars equal to `FlagKey(code)`;
  - `../../../frontend/public/flags/<flagKey>.svg` exists for every entry;
  - no two entries share a country label, per language;
  - no two entries share a primary-capital label, per language.
- Test level: pure function over the real embedded dataset; a repo rule enforced as a test.

### Acceptance criteria

- [ ] Pool invariants hold (unit): `cd backend && go test ./internal/country -run TestPoolInvariants`
- [ ] `make check` passes
