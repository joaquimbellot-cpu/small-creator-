#!/usr/bin/env bash
# Wipe the local database, mail and secrets, then rebuild from the migrations and the seed.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
bash "$DEV_DIR/stop.sh"
rm -rf "${DATA_DIR:?}" "${MAIL_DIR:?}" "${LOG_DIR:?}" "${PID_DIR:?}"
exec bash "$DEV_DIR/start.sh"
