#!/usr/bin/env bash
# fetch-data-sources.sh – vendor the pinned country sources into data/sources/
#
# Usage:
#   scripts/fetch-data-sources.sh [mledoze] [cldr] [wikidata] [wikimedia] [flag-icons]
#   MLEDOZE_REV=<commit> CLDR_TAG=<tag> FLAG_ICONS_TAG=<tag> PAGEVIEWS_END=<YYYY-MM> scripts/fetch-data-sources.sh
#
# What it does:
#   1. Fetches each named source, or every source when none is named, into a temporary directory:
#      mledoze/countries at MLEDOZE_REV, cldr-json at CLDR_TAG (sparse: the de territory names,
#      the de and en language names, the language aliases, the territory languages), flag-icons at
#      FLAG_ICONS_TAG, and the Wikidata capitals.csv by POSTing data/sources/wikidata/capitals.rq
#      to the SPARQL endpoint. The wikimedia source POSTs data/sources/wikidata/articles.rq for each
#      country's German Wikipedia article, then sums each article's monthly user pageviews over the
#      12 full months ending at PAGEVIEWS_END, one request at a time as the API's access policy asks
#   2. Only after every download succeeded, replaces each named data/sources/<source>/ with the
#      files the importer reads plus the source's LICENSE, writes capitals.csv as served (CRLF),
#      and writes wikidata/articles.csv and wikimedia/pageviews.csv
#
# It writes nothing outside DATA_DIR/sources and nothing of an unnamed source.
# A pin change also updates data/SOURCES.md by hand.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MLEDOZE_REV="${MLEDOZE_REV:-fa4f62182d19ff4f8b325cde6387c9cd9d80955a}"
CLDR_TAG="${CLDR_TAG:-49.0.0}"
FLAG_ICONS_TAG="${FLAG_ICONS_TAG:-v7.6.0}"
PAGEVIEWS_END="${PAGEVIEWS_END:-2026-10}"
DATA_DIR="${DATA_DIR:-$PROJECT_ROOT/data}"

SOURCES_DIR="$DATA_DIR/sources"
QUERY_FILE="$SOURCES_DIR/wikidata/capitals.rq"
ARTICLES_QUERY="$SOURCES_DIR/wikidata/articles.rq"
CLDR_NAMES="cldr-json/cldr-localenames-full"
CLDR_CORE="cldr-json/cldr-core"
CLDR_LOCALES=(de en)
ALL_SOURCES=(mledoze cldr wikidata wikimedia flag-icons)
SPARQL_ENDPOINT="https://query.wikidata.org/sparql"
PAGEVIEWS_API="https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/de.wikipedia.org/all-access/user"
USER_AGENT="what-the-flag-data-fetch/1.0 (https://what-the-flag.de)"

info()  { printf '[INFO]  %s\n' "$1"; }
fatal() { printf '[ERROR] %s\n' "$1" >&2; exit 1; }

# ── Pre-flight ──

for cmd in git curl jq; do
  command -v "$cmd" >/dev/null 2>&1 || fatal "Missing required command '$cmd'."
done
# The query file marks DATA_DIR as the data directory before any directory under it is replaced.
[[ -f "$QUERY_FILE" ]] || fatal "No $QUERY_FILE; DATA_DIR must point at the repository's data/."

if (($# == 0)); then
  set -- "${ALL_SOURCES[@]}"
fi
for source in "$@"; do
  [[ " ${ALL_SOURCES[*]} " == *" $source "* ]] \
    || fatal "Unknown source '$source'; expected any of: ${ALL_SOURCES[*]}."
done
SELECTED=" $* "
selected() { [[ "$SELECTED" == *" $1 "* ]]; }

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
STAGE="$WORK_DIR/stage"
mkdir -p "$STAGE"

# ── Download and stage ──

if selected mledoze; then
  info "mledoze/countries at $MLEDOZE_REV"
  git init -q "$WORK_DIR/mledoze"
  git -C "$WORK_DIR/mledoze" remote add origin https://github.com/mledoze/countries.git
  git -C "$WORK_DIR/mledoze" fetch -q --depth 1 origin "$MLEDOZE_REV"
  git -C "$WORK_DIR/mledoze" -c advice.detachedHead=false checkout -q FETCH_HEAD
  mkdir -p "$STAGE/mledoze-countries"
  cp "$WORK_DIR/mledoze/dist/countries.json" "$WORK_DIR/mledoze/LICENSE" "$STAGE/mledoze-countries/"
fi

if selected cldr; then
  info "cldr-json at $CLDR_TAG"
  git -c advice.detachedHead=false clone -q --depth 1 --branch "$CLDR_TAG" \
    --filter=blob:none --sparse https://github.com/unicode-org/cldr-json.git "$WORK_DIR/cldr"
  sparse_paths=("$CLDR_CORE/supplemental")
  for locale in "${CLDR_LOCALES[@]}"; do
    sparse_paths+=("$CLDR_NAMES/main/$locale")
  done
  git -C "$WORK_DIR/cldr" sparse-checkout set "${sparse_paths[@]}"
  for locale in "${CLDR_LOCALES[@]}"; do
    mkdir -p "$STAGE/cldr/$locale"
    cp "$WORK_DIR/cldr/$CLDR_NAMES/main/$locale/languages.json" "$STAGE/cldr/$locale/"
  done
  cp "$WORK_DIR/cldr/$CLDR_NAMES/main/de/territories.json" "$STAGE/cldr/de/"
  mkdir -p "$STAGE/cldr/supplemental"
  cp "$WORK_DIR/cldr/$CLDR_CORE/supplemental/aliases.json" "$WORK_DIR/cldr/$CLDR_CORE/supplemental/territoryInfo.json" \
    "$STAGE/cldr/supplemental/"
  # The packages share one LICENSE, which governs their data files; the repository root's covers the scripts.
  cp "$WORK_DIR/cldr/$CLDR_NAMES/LICENSE" "$STAGE/cldr/"
fi

if selected flag-icons; then
  info "flag-icons at $FLAG_ICONS_TAG"
  git -c advice.detachedHead=false clone -q --depth 1 --branch "$FLAG_ICONS_TAG" \
    https://github.com/lipis/flag-icons.git "$WORK_DIR/flag-icons"
  mkdir -p "$STAGE/flag-icons/4x3"
  cp "$WORK_DIR/flag-icons/flags/4x3/"*.svg "$STAGE/flag-icons/4x3/"
  cp "$WORK_DIR/flag-icons/LICENSE" "$STAGE/flag-icons/"
fi

if selected wikidata; then
  # Wikidata rate-limits to 1 request per minute during outages, hence the 65-second retry delay.
  info "Wikidata capitals"
  mkdir -p "$STAGE/wikidata"
  curl --silent --show-error --fail --retry 3 --retry-delay 65 \
    --header 'Accept: text/csv' --user-agent "$USER_AGENT" \
    --data-urlencode "query@$QUERY_FILE" --output "$STAGE/wikidata/capitals.csv" \
    "$SPARQL_ENDPOINT"
fi

if selected wikimedia; then
  start="$(date -d "$PAGEVIEWS_END-01 -11 months" +%Y%m%d)00"
  end="$(date -d "$PAGEVIEWS_END-01 +1 month -1 day" +%Y%m%d)00"
  info "Wikidata dewiki articles and their pageviews from $start to $end"
  mkdir -p "$STAGE/wikimedia"
  curl --silent --show-error --fail --retry 3 --retry-delay 65 \
    --header 'Accept: application/sparql-results+json' --user-agent "$USER_AGENT" \
    --data-urlencode "query@$ARTICLES_QUERY" --output "$WORK_DIR/articles.json" \
    "$SPARQL_ENDPOINT"
  jq -r '"iso2,article", (.results.bindings[] | [.iso2.value, .article.value] | @csv)' \
    "$WORK_DIR/articles.json" > "$STAGE/wikimedia/articles.csv"
  echo "article,views" > "$STAGE/wikimedia/pageviews.csv"
  jq -r '.results.bindings[].article.value' "$WORK_DIR/articles.json" | LC_ALL=C sort -u | while IFS= read -r article; do
    path="$(jq -rn --arg t "$article" '$t | gsub(" "; "_") | @uri')"
    views="$(curl --silent --show-error --fail --retry 3 --user-agent "$USER_AGENT" \
      "$PAGEVIEWS_API/$path/monthly/$start/$end" | jq '[.items[].views] | add')"
    jq -rn --arg a "$article" --argjson v "$views" '[$a, $v] | @csv' >> "$STAGE/wikimedia/pageviews.csv"
  done
fi

# ── Replace ──

for source in mledoze-countries cldr flag-icons; do
  [[ -d "$STAGE/$source" ]] || continue
  rm -rf "${SOURCES_DIR:?}/$source"
  cp -R "$STAGE/$source" "$SOURCES_DIR/$source"
done
if [[ -f "$STAGE/wikidata/capitals.csv" ]]; then
  cp "$STAGE/wikidata/capitals.csv" "$SOURCES_DIR/wikidata/capitals.csv"
fi
if [[ -d "$STAGE/wikimedia" ]]; then
  cp "$STAGE/wikimedia/articles.csv" "$SOURCES_DIR/wikidata/articles.csv"
  mkdir -p "$SOURCES_DIR/wikimedia"
  cp "$STAGE/wikimedia/pageviews.csv" "$SOURCES_DIR/wikimedia/pageviews.csv"
fi

info "Vendored into $SOURCES_DIR; review with: git diff --stat -- data/sources"
