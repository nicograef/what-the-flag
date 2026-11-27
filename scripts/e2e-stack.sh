#!/usr/bin/env bash
# e2e-stack.sh — run a command against the production stack, built from this tree and served with local TLS
#
# Usage:
#   scripts/e2e-stack.sh <command> [args]          # make e2e runs scripts/smoke.sh
#   E2E_STACK_PROJECT=<name> E2E_STACK_PORT=<port> scripts/e2e-stack.sh <command> [args]
#
# What it does:
#   1. Selects docker-compose.prod.yml and docker-compose.e2e.yml, plus docker-compose.local.yml when present,
#      under its own project name, with throwaway database credentials.
#   2. Builds the images and starts the stack, waiting for every healthcheck and the migrate one-shot;
#      on a failure prints the containers and the logs.
#   3. Runs the command with E2E_BASE_URL=https://what-the-flag.de:E2E_STACK_PORT; on a failure prints the logs.
#   4. Removes the stack and its volumes on every exit.
#
# Exits with the command's status.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

[[ $# -gt 0 ]] || { echo "Usage: scripts/e2e-stack.sh <command> [args]" >&2; exit 2; }

# ── Configuration ──
export COMPOSE_PROJECT_NAME="${E2E_STACK_PROJECT:-what-the-flag-e2e}"
export E2E_STACK_PORT="${E2E_STACK_PORT:-8443}"
COMPOSE_FILE="docker-compose.prod.yml:docker-compose.e2e.yml"
# Machine-local build settings (gitignored), e.g. a CA for a TLS-intercepting proxy.
if [[ -f docker-compose.local.yml ]]; then
  COMPOSE_FILE+=":docker-compose.local.yml"
fi
export COMPOSE_FILE
export COMPOSE_PROFILES=e2e
export POSTGRES_USER=e2e POSTGRES_PASSWORD=e2e POSTGRES_DB=whattheflag

# ── Stack ──
trap 'docker compose down -v >/dev/null 2>&1 || echo "e2e-stack: docker compose down failed" >&2' EXIT

if ! docker compose up -d --build --wait; then
  docker compose ps -a >&2
  docker compose logs --no-color >&2
  exit 1
fi

# ── Command ──
export E2E_BASE_URL="https://what-the-flag.de:$E2E_STACK_PORT"
status=0
"$@" || status=$?
if [[ $status -ne 0 ]]; then
  docker compose logs --no-color >&2
fi
exit "$status"
