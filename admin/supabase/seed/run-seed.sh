#!/usr/bin/env bash
# Seed the local database: logins through the GoTrue admin API, then the fake data in seed.sql.
# Local stack only (run after start.sh has the stack up). Fake data only.
source "$(dirname "${BASH_SOURCE[0]}")/../../dev/lib.sh"
node "$(dirname "${BASH_SOURCE[0]}")/create-users.mjs"
psql -q -v ON_ERROR_STOP=1 -f "$(dirname "${BASH_SOURCE[0]}")/seed.sql"
echo "seeded: $(psql -tAc "select count(*) from public.creators") creators, $(psql -tAc "select count(*) from public.emails") emails, $(psql -tAc "select count(*) from public.deals") deals"
