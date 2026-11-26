# Data sources

Each source sits unchanged under `sources/`, and its `LICENSE` governs its files.
`scripts/fetch-data-sources.sh` refreshes them from the pins below; a pin change updates this table by hand.

| Source | URL | Commit or tag | Files | Licence | Fetched |
| --- | --- | --- | --- | --- | --- |
| mledoze/countries | <https://github.com/mledoze/countries> | `fa4f62182d19ff4f8b325cde6387c9cd9d80955a` | `sources/mledoze-countries/countries.json` (upstream `dist/countries.json`), `LICENSE` | ODbL-1.0 | 2026-11-26 |
| Unicode CLDR | <https://github.com/unicode-org/cldr-json> | `49.0.0` | `sources/cldr/de/territories.json`, `sources/cldr/{de,en}/languages.json` (upstream `cldr-json/cldr-localenames-full/main/<lang>/`), `sources/cldr/{de,en}/currencies.json` (upstream `cldr-json/cldr-numbers-full/main/<lang>/`), `sources/cldr/supplemental/aliases.json` (upstream `cldr-json/cldr-core/supplemental/`), the packages' shared `LICENSE` | Unicode-3.0 | 2026-11-26 |
| Wikidata | <https://query.wikidata.org/sparql> | none; the query `sources/wikidata/capitals.rq` | `sources/wikidata/capitals.csv`, CRLF as served | CC0-1.0 | 2026-11-26 |
| lipis/flag-icons | <https://github.com/lipis/flag-icons> | `v7.6.0` | `sources/flag-icons/4x3/*.svg` (271 files, upstream `flags/4x3/`), `LICENSE` | MIT | 2026-11-26 |
