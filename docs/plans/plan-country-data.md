# Plan: Country data

> Source PRD: docs/prds/prd-rebuild.md

## Goal

Vendor the open country sources, curate their fixes and generate one checked dataset plus keyed flag files.
`backend/internal/country` serves the catalogue from memory. `make data-check` gates every change.
Runs after the foundation plan: `backend/` module, root `LICENSE`, `README.md`, `Makefile` Go blocks and `.github/workflows/ci.yml` exist.

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
- **The query** (verified 2026-11-18: 214 rows, 198 codes, every pool code has a capital and a population). Labels fall back de → mul → en:

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

- **Population rule.** `wikibase:BestRank` keeps preferred statements, else all normal ones. The importer takes the row with the latest `populationDate`. A pool row without a date, or equal dates with different values, fail the import. VA has 9 dated rows, TW 2.
- **Fetch script** `scripts/fetch-data-sources.sh` (handbook script header, `set -euo pipefail`, env defaults `MLEDOZE_REV`, `CLDR_TAG`, `FLAG_ICONS_TAG`, `DATA_DIR`):
  1. Clones into a `mktemp -d` directory removed by `trap`. mledoze: `git init` + `git fetch --depth 1 origin "$MLEDOZE_REV"`. Tags: `git clone --depth 1 --branch`. cldr-json adds `--filter=blob:none --sparse` and sparse-checks out `cldr-json/cldr-localenames-full/main/de`.
  2. Replaces each `data/sources/<source>/` with the files listed above.
  3. POSTs `capitals.rq` to `https://query.wikidata.org/sparql` with `Accept: text/csv`, `--fail --retry 3 --retry-delay 65` and User-Agent `what-the-flag-data-fetch/1.0 (https://what-the-flag.de)`. Wikidata rate-limits to 1 request per minute during outages.
  4. Writes nothing outside `data/sources/`. A pin change also updates `data/SOURCES.md` by hand.
- **Pool rule.** Pool = codes with mledoze `unMember: true` after the `unMember` overrides, plus `poolAdditions`. Today: 194 − VA = 193 UN members, plus PS, TW, VA, XK = 197. The importer judges no recognition question.
- **Capital rule.** Wikidata's truthy `P36` is the only capital source. One capital: it is primary. Several: `primaryCapitals` names the primary by QID; the rest become `otherCapitals`. Editorial cases follow the same rule:
  - Jerusalem: Wikidata's truthy P36 for IL is Jerusalem only; kept as is.
  - Palestine: Wikidata lists Ramallah and East Jerusalem. Ramallah is primary as the seat of government in practice.
  - Taiwan, Kosovo: in the pool by PRD decision; capitals Taipei and Pristina from Wikidata unchanged.
  - Equatorial Guinea (R11): Wikidata lists Ciudad de la Paz (`Q1140136`) only; no override. Malabo is not stored.
- **Override hygiene.** Every override entry carries a non-empty `reason`. An override for an unknown code or QID fails. An override equal to the source value fails, so stale entries surface. A `poolAdditions` code that is already a UN member fails.
- **Look-alike flags (R13).** A pair goes on the list when both 4:3 flags share layout and colours and differ only in shade or a small emblem a player cannot read at card size.
  - Found by rendering all 197 pool flags at 40×30, ranking pairs by pixel distance and judging the top 25 at 160×120.
  - In: ID/MC (red over white), RO/TD (blue-yellow-red, shade only), NI/SV (blue-white-blue, tiny central emblems).
  - Out: NL/LU, NL/PY, IE/CI, IE/IT, IT/MX, EG/IQ/YE, BO/GH, AD/MD/RO/TD, BG/RU, SN/ML: colour, arms, star or script tells them apart.
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
| `countryNames` | PS | `{"de": "Palästina"}` | CLDR `PS` is "Palästinensische Autonomiegebiete"; CLDR `PS-alt-short` "Palästina" matches en "Palestine" |
| `lookalikes` | – | `["ID","MC"]`, `["RO","TD"]`, `["NI","SV"]` | One reason per pair, as in the look-alike decision |

- **Look-alike validation.** A pair is unordered; it is written with two distinct pool codes in ascending order. A repeated pair fails.
- **Cases with no override, and why:**
  - AG, NG, NO lack a German Wikidata label. The mul fallback yields "St. John's", "Abuja", "Oslo", correct German forms.
  - Ulaanbaatar (MN), Reykjavík, Nukuʻalofa, "Washington, D.C.", San Marino: Wikidata spelling wins; mledoze is no capital source.
  - Other CLDR vs mledoze `deu` differences (BN, BW, CD, CG, CI, CV, MD, TL): CLDR wins as the PRD's German source.
- **`countries.json` schema.** Top level `{"countries": [...]}`, sorted by `code`, all 250 mledoze entries. Go type `country.Country`, field order as listed. Empty slices are written as `[]`, never `null`.

| JSON field | Go field and type | Pool | Non-pool |
| --- | --- | --- | --- |
| `code` | `Code string` (alpha-2, upper case) | required | required |
| `inPool` | `InPool bool` | `true` | `false` |
| `name` | `Name Names` | both non-empty | both non-empty (CLDR covers all 250) |
| `capital` | `Capital *Capital` (`{"qid","de","en"}`) | required | `null` |
| `otherCapitals` | `OtherCapitals []Capital`, sorted by `qid` | may be `[]` | `[]` |
| `region` | `Region string` (`Africa`, `Americas`, `Asia`, `Europe`, `Oceania`, `Antarctic`) | required | required |
| `subregion` | `Subregion string` | required | may be `""` (AQ, BV, GS, HM, TF) |
| `population` | `Population *int64` | required, > 0 | `null` |
| `areaKm2` | `AreaKm2 float64` | required, > 0 | as source |
| `latlng` | `LatLng [2]float64` (`[lat, lng]`) | required | required |
| `borders` | `Borders []string` (alpha-2, sorted) | may be `[]` | may be `[]` |
| `flagKey` | `FlagKey string` (10 hex chars) | required | `""` |
| `lookalikes` | `Lookalikes []string` (alpha-2, sorted) | may be `[]` | `[]` |

- **Flag key and file (R12).** `country.FlagKey(code)` = first 10 hex chars of SHA-256 of `"wtf-flag:" + code` (upper-case code). The key is reversible by anyone who knows the scheme; it hides the code from casual inspection only. Accepted.
- **Flag rewrite.** The importer writes `frontend/public/flags/<flagKey>.svg` for pool entries only:
  1. Remove the root attribute `id="flag-icons-<lower-alpha2>"`; fail unless it occurs exactly once.
  2. Replace every `\b<lower-alpha2>-` with `f-`. 98 pool flags carry such ids and classes (`ad-a`, `url(#us-a)`, `bo-fil1`).
  3. Fail if `\b<lower-alpha2>\b` or `flag-icons` still occurs. Verified against v7.6.0: no pool flag fails.
- **Determinism.** `json.MarshalIndent` with two spaces, trailing newline, sorted slices, no maps in the output. The importer owns `frontend/public/flags/` and `backend/internal/country/dataset/` entirely and deletes files it did not write.
- **Importer CLI** `backend/cmd/importdata`: `-root` (repo root, default `..`), `-check`. `-check` builds in memory, compares every owned file byte for byte, prints each differing path and exits 1.
- **Bootstrap.** The importer imports `internal/country`, whose `//go:embed` needs `dataset/countries.json` to exist. Phase 2 creates the types before the embed; phase 3 adds the embed once the file is committed.
- **Invariants the importer enforces** (exit 1 with every violation listed): UN count 193; pool count 197; every pool field per the schema; every multi-capital pool entry has a `primaryCapitals` entry naming one of its QIDs; no two pool entries share a country or primary-capital label in either language; a flag source exists per pool code; look-alike validation; `lookalikes` in the output is symmetric (A lists B exactly when B lists A).
- **Catalogue API** (`backend/internal/country`). Exact signatures:
  - `type Lang string`; `const LangDE Lang = "de"`, `const LangEN Lang = "en"`.
  - `type Names struct{ DE, EN string }` with JSON tags `de`, `en`; `func (n Names) In(l Lang) string` (unknown `l` returns `EN`).
  - `type Capital struct{ QID string; Names }` with JSON tag `qid`; `Names` is embedded, so the JSON is flat.
  - `type Country struct` per the schema table; `func FlagKey(code string) string`.
  - `type Catalogue struct` (unexported fields); `func Load() (*Catalogue, error)` parses the embedded file.
  - `func (c *Catalogue) ByCode(code string) (Country, bool)`; `func (c *Catalogue) Pool() []Country` (197 entries, sorted by code, a fresh outer slice).
  - Read-only contract: callers never mutate nested slices. The catalogue is then safe for concurrent reads.
- **What quiz-practice gets.** `Pool()` yields per country: `Code`, `Region`, `FlagKey`, `Name`, `Capital` (non-nil in the pool), `OtherCapitals`, `Lookalikes`.
- **Locale (R2).** `country` keeps `country.Lang` and imports no `httpx`. The consumer maps `httpx.Locale` to `country.Lang`.
- **No wiring in `main.go`.** The quiz-practice plan calls `country.Load()` at start. This plan leaves the choke file untouched.
- **Licences (R1, R23).** Code is MIT under the root `LICENSE` the foundation plan creates. Data is ODbL-1.0.
  - `data/LICENSE`: the official ODbL-1.0 plain text from opendatacommons.org. It covers `data/overrides.json` and the generated dataset.
  - Share-alike: the importer copies `data/LICENSE` to `backend/internal/country/dataset/LICENSE`, so the licence sits beside the derived database.
  - MIT notice: the importer copies `data/sources/flag-icons/LICENSE` to `frontend/public/flags/LICENSE`, so it ships with the served flags.
  - Each `data/sources/<source>/LICENSE` keeps governing its vendored files.
  - Root `NOTICE`, one block per source: name, URL, pin, licence, the copyright line quoted from its vendored `LICENSE`, path of the full text. Sources: mledoze (ODbL-1.0), Unicode CLDR (Unicode-3.0), Wikidata (CC0-1.0), flag-icons (MIT).
  - `NOTICE` also names which paths are ODbL-1.0: `data/overrides.json`, `backend/internal/country/dataset/`.
  - ODbL 4.3 (R28): foundation's `frontend/src/app/footer.tsx` shows the notice on every page; first-release puts `NOTICE` and the licence into both images.

## Inventory

- `docs/prds/prd-rebuild.md — Data, Testing Decisions` — pool size, completeness rule, gate step.
- `/home/user/handbook/.claude/rules/scripts.md` — script header and style.
- `Makefile — be-check, CLASS_developer` (from the foundation plan) — gains `data`, `data-check`.
- `.github/workflows/ci.yml — backend-ci, changes` (from the foundation plan) — gains the dataset check and path filters.
- `README.md` (from the foundation plan) — its code-licence line becomes a Licence section.

## Open questions / Risks

- **Wikidata drift.** A re-fetch changes `capitals.csv`. The stale-override check and the invariants surface every effect in `make data`.

## Phase 1: Vendored sources and licences

**Depends on**: none

### Context

- `/home/user/handbook/.claude/rules/scripts.md` — script header and style.
- `README.md` — foundation's README; its code-licence line is replaced.

### What to build

- `scripts/fetch-data-sources.sh` (executable) per the fetch decision.
- `data/sources/wikidata/capitals.rq` with the query above.
- Run the script once; commit `data/sources/mledoze-countries/countries.json`, `data/sources/mledoze-countries/LICENSE`, `data/sources/cldr/de/territories.json`, `data/sources/cldr/LICENSE`, `data/sources/flag-icons/4x3/*.svg`, `data/sources/flag-icons/LICENSE`, `data/sources/wikidata/capitals.csv`.
- `data/SOURCES.md`: one table row per source with URL, commit or tag, files, licence, fetch date. A sentence names the fetch script as the way to refresh.
- `data/LICENSE` (ODbL-1.0 text) and root `NOTICE` per the licence decision. Root `LICENSE` stays the foundation's.
- `README.md`: the code-licence line becomes a `## Licence` section: "Code: MIT (`LICENSE`). Data: ODbL-1.0 (`data/LICENSE`). Credits: `NOTICE`."

### Acceptance criteria

- [ ] The script is valid bash: `bash -n scripts/fetch-data-sources.sh`
- [ ] The vendored files reproduce from the pins (manual, needs network): `scripts/fetch-data-sources.sh && git diff --exit-code -- data/sources ':(exclude)data/sources/wikidata/capitals.csv'`
- [ ] 271 flag sources are vendored: `test "$(ls data/sources/flag-icons/4x3/*.svg | wc -l)" -eq 271`
- [ ] `NOTICE` credits all four sources: `test "$(grep -cE 'ODbL-1.0|Unicode-3.0|CC0-1.0|MIT' NOTICE)" -ge 4 && grep -q 'backend/internal/country/dataset/' NOTICE`
- [ ] `make check` passes

## Phase 2: Overrides, importer and gate

**Depends on**: 1

### Context

- `data/sources/**`, `data/LICENSE` — the inputs from phase 1.
- `Makefile — be-check, CLASS_developer` — gate and help classes.
- `.github/workflows/ci.yml — backend-ci, changes` — CI gate and its path filter.

### What to build

- `data/overrides.json` with exactly the table above. Shape: `unMember` (code → bool + `reason`), `poolAdditions` (`codes`, `reason`), `primaryCapitals` (code → `qid`, `reason`), `capitalLabels` (QID → optional `de`/`en`, `reason`), `countryNames` (code → optional `de`/`en`, `reason`), `lookalikes` (array of `{"pair": [a, b], "reason"}`).
- `backend/internal/country/schema.go`: `Lang`, `LangDE`, `LangEN`, `Names`, `Names.In()`, `Capital`, `Country`, `FlagKey()` per the API decision. Shared by importer and catalogue, so the schema exists once.
- `backend/cmd/importdata/main.go`: flags, run, exit codes.
- `backend/cmd/importdata/sources.go`: readers for mledoze, CLDR, the Wikidata CSV (`encoding/csv`) and overrides.
- `backend/cmd/importdata/build.go`: merge per the rules, pool, look-alikes, invariants, override hygiene.
- `backend/cmd/importdata/output.go`: flag rewrite; write or compare every owned file.
- Generated and committed: `backend/internal/country/dataset/countries.json`, `backend/internal/country/dataset/LICENSE`, `frontend/public/flags/<flagKey>.svg` (197 files), `frontend/public/flags/LICENSE`.
- `Makefile`: `data: ## Regenerate the country dataset and flags from data/` runs `cd $(BACKEND_DIR) && go run ./cmd/importdata`. `data-check: ## Fail when the generated dataset differs from the importer's output` runs it with `-check`. `be-check` gains the prerequisite `data-check`. Both join `CLASS_developer`.
- `.github/workflows/ci.yml`: `backend-ci` step "Check generated dataset is current" runs `go run ./cmd/importdata -check` after "Check generated code is current". The `backend` filter adds `data/**` and `frontend/public/flags/**`.
- No unit tests: the `-check` gate and phase 3's invariant test cover the importer's behaviour.

### Acceptance criteria

- [ ] The importer is deterministic and the committed output is current: `make data && make data-check && test -z "$(git status --porcelain)"`
- [ ] 197 keyed flags plus the licence exist: `test "$(ls frontend/public/flags | wc -l)" -eq 198`
- [ ] No flag file leaks its code: `! grep -rlE 'flag-icons|(id="|#|\.|class="| )[a-z]{2}-' --include='*.svg' frontend/public/flags`
- [ ] The ODbL text travels with the dataset: `cmp data/LICENSE backend/internal/country/dataset/LICENSE`
- [ ] The gate catches drift (manual): `echo >> backend/internal/country/dataset/countries.json && ! make data-check; git checkout backend/internal/country/dataset/countries.json`
- [ ] Both targets are classified for `make help`: `! make help | grep -q UNCLASSIFIED`
- [ ] `make check` passes

## Phase 3: Embedded catalogue

**Depends on**: 2

### Context

- `backend/internal/country/schema.go — FlagKey()` — types from phase 2.
- `backend/internal/country/dataset/countries.json` — the embedded file.
- `frontend/public/flags/` — the flag files the test checks.

### What to build

- `backend/internal/country/catalogue.go`: `//go:embed dataset/countries.json`, `Catalogue`, `Load()`, `ByCode()`, `Pool()` per the API decision.
- `backend/internal/country/catalogue_test.go`: `TestPoolInvariants`, one table of named checks over `Load().Pool()`:
  - pool count is 197;
  - every entry complete: both names, primary capital in both languages, region, subregion, population > 0, flag key of 10 hex chars equal to `FlagKey(code)`;
  - `../../../frontend/public/flags/<flagKey>.svg` exists for every entry;
  - no two entries share a country label, per language;
  - no two entries share a primary-capital label, per language;
  - look-alikes are symmetric, name pool codes only, and include the literal pairs ID/MC, RO/TD, NI/SV.
- Test level: pure function over the real embedded dataset; a repo rule enforced as a test.

### Acceptance criteria

- [ ] Pool invariants hold (unit): `cd backend && go test ./internal/country -run TestPoolInvariants`
- [ ] `make check` passes
