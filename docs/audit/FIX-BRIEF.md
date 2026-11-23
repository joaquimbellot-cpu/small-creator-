# Fix agent brief (Phase 2 rules)

Read this file, `docs/audit/00-project-map.md` and your issues in `docs/audit/FULL-REPORT.md` first. Each issue there names the source rows (for example `EML-01`) in the agents' reports `docs/audit/01-*.md` to `08-*.md`: read those rows for the full detail and the proposed fix before you change anything.

## Rules

1. **Fake local data only.** Never contact production (`*.supabase.co`, `*.netlify.app`, `api.supabase.com`), never use an MCP or connector tool, never start sub-agents. Never send a real email (mail goes only to the local catcher) and never call the real Anthropic API (the fake Claude is on `localhost:4010`). Never print or commit a secret, not even a fake local key.
2. **You own only the files in your assignment.** Do not edit any other file, because other agents are editing theirs at the same time. If a fix needs a change in a file you do not own, do the part you can and write the rest in your log under "Needs another agent".
3. **Smallest change that fixes the problem.** Keep the existing style: short comments that explain why, plain-English messages for people. No new features and no large rewrites. If a problem truly cannot be fixed without one, stop on that item and explain why in your log.
4. **Database changes only as NEW migration files** in `admin/supabase/migrations/` named `20261123NNNNNN_<topic>.sql`. Never edit an existing migration. Each new file starts with a comment that says what it does, whether it is safe on the live database that already has all earlier migrations and real rows, and how to roll it back. Nothing may delete or rewrite existing data; if a change must, describe the backup step first and stop.
5. **The test stack is shared.** Same rules as `AGENT-BRIEF.md` rule 5: do not run `admin/dev/reset.sh`, `stop.sh` or `start.sh`, do not build or restart the shared app on port 3000, do not kill other processes. Test data you create starts with `ZZ AUDIT` and is deleted before you finish. Wrong-password tests use made-up emails and your own `x-real-ip`.
6. **To try your change in a browser,** start your own dev server and stop it when you are done:
   `cd admin && NEXT_DIST_DIR=.next-<your group> EMAIL_FROM=smallfold-test@example.test env -u ANTHROPIC_BASE_URL npx next dev -p <your port>`
   Afterwards run `git checkout -- admin/tsconfig.json` and delete `admin/.next-<your group>`. Playwright is installed (`require('playwright')`).
7. **Checks before you finish:** `cd admin && npx tsc --noEmit` and `npx vitest run` must pass. Add or update unit tests for logic you change where it is practical. If you changed SQL, apply it with `bash admin/dev/migrate.sh` and run `bash admin/supabase/tests/run.sh`.
8. **No git commands that change history or branches** (`commit`, `checkout <branch>`, `switch`, `stash`, `reset`, `clean`). The leader commits each group.
9. **Write a log** at `docs/audit/fixes/<your group>.md`: a table `ID | Status | Files changed | What changed | How it was checked`, where Status is Fixed, Not fixed (with the reason) or Needs owner (a money, legal or product decision). Then the sections "Needs another agent" and "Tests run". Reply to the leader in 10 lines or fewer.
