#!/usr/bin/env bash
#
# Start the FastAPI backend and the Next.js front-end together, with one Ctrl+C.
#
# Why this exists instead of `npm-run-all` / `concurrently`: those are two more
# packages in an exact-pinned tree that Dependabot tracks, and the only thing
# this needs to do is fork two processes and reap them. ~80 lines of shell is
# cheaper than a dependency (see the dependency-discipline note in ROADMAP §5).
#
# Usage:
#   ./dev.sh              # both servers, output tagged [api] / [web]
#   API_PORT=9000 ./dev.sh
#   ./dev.sh --api-only   # just uvicorn, if you do not need the UI
#   ./dev.sh --web-only
#
# Both processes are started with job control enabled (set -m) so each one gets
# its own process group. That is what lets Ctrl+C take down uvicorn *and* the
# reloader/child processes it spawns, instead of orphaning a server that keeps
# the port bound. This is the whole trick; without -m, `kill $PID` leaves the
# grandchildren running and the next start fails on "address already in use".

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
API_PORT="${API_PORT:-8000}"

MODE="both"
case "${1:-}" in
  --api-only) MODE="api" ;;
  --web-only) MODE="web" ;;
  --help | -h)
    sed -n '3,14p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  "") ;;
  *)
    printf 'unknown option: %s (try --help)\n' "$1" >&2
    exit 2
    ;;
esac

die() {
  printf '\033[31merror:\033[0m %s\n' "$1" >&2
  exit 1
}

# --- preflight ---------------------------------------------------------------
# Checked up front rather than auto-fixed: `pip install` takes minutes and
# creating a venv as a side effect of a dev script is surprising. Failing with
# the exact command to run is faster and more honest.

API_PYTHON="$BACKEND/.venv/bin/python"
if [ "$MODE" != "web" ] && [ ! -x "$API_PYTHON" ]; then
  die "no virtualenv at backend/.venv
  cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt"
fi

if [ "$MODE" != "api" ]; then
  command -v node >/dev/null 2>&1 ||
    die "node is not on PATH. Node 18.17+ required; 'nvm use' in frontend/ picks up .nvmrc."
  [ -d "$FRONTEND/node_modules" ] ||
    die "frontend/node_modules is missing
  cd frontend && npm install && cp .env.example .env.local"
fi

# --- output tagging ----------------------------------------------------------
# Each line is prefixed so you can tell the two servers apart. The pipe also
# makes both tools see a non-TTY, which turns off uvicorn's and Next's own ANSI
# codes - the output ends up readable instead of interleaved noise.

if [ -t 1 ]; then
  API_TAG=$'\033[36m[api]\033[0m '
  WEB_TAG=$'\033[35m[web]\033[0m '
else
  API_TAG='[api] '
  WEB_TAG='[web] '
fi

API_PID=""
WEB_PID=""
STOPPING=0

cleanup() {
  STOPPING=1
  trap - INT TERM EXIT
  for pid in "$API_PID" "$WEB_PID"; do
    [ -n "$pid" ] || continue
    # Negative pid = the whole process group (see the note at the top).
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  done
  wait "$API_PID" 2>/dev/null || true
  wait "$WEB_PID" 2>/dev/null || true
  printf '\nstopped.\n'
}
trap cleanup INT TERM EXIT

set -m # each background job gets its own process group

if [ "$MODE" != "web" ]; then
  (
    cd "$BACKEND"
    exec "$API_PYTHON" -m uvicorn app.main:app --reload --port "$API_PORT"
  ) 2>&1 | awk -v tag="$API_TAG" '{ printf "%s%s\n", tag, $0; fflush() }' &
  API_PID=$!
fi

if [ "$MODE" != "api" ]; then
  (cd "$FRONTEND" && exec npm run dev) 2>&1 |
    awk -v tag="$WEB_TAG" '{ printf "%s%s\n", tag, $0; fflush() }' &
  WEB_PID=$!
fi

printf '\n'
if [ "$MODE" != "web" ]; then
  printf '  API   http://localhost:%s/docs\n' "$API_PORT"
fi
if [ "$MODE" != "api" ]; then
  printf '  Studio  http://localhost:3000\n'
fi
printf '\n  Ctrl+C stops everything.\n\n'

# `wait -n` would be the natural way to notice one server dying, but it needs
# bash 4.3 and macOS still ships 3.2, so poll instead.
while :; do
  api_alive=0
  web_alive=0
  [ -z "$API_PID" ] || kill -0 "$API_PID" 2>/dev/null && api_alive=1
  [ -z "$WEB_PID" ] || kill -0 "$WEB_PID" 2>/dev/null && web_alive=1

  # After the trap has run, both children are dead on purpose - say nothing more.
  if [ "$STOPPING" -eq 1 ]; then
    break
  fi

  # Otherwise a process really did die on its own; don't leave the other running
  # against a backend that is no longer there.
  if [ "$api_alive" -eq 0 ] && [ -n "$API_PID" ]; then
    printf '\n[dev] the backend exited - stopping the front-end too\n'
    break
  fi
  if [ "$web_alive" -eq 0 ] && [ -n "$WEB_PID" ]; then
    printf '\n[dev] the front-end exited - stopping the backend too\n'
    break
  fi
  sleep 1
done

exit 0