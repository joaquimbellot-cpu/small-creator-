# Shared settings for the local Supabase-like stack. Sourced by start/stop/reset/migrate scripts.
set -euo pipefail

DEV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="$(cd "$DEV_DIR/.." && pwd)"
DATA_DIR="$DEV_DIR/.data"
LOG_DIR="$DEV_DIR/.logs"
MAIL_DIR="$DEV_DIR/.mail"
PID_DIR="$DEV_DIR/.pids"
PG_BIN=/usr/lib/postgresql/16/bin
PG_PORT=54322
export PGOPTIONS='-c client_min_messages=warning'
export PGHOST=127.0.0.1 PGPORT=$PG_PORT PGUSER=postgres PGDATABASE=postgres

GOTRUE_IMAGE=supabase/gotrue:v2.177.0
POSTGREST_IMAGE=postgrest/postgrest:v12.2.12

# Run a command as the postgres OS user when we are root (initdb refuses to run as root).
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }

pg_running() { as_pg "$PG_BIN/pg_ctl" -D "$DATA_DIR/pg" status >/dev/null 2>&1; }

# Wait until a URL answers (any HTTP status), or give up after ~40s.
wait_http() {
  local url=$1 name=$2
  for _ in $(seq 1 80); do
    if curl -s -o /dev/null --max-time 1 "$url"; then return 0; fi
    sleep 0.5
  done
  echo "timeout waiting for $name at $url (see $LOG_DIR)" >&2; return 1
}

# Start a node script in the background, log to .logs, remember its pid.
start_node() {
  local name=$1; shift
  if [ -f "$PID_DIR/$name.pid" ] && kill -0 "$(cat "$PID_DIR/$name.pid")" 2>/dev/null; then return 0; fi
  nohup node "$@" >"$LOG_DIR/$name.log" 2>&1 &
  echo $! >"$PID_DIR/$name.pid"
}

stop_node() {
  local name=$1
  if [ -f "$PID_DIR/$name.pid" ]; then
    kill "$(cat "$PID_DIR/$name.pid")" 2>/dev/null || true
    : >"$PID_DIR/$name.pid"
  fi
}
