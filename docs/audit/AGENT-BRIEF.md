# Audit agent brief (rules, severity scale, report format)

Read this file and `docs/audit/00-project-map.md` before anything else. The team leader gives you one role, one report file and one scratch folder.

## Hard rules

1. **Fake local data only. Never touch production.** Do not send any request to `*.supabase.co`, `*.netlify.app`, `api.supabase.com` or any other live service. Do not use any MCP or connector tool (Netlify, Supabase, GitHub, Gmail, Google Drive, Google Sheets, Shopify or others) and do not start sub-agents. The internet is only for package-registry and advisory lookups such as `npm audit` or `npm outdated`.
2. **Never send a real email and never call the real Anthropic API.** Local mail goes to the mail catcher (SMTP `localhost:1025`, web `http://localhost:8025`). Claude is a fake on `localhost:4010`. Before an email test, check that `SMTP_HOST` in `admin/.env.local` is `localhost`, and print no other value from that file.
3. **Never print, paste, log or commit a secret or key,** not even the fake local ones. In reports, name a variable, never its value.
4. **You change no code and no configuration.** The only file you create in the repo is your own report in `docs/audit/`. Scratch files, scripts and screenshots go in your scratch folder, never in the repo. Do not run `git commit`, `git checkout <branch>`, `git switch`, `git stash`, `git reset` or `git clean`. If a tool changed a tracked file (for example `admin/tsconfig.json`), restore only that file with `git checkout -- <file>`. Before you finish, run `git status --short`: only your report may be new.
5. **The test stack is shared with other agents.**
   - Do not run `admin/dev/reset.sh`, `stop.sh` or `start.sh`, and do not stop or kill node, next, postgres or docker processes.
   - Do not run `npm run build` or `next build` in `admin/`, because that would break the running app. If you must build, set `NEXT_DIST_DIR` to a folder inside your scratch folder, then restore `admin/tsconfig.json`.
   - Give everything you create in the app (creators, deals, emails, templates, brands) a name starting with `ZZ AUDIT`. Delete it, or put back anything you changed (settings included), before you finish.
   - **Login limit:** the app blocks an email address, and separately an IP address, after 5 failed logins in 15 minutes. Locally all requests share ONE IP bucket unless they send an `x-real-ip` header, so one careless test locks every agent out. Any test with a wrong password must use a made-up email address (never `owner@` or `worker@example.test`), and must send your own `x-real-ip` header (for example `10.77.<your agent number>.<n>`). With Playwright, set it with `browser.newContext({ extraHTTPHeaders: { 'x-real-ip': '…' } })`.
6. **Evidence only.** Every issue must come from code you read or something you ran. Open the file and check the line number before you write it down. If you could not confirm something, mark it `unverified`. Fewer true issues beat many weak ones. No duplicates within your report.
7. **Reply to the leader in 10 lines or fewer:** the report path, the number of issues per severity, your score, your top 3 findings, and anything you were blocked on or could not confirm. Everything else goes in the report.

## Severity scale

- **Critical:** a personal-data leak, account takeover, an email sent without approval, data loss, or another way in for an attacker, possible today.
- **High:** a serious bug or weakness that is likely to hurt users or break a core flow, or a safeguard the owner required that is missing or can be bypassed.
- **Medium:** a real problem with limited impact, or one that needs unusual conditions.
- **Low:** polish, hardening, small inconsistencies.

## Report format

File `docs/audit/<number>-<role>.md`, in plain English, with these sections in this order:

1. **Scope and method:** 3 to 6 lines on what you checked and what you ran.
2. **Done well:** bullets.
3. **Issues:** one table with exactly these columns, sorted Critical, High, Medium, Low:
   `ID | Severity | Location | What is wrong | Why it matters | Exact fix | Effort`
   - ID: role prefix and number, for example ARC-01, SEC-01, DB-01, QA-01, EML-01, UX-01, PERF-01, DOC-01.
   - Location: `admin/path/file.ts:LINE`, or a page address such as `/creators`.
   - Exact fix: concrete. Name the file and the change, with a short snippet or SQL (10 lines at most). "Improve security" is not a fix.
   - Effort: small (under 1 hour), medium (1 to 4 hours), large (over 4 hours).
   - Each cell is one line. Use `<br>` for a line break and `\|` for a pipe.
4. **Not checked or limits:** what you could not test, and why.
5. **Last line:** `Score: N/10` followed by one sentence of reasoning (1 is broken, 10 is excellent).

Legal remarks (spam and privacy laws) are observations, not legal advice.
