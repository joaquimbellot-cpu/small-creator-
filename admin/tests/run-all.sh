#!/usr/bin/env bash
# Runs every suite, in order, against the running local stack (fake data only):
#   DB tests -> vitest -> QA e2e (this folder) -> creators, deals, email e2e -> auth e2e (last: it trips the login rate limit)
# Needs: the stack from admin/dev/start.sh and the dev server on :3000. Starts and resets nothing.
# Prints one summary line per suite. Exits 1 if any suite fails.
set -uo pipefail
ADMIN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ADMIN" || exit 1
export NODE_PATH="${NODE_PATH:-/opt/node-tools/node_modules}"

overall=0
run_suite() {
  local name=$1; shift
  local out rc
  out=$("$@" 2>&1); rc=$?
  local pass fail
  pass=$(printf '%s\n' "$out" | grep -cE '^\s*(PASS|ok)\b' || true)
  fail=$(printf '%s\n' "$out" | grep -cE '^\s*FAIL\b' || true)
  if [ "$rc" = 0 ]; then status=PASS; else status=FAIL; overall=1; fi
  printf '%-22s %s  (exit %s, ~%s pass lines, ~%s fail lines)\n' "$name" "$status" "$rc" "$pass" "$fail"
  if [ "$rc" != 0 ]; then printf '%s\n' "$out" | tail -25 | sed 's/^/    | /'; fi
}

run_suite "DB tests"         bash supabase/tests/run.sh
run_suite "vitest"           npx vitest run
run_suite "QA e2e"           node tests/qa.e2e.cjs
run_suite "creators e2e"     node lib/creators/e2e.cjs
run_suite "deals e2e"        node lib/deals/e2e.cjs
run_suite "email e2e"        node lib/email/e2e.cjs
run_suite "auth e2e"         node scripts/e2e-auth.cjs

if [ "$overall" = 0 ]; then echo "ALL SUITES PASSED"; else echo "SOME SUITES FAILED"; fi
exit "$overall"
