#!/usr/bin/env bash
# Stop everything started by start.sh. Data is kept (use reset.sh to wipe it).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
stop_node gateway
stop_node mailcatcher
stop_node fake-anthropic
docker rm -f smallfold-postgrest smallfold-gotrue >/dev/null 2>&1 || true
pkill -f 'docker logs -f smallfold-' 2>/dev/null || true
if [ -d "$DATA_DIR/pg" ] && pg_running; then as_pg "$PG_BIN/pg_ctl" -D "$DATA_DIR/pg" -m fast -w stop >/dev/null; fi
echo "stopped"
