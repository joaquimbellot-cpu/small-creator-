#!/usr/bin/env bash
# Database tests only (not vitest or the browser tests: admin/tests/run-all.sh runs those too).
# Run against the seeded local stack (start it first: admin/dev/start.sh).
#   SQL  : rls, activity, hardening, forms, assistant, fixes; each file in its own transaction that is rolled back
#   HTTP : the same promises through the gateway with the real anon key and real logins
source "$(dirname "${BASH_SOURCE[0]}")/../../dev/lib.sh"
T="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PGOPTIONS='-c client_min_messages=notice'
echo "== SQL tests =="
out=$(psql -q -o /dev/null -v ON_ERROR_STOP=1 -f "$T/rls.sql" 2>&1) && rc=0 || rc=$?
out2=$(for f in activity hardening forms assistant fixes; do [ -f "$T/$f.sql" ] || continue; psql -q -o /dev/null -v ON_ERROR_STOP=1 -f "$T/$f.sql" 2>&1 || exit 1; done) && rc2=0 || rc2=$?
out="$out
$out2"; [ "$rc2" = 0 ] || rc=$rc2
echo -e "$out" | sed -n 's/^.*NOTICE:  //p'
[ "$rc" = 0 ] || { echo "$out" | grep -E 'ERROR|DETAIL' ; echo "SQL tests FAILED"; exit 1; }
echo "== HTTP tests (gateway :54321) =="
node "$T/gateway.test.mjs"
