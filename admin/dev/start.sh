#!/usr/bin/env bash
# Start the local test stack: Postgres 16, GoTrue, PostgREST, gateway (54321), mail catcher (1025/8025).
# Safe to run repeatedly. Nothing blocks the shell; logs go to admin/dev/.logs/.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
mkdir -p "$LOG_DIR" "$MAIL_DIR" "$PID_DIR" "$DATA_DIR"
[ "$(id -u)" = 0 ] && chmod 777 "$LOG_DIR"

# secrets + admin/.env.local
node "$DEV_DIR/keys.mjs" init
JWT_SECRET=$(node "$DEV_DIR/keys.mjs" get jwt_secret)

# 1. Postgres cluster
if [ ! -d "$DATA_DIR/pg" ]; then
  echo "init postgres cluster"
  [ "$(id -u)" = 0 ] && chown postgres "$DATA_DIR"
  mkdir -p "$DATA_DIR/sock"; [ "$(id -u)" = 0 ] && chown postgres "$DATA_DIR/sock"
  as_pg "$PG_BIN/initdb" -D "$DATA_DIR/pg" -U postgres -A trust -E UTF8 --locale=C.UTF-8 >"$LOG_DIR/initdb.log" 2>&1
  cat >>"$DATA_DIR/pg/postgresql.conf" <<CONF
port = $PG_PORT
listen_addresses = '127.0.0.1'
unix_socket_directories = '$DATA_DIR/sock'
fsync = off
synchronous_commit = off
CONF
fi
if ! pg_running; then
  [ "$(id -u)" = 0 ] && touch "$LOG_DIR/postgres.log" && chown postgres "$LOG_DIR/postgres.log"
  as_pg "$PG_BIN/pg_ctl" -D "$DATA_DIR/pg" -l "$LOG_DIR/postgres.log" -w start >/dev/null
fi
psql -q -v ON_ERROR_STOP=1 -f "$DEV_DIR/bootstrap-roles.sql"

# 2. mail catcher first (GoTrue and the app send to it)
start_node mailcatcher "$DEV_DIR/mailcatcher.mjs"

# 3. GoTrue (runs its own auth migrations on boot)
docker rm -f smallfold-gotrue >/dev/null 2>&1 || true
docker run -d --name smallfold-gotrue --network host \
  -e GOTRUE_API_HOST=127.0.0.1 -e GOTRUE_API_PORT=9999 \
  -e API_EXTERNAL_URL=http://localhost:54321 \
  -e GOTRUE_DB_DRIVER=postgres \
  -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:local-dev@127.0.0.1:$PG_PORT/postgres?search_path=auth" \
  -e GOTRUE_SITE_URL=http://localhost:3000 \
  -e GOTRUE_URI_ALLOW_LIST="http://localhost:3000/**" \
  -e GOTRUE_DISABLE_SIGNUP=true \
  -e GOTRUE_JWT_SECRET="$JWT_SECRET" -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated \
  -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role \
  -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=false \
  -e GOTRUE_SMTP_HOST=127.0.0.1 -e GOTRUE_SMTP_PORT=1025 -e GOTRUE_SMTP_USER= -e GOTRUE_SMTP_PASS= \
  -e GOTRUE_SMTP_ADMIN_EMAIL=no-reply@example.test -e GOTRUE_SMTP_SENDER_NAME=Smallfold-local \
  -e GOTRUE_SMTP_MAX_FREQUENCY=1s \
  -e GOTRUE_MAILER_URLPATHS_INVITE=/auth/v1/verify -e GOTRUE_MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify \
  -e GOTRUE_MAILER_URLPATHS_RECOVERY=/auth/v1/verify -e GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify \
  -e GOTRUE_MFA_TOTP_ENROLL_ENABLED=true -e GOTRUE_MFA_TOTP_VERIFY_ENABLED=true \
  -e GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true -e GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 \
  -e GOTRUE_LOG_LEVEL=info \
  "$GOTRUE_IMAGE" >/dev/null
wait_http http://127.0.0.1:9999/health GoTrue
for _ in $(seq 1 60); do   # wait for its migrations to create auth.users
  [ "$(psql -tAc "select to_regclass('auth.users') is not null")" = t ] && break; sleep 1
done
(docker logs -f smallfold-gotrue >"$LOG_DIR/gotrue.log" 2>&1 &) 

# 4. migrations, then seed (first start only)
bash "$DEV_DIR/migrate.sh"
if [ "$(psql -tAc "select count(*) from public.creators")" = 0 ] && [ -z "${NO_SEED:-}" ]; then
  bash "$ADMIN_DIR/supabase/seed/run-seed.sh"
fi

# 5. PostgREST
docker rm -f smallfold-postgrest >/dev/null 2>&1 || true
docker run -d --name smallfold-postgrest --network host \
  -e PGRST_DB_URI="postgres://authenticator:local-dev@127.0.0.1:$PG_PORT/postgres" \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_EXTRA_SEARCH_PATH=public,extensions \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$JWT_SECRET" \
  -e PGRST_SERVER_HOST=127.0.0.1 -e PGRST_SERVER_PORT=3001 \
  "$POSTGREST_IMAGE" >/dev/null
wait_http http://127.0.0.1:3001/ PostgREST
(docker logs -f smallfold-postgrest >"$LOG_DIR/postgrest.log" 2>&1 &)

# 6. gateway
start_node gateway "$DEV_DIR/gateway.mjs"
wait_http http://127.0.0.1:54321/health gateway

cat <<MSG

Local stack is up.
  API gateway   http://localhost:54321   (/auth/v1, /rest/v1)
  Mail catcher  http://localhost:8025    (SMTP 1025, files in admin/dev/.mail)
  Postgres      postgres://postgres@127.0.0.1:$PG_PORT/postgres   (psql -h 127.0.0.1 -p $PG_PORT -U postgres)
  Env file      admin/.env.local
  Logins        see admin/supabase/seed/EXPECTED.md
  Logs          admin/dev/.logs/
MSG
