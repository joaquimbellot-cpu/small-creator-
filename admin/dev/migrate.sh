#!/usr/bin/env bash
# Apply admin/supabase/migrations/*.sql in order, once each (tracked like the Supabase CLI does).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
psql -q -v ON_ERROR_STOP=1 <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, applied_at timestamptz default now());
SQL
for f in "$ADMIN_DIR"/supabase/migrations/*.sql; do
  base=$(basename "$f" .sql); version=${base%%_*}
  if [ "$(psql -tAc "select 1 from supabase_migrations.schema_migrations where version='$version'")" = 1 ]; then continue; fi
  echo "migrate: $base"
  psql -q -v ON_ERROR_STOP=1 -1 -f "$f"
  psql -q -c "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$base')"
done
