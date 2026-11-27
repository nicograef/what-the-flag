#!/usr/bin/env bash
# smoke.sh — smoke checks against one running stack, through its edge
#
# Usage (scripts/e2e-stack.sh sets every variable below):
#   scripts/e2e-stack.sh scripts/smoke.sh          # make e2e
#
# What it does:
#   1. Reaches E2E_BASE_URL (https://<host>:<port>) on 127.0.0.1, trusting any certificate.
#   2. Checks health, a new run, its first question, the run's quiz, the leaderboard and the SPA route
#      of the quiz, then the migration version of the stack's database (Compose `postgres` service).
#   3. Prints `ok <check>` per passed check; the first failure exits 1.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

: "${E2E_BASE_URL:?E2E_BASE_URL is not set; run through scripts/e2e-stack.sh}"
: "${POSTGRES_USER:?POSTGRES_USER is not set}"
: "${POSTGRES_DB:?POSTGRES_DB is not set}"

AUTHORITY="${E2E_BASE_URL#https://}"
HOST="${AUTHORITY%%:*}"
PORT="${AUTHORITY##*:}"
[[ "$AUTHORITY" == "$HOST:$PORT" && "$PORT" =~ ^[0-9]+$ ]] \
  || { echo "E2E_BASE_URL must be https://<host>:<port> (got '$E2E_BASE_URL')" >&2; exit 1; }

ok()   { echo "ok $1"; }
fail() { echo "FAIL $1: $2" >&2; exit 1; }

# -k: the stack's certificate comes from Caddy's local CA. The stack is on loopback, so no proxy applies.
req() { curl -fsS -k --noproxy '*' --resolve "$HOST:$PORT:127.0.0.1" "$@"; }

# expect CHECK JSON FILTER — the jq filter must hold on the body.
expect() { jq -e "$3" >/dev/null <<<"$2" || fail "$1" "$2"; }

body="$(req "$E2E_BASE_URL/api/health")" || fail health "request failed"
expect health "$body" '. == {"status": "ok"}'
ok health

out="$(req -w '\n%{http_code}' -X POST -H 'Content-Type: application/json' -H "Origin: $E2E_BASE_URL" \
  --data '{"name":"smoke"}' "$E2E_BASE_URL/api/runs")" || fail run "request failed"
body="$(sed '$d' <<<"$out")"
[[ "$(tail -n1 <<<"$out")" == 201 ]] || fail run "status $(tail -n1 <<<"$out"), body $body"
expect run "$body" '(.runId | type == "string") and (.quizId | type == "string")'
RUN_ID="$(jq -r .runId <<<"$body")"
QUIZ_ID="$(jq -r .quizId <<<"$body")"
ok run

body="$(req "$E2E_BASE_URL/api/runs/$RUN_ID")" || fail question "request failed"
expect question "$body" '.status == "playing" and .question.position == 0'
ok question

body="$(req "$E2E_BASE_URL/api/quizzes/$QUIZ_ID")" || fail challenge "request failed"
expect challenge "$body" '.creator.name == "smoke"'
ok challenge

body="$(req "$E2E_BASE_URL/api/leaderboard")" || fail leaderboard "request failed"
expect leaderboard "$body" '.top | type == "array"'
ok leaderboard

body="$(req "$E2E_BASE_URL/q/$QUIZ_ID")" || fail spa "request failed"
grep -q '<div id="root">' <<<"$body" || fail spa "no <div id=\"root\">"
grep -q 'og:image' <<<"$body" || fail spa "no og:image"
ok spa

LATEST="$(find database/migrations -name '*.up.sql' | sed -E 's#.*/0*([0-9]+)_[^/]*$#\1#' | sort -n | tail -n1)"
got="$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc 'SELECT version, dirty FROM schema_migrations')" \
  || fail migrations "query failed"
[[ "$got" == "$LATEST|f" ]] || fail migrations "got '$got', want '$LATEST|f'"
ok migrations
