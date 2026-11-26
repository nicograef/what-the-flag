# Plan: Country attributes

> Source PRD: docs/prds/prd-rebuild.md (Data, Question rules)

## Goal

The dataset gains what the first question types need beyond name, flag and capital: continent, languages, currencies and a fame tier.
Every attribute value has a German and an English label, read from vendored CLDR.
`country.Catalogue` serves the values and their labels. `make data-check` keeps gating every change.

## Architectural decisions

### Sources (vendored unchanged, pinned to cldr-json tag `49.0.0` like the territories)

| File | Read |
| --- | --- |
| `data/sources/cldr/de/languages.json`, `data/sources/cldr/en/languages.json` | `main.<lang>.localeDisplayNames.languages.<code>` |
| `data/sources/cldr/de/currencies.json`, `data/sources/cldr/en/currencies.json` | `main.<lang>.numbers.currencies.<ISO 4217>.displayName` |
| `data/sources/cldr/supplemental/aliases.json` | `supplemental.metadata.alias.languageAlias.<code>._replacement` |
| `data/sources/mledoze-countries/countries.json` (already vendored) | `languages` (keys, ISO 639-3), `currencies` (keys, ISO 4217), `area`, `region` |

- Upstream paths: `cldr-json/cldr-localenames-full/main/<lang>/languages.json`, `cldr-json/cldr-numbers-full/main/<lang>/currencies.json`, `cldr-json/cldr-core/supplemental/aliases.json`.
- `scripts/fetch-data-sources.sh` takes optional source names as arguments (`mledoze`, `cldr`, `wikidata`, `flag-icons`); none means all.
  A run for one source touches only that source's directory. The new files join the `cldr` source.

### Mapping

- Language code: mledoze's ISO 639-3 key, replaced by its CLDR `languageAlias` when one exists (`fra` → `fr`, `roh` → `rm`).
  A code without a German and an English CLDR label fails the importer.
- Currency code: mledoze's ISO 4217 key. A code without both CLDR display names fails.
- Continent: mledoze `region`, one of `Africa`, `Americas`, `Asia`, `Europe`, `Oceania`.
  Labels come from a constant table in the importer: Afrika/Africa, Amerika/Americas, Asien/Asia, Europa/Europe, Ozeanien/Oceania.
- Fame tier 1–3 from the pool's area rank: ranks 1–50 are tier 1, 51–120 tier 2, the rest tier 3.
  `data/overrides.json` section `fameTiers` (code → `tier`, `reason`) adjusts known small countries.
  Seed entries: SG, CH, NL, BE, PT, GR, IL, LU, MC, VA, JM, QA as tier 1, each with its reason.
- `data/overrides.json` section `languages` (code → `add`/`remove` lists, `reason`) fixes language lists. A `currencies` section of the same shape fixes currency lists. Override hygiene applies to both.

### Dataset (`backend/internal/country/dataset/countries.json`)

- Each country gains, after `region`: `"languages": [...]` (CLDR codes, sorted), `"currencies": [...]` (sorted), `"fame": 1|2|3`.
  `region` keeps its name; the PRD's "continent" is this field.
- Top level gains `"labels": {"languages": {code: {"de","en"}}, "currencies": {...}, "regions": {...}}`.
  It holds exactly the codes the pool uses, sorted by code. `"countries"` stays the first key.
- Every pool country has at least one language and one currency. The importer fails otherwise.

### Catalogue API (`backend/internal/country`)

- `Country` gains `Languages []string`, `Currencies []string`, `Fame int`, in file order.
- `type LabelKind string` with `LabelLanguage`, `LabelCurrency`, `LabelRegion`.
- `func (c *Catalogue) Label(kind LabelKind, code string) (Names, bool)`.
- The catalogue stays read-only after `Load()`.

## Inventory

- `scripts/fetch-data-sources.sh`, `data/SOURCES.md`, `NOTICE` (country-data) — fetching and crediting the CLDR files.
- `backend/cmd/importdata — sources.go, build.go, output.go` (country-data) — readers, merge, invariants, owned files.
- `backend/internal/country — schema.go, catalogue.go, catalogue_test.go — TestPoolInvariants` (country-data).
- `data/overrides.json` (country-data) — override hygiene rules apply to the new sections.

## Open questions / Risks

- mledoze lists official and widely used languages without telling them apart. The `languages` override section fixes wrong entries the beta reports.
- Area makes a poor fame proxy for small, well-known states. `fameTiers` covers the obvious ones; the beta shows the rest.

## Phase 1: Vendored CLDR labels and per-source fetch

**Depends on**: none

### Context

- `scripts/fetch-data-sources.sh`, `data/SOURCES.md`, `NOTICE`, `data/sources/cldr/`.

### What to build

- `scripts/fetch-data-sources.sh`: source arguments; the five new CLDR files in the `cldr` source. Run it with `cldr` only.
- Commit `data/sources/cldr/de/languages.json`, `data/sources/cldr/en/languages.json`, `data/sources/cldr/de/currencies.json`, `data/sources/cldr/en/currencies.json`, `data/sources/cldr/supplemental/aliases.json`.
- `data/SOURCES.md`: the cldr row lists the new files; `NOTICE`: the cldr block names `cldr-numbers-full` and `cldr-core` beside `cldr-localenames-full`.

### Acceptance criteria

- [x] `bash -n scripts/fetch-data-sources.sh && shellcheck scripts/fetch-data-sources.sh`
- [x] The cldr-only run left other sources untouched: `test -z "$(git diff --name-only origin/main -- data/sources | grep -v '^data/sources/cldr/')"`
- [x] Labels present: `jq -e '.main.de.localeDisplayNames.languages.rm' data/sources/cldr/de/languages.json && jq -e '.main.de.numbers.currencies.CHF.displayName' data/sources/cldr/de/currencies.json`
- [x] `make check` passes.

## Phase 2: Attributes in the dataset and the catalogue

**Depends on**: 1

### Context

- `backend/cmd/importdata/`, `backend/internal/country/`, `data/overrides.json`.

### What to build

- `backend/cmd/importdata/sources.go`: readers for the CLDR language and currency names and the language aliases; mledoze `languages`, `currencies`, `area`.
- `backend/cmd/importdata/build.go`: the mapping, fame tiers, the `fameTiers` and `languages` override sections with hygiene, the new invariants.
- `backend/cmd/importdata/output.go`: the `labels` section. Regenerated `backend/internal/country/dataset/countries.json`.
- `data/overrides.json`: `fameTiers` with the seed entries, `languages: {}`.
- `backend/internal/country/schema.go`: the new fields; `backend/internal/country/catalogue.go`: `LabelKind`, `Label()`.
- `backend/internal/country/catalogue_test.go — TestPoolInvariants`, new rows:
  - every country has ≥ 1 language, ≥ 1 currency, a fame of 1–3;
  - every language, currency and region code has a label in both languages;
  - the CH row holds `de`, `fr`, `it`, `rm` and `CHF`;
  - no other capital equals any primary capital.

### Acceptance criteria

- [x] The committed dataset is current: `make data && test -z "$(git status --porcelain -- backend/internal/country/dataset frontend/public/flags)"`
- [x] Invariants (unit): `cd backend && go test ./internal/country -run TestPoolInvariants`
- [x] A stale override fails: `tmp=$(mktemp) && cp data/overrides.json "$tmp" && jq '.fameTiers.US = {"tier": 1, "reason": "x"}' "$tmp" > data/overrides.json; ! make data-check; rc=$?; cp "$tmp" data/overrides.json; exit $rc`
- [x] `make check` passes.
