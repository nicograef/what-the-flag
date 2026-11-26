#!/usr/bin/env bash
# fetch-data-sources.sh – vendor the pinned country sources into data/sources/
#
# Usage:
#   scripts/fetch-data-sources.sh
#   MLEDOZE_REV=<commit> CLDR_TAG=<tag> FLAG_ICONS_TAG=<tag> scripts/fetch-data-sources.sh
#
# What it does:
#   1. Clones mledoze/countries at MLEDOZE_REV, cldr-json at CLDR_TAG (sparse: the de locale names)
#      and flag-icons at FLAG_ICONS_TAG into a temporary directory
#   2. POSTs data/sources/wikidata/capitals.rq to the Wikidata SPARQL endpoint for capitals.csv
#   3. Only after every download succeeded, replaces each data/sources/<source>/ with the files
#      the importer reads plus the source's LICENSE, and writes capitals.csv as served (CRLF)
#
# It writes nothing outside DATA_DIR/sources. A pin change also updates data/SOURCES.md by hand.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MLEDOZE_REV="${MLEDOZE_REV:-fa4f62182d19ff4f8b325cde6387c9cd9d80955a}"
CLDR_TAG="${CLDR_TAG:-49.0.0}"
FLAG_ICONS_TAG="${FLAG_ICONS_TAG:-v7.6.0}"
DATA_DIR="${DATA_DIR:-$PROJECT_ROOT/data}"

SOURCES_DIR="$DATA_DIR/sources"
QUERY_FILE="$SOURCES_DIR/wikidata/capitals.rq"
CLDR_PACKAGE="cldr-json/cldr-localenames-full"
SPARQL_ENDPOINT="https://query.wikidata.org/sparql"
USER_AGENT="what-the-flag-data-fetch/1.0 (https://what-the-flag.de)"

info()  { printf '[INFO]  %s\n' "$1"; }
fatal() { printf '[ERROR] %s\n' "$1" >&2; exit 1; }

# ── Pre-flight ──

for cmd in git curl; do
  command -v "$cmd" >/dev/null 2>&1 || fatal "Missing required command '$cmd'."
done
# The query file marks DATA_DIR as the data directory before any directory under it is replaced.
[[ -f "$QUERY_FILE" ]] || fatal "No $QUERY_FILE; DATA_DIR must point at the repository's data/."

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
STAGE="$WORK_DIR/stage"
mkdir -p "$STAGE"

# ── Download ──

info "mledoze/countries at $MLEDOZE_REV"
git init -q "$WORK_DIR/mledoze"
git -C "$WORK_DIR/mledoze" remote add origin https://github.com/mledoze/countries.git
git -C "$WORK_DIR/mledoze" fetch -q --depth 1 origin "$MLEDOZE_REV"
git -C "$WORK_DIR/mledoze" -c advice.detachedHead=false checkout -q FETCH_HEAD

info "cldr-json at $CLDR_TAG"
git -c advice.detachedHead=false clone -q --depth 1 --branch "$CLDR_TAG" \
  --filter=blob:none --sparse https://github.com/unicode-org/cldr-json.git "$WORK_DIR/cldr"
git -C "$WORK_DIR/cldr" sparse-checkout set "$CLDR_PACKAGE/main/de"

info "flag-icons at $FLAG_ICONS_TAG"
git -c advice.detachedHead=false clone -q --depth 1 --branch "$FLAG_ICONS_TAG" \
  https://github.com/lipis/flag-icons.git "$WORK_DIR/flag-icons"

# Wikidata rate-limits to 1 request per minute during outages, hence the 65-second retry delay.
info "Wikidata capitals"
mkdir -p "$STAGE/wikidata"
curl --silent --show-error --fail --retry 3 --retry-delay 65 \
  --header 'Accept: text/csv' --user-agent "$USER_AGENT" \
  --data-urlencode "query@$QUERY_FILE" --output "$STAGE/wikidata/capitals.csv" \
  "$SPARQL_ENDPOINT"

# ── Stage ──

mkdir -p "$STAGE/mledoze-countries" "$STAGE/cldr/de" "$STAGE/flag-icons/4x3"
cp "$WORK_DIR/mledoze/dist/countries.json" "$WORK_DIR/mledoze/LICENSE" "$STAGE/mledoze-countries/"
cp "$WORK_DIR/cldr/$CLDR_PACKAGE/main/de/territories.json" "$STAGE/cldr/de/"
# The package's LICENSE governs its data files; the repository root's covers the scripts.
cp "$WORK_DIR/cldr/$CLDR_PACKAGE/LICENSE" "$STAGE/cldr/"
cp "$WORK_DIR/flag-icons/flags/4x3/"*.svg "$STAGE/flag-icons/4x3/"
cp "$WORK_DIR/flag-icons/LICENSE" "$STAGE/flag-icons/"

# ── Replace ──

for source in mledoze-countries cldr flag-icons; do
  rm -rf "${SOURCES_DIR:?}/$source"
  cp -R "$STAGE/$source" "$SOURCES_DIR/$source"
done
cp "$STAGE/wikidata/capitals.csv" "$SOURCES_DIR/wikidata/capitals.csv"

info "Vendored into $SOURCES_DIR; review with: git diff --stat -- data/sources"
