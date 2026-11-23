# FA database fixes

Migrations (new, apply in this order): `admin/supabase/migrations/20261123000100_creator_and_email_guards.sql`, `20261123000200_audit_logins_forms.sql`, `20261123000300_stats_activity_indexes.sql`. Each starts with what it does, why it is safe on the live database, how to roll back, and (for the first) the VALIDATE statements plus the query that lists rows that would fail.
Tests: `admin/supabase/tests/fixes.sql` (new, 58 checks, added to `run.sh`). Other files: `admin/dev/migrate.sh`, `admin/supabase/tests/{run.sh,README.md,rls.sql,hardening.sql,forms.sql,assistant.sql,activity.sql}`, `admin/supabase/seed/seed.sql`.

| ID | Status | Files changed | What changed | How it was checked |
|---|---|---|---|---|
| H07 | Fixed | migration 000100 | `release_stale_sending(p_minutes integer default 15) returns integer`, SECURITY DEFINER, service_role only. Moves `sending` older than p_minutes to `failed` with the plain message; goes through emails_guard and the audit trigger (`email.status_changed`). | fixes.sql: count, fresh row untouched, audit line, idempotent, authenticated/anon refused |
| M01 | Fixed | migration 000100 | `creators_guard` (only the owner leaves do_not_contact); `creators_suppress_manual` adds a `manual` suppression row when a creator becomes do_not_contact (update or insert) and removes only the `manual` row when the owner lifts it. `opt_out` redefined (same behaviour) so a real opt-out keeps its own reason and is not stored as `manual`. No loop with `suppression_after`. | fixes.sql: worker sets and cannot lift, owner lifts, real opt-out survives, insert as do_not_contact |
| M02 | Fixed | migration 000100 | `creators_before_delete` (keeps a do_not_contact address in suppression_list, deletes draft and approved emails); `emails.creator_id` now ON DELETE RESTRICT. | fixes.sql: sent email blocks the delete and keeps the drafts; drafts only delete; suppression kept; FK type |
| M03 | Fixed | migration 000100 | NOT VALID checks `creators_email_format`, `emails_to_email_format`, `contact_messages_email_format` (one address, no spaces, commas, semicolons, angle brackets). | fixes.sql: 7 bad creator forms, 4 bad email/contact forms refused, good ones accepted |
| M06 | Fixed | migration 000200 | `log_audit`: user.invited/removed/restored and assistant.* only for the owner; auth.2fa_enabled/removed for any staff but only with entity `profile` and their own id. Service role is unchanged. | fixes.sql; hardening.sql updated (see below) |
| M08 | Fixed | migration 000200 | `login_allowed`: 5 failures per (email, IP) in 15 min, 5 per IP (any email), 20 per email across IPs. Signature unchanged. With no IP, the pair rule applies to null-IP attempts. | fixes.sql; rls.sql updated (see below) |
| M31 | Fixed (database part) | migration 000300 | `stats_overview()` has `emails_failed_7d` (real sends, status failed, `updated_at` in the last 7 days). | fixes.sql: real failed counted, test and 8-day-old not |
| M32 / L12 / L43 | Fixed | migration 000300 | `recent_activity` with typed uuid lookups (ids parsed once, only when they look like a uuid), `creator.subscribers_refreshed` in both places, actor = staff name / `A former user` / `Smallfold`. Same output columns. | fixes.sql: refresh line, three actor cases, typed label, odd ids do not break it, no "Someone" |
| M33 | Fixed | migration 000200 | `audit_row`: creators email/phone/notes and emails to_email changes stored as `{"changed": true}`; email lines no longer carry `to_email`. Old lines untouched. | fixes.sql |
| L02 | Fixed (database part) | migration 000200 | `form_rate_ok`: refuses every submission after 200 in the last hour (both forms together); new index on `created_at`. CAPTCHA skipped as told. | fixes.sql: 199 allowed, 200 refused, allowed again after the hour |
| L04 | Fixed | migration 000200 | `reset_allowed(email text, ip text default null) returns boolean`, `record_reset_request(email text, ip text) returns void`, table `reset_requests` (RLS on, no client grants). 3 per hour per email and per IP. | fixes.sql |
| L05 | Fixed | migration 000100 | NOT VALID checks: `creators_channel_url_https`, `contact_messages_name_len` (300), `_message_len` (5000), `_topic_len` (2000). | fixes.sql; forms.sql input changed (see below) |
| L07 | Fixed | migration 000300 | `creator_summaries` with lateral joins; same columns, still security_invoker. | fixes.sql: columns, options, values equal the plain calculation for all 60 creators |
| L09 | Fixed | migration 000300 | `audit_log_action_idx`, `audit_log_actor_idx`, `deals_stage_changed_idx`, `emails_template_idx` plus partial indexes on the set-null foreign keys (`emails_drafted_by/approved_by/sent_by`, `deals_created_by`, `creators_created_by`, `contact_messages_handled_by`). Nothing dropped. | fixes.sql: all 10 exist, 17 earlier indexes still there |
| L11 | Fixed | migration 000100 | Default privileges: global and in-schema `revoke execute on functions from public, anon, authenticated` for role postgres. | fixes.sql: no public function executable by PUBLIC or anon; a freshly created function has no PUBLIC/anon/authenticated execute |
| L13 | Fixed | migration 000100 | `creators_before_insert`: a suppressed address starts as do_not_contact. | fixes.sql |
| L14 | Fixed | migration 000100 | `creators_guard` keeps `user_id` and `created_by` for non-owner direct clients; trigger sets `contact_messages.handled_by` from the caller (null when marked open again). | fixes.sql |
| L15 | Fixed | `admin/dev/migrate.sh` | The tracking insert runs in the same `psql -1` transaction as the migration. | Applied the 3 new migrations with it |
| L33 | Fixed (database part) | migration 000100 | `emails.source text not null default 'staff'` check in ('staff','claude','template'). | fixes.sql |
| L38 | Fixed | migration 000200 | Owner can delete their own `assistant_threads` row (policy + grant); messages and proposals follow by cascade; no delete grant on messages, update still blocked. | fixes.sql |
| L48 | Fixed | migration 000300 (function in 000200) | `audit_actions() returns setof text`, owner only, walks the new action index. | fixes.sql |
| DOC-20 / L58 | Fixed | `tests/run.sh`, `tests/README.md` | Header says database tests only; README says each SQL file has its own rolled-back transaction. README contract notes updated for the new rules. | read back |

Addition (leader request): `log_audit` also allows `assistant.thread_deleted`, owner only (same rule as other assistant.* actions); tested in fixes.sql.

## Tests changed on purpose
- `rls.sql`: the login test said 5 failures for an email lock it from any IP. Now only the same (email, IP) pair, or the IP, is refused (M08).
- `hardening.sql`: "every allowed action works for a worker" no longer lists `user.*` and the 2FA actions (M06; covered in fixes.sql).
- `forms.sql`: the application test passed `@fakechannel` straight to `submit_application`; it now passes an https link, because the database refuses other values (L05). The website route already turns a handle into a YouTube link or null.
- `assistant.sql`: "owner cannot delete threads" became "owner deletes only their own thread, not proposals alone" (L38). Also the file now deletes live conversations inside its rolled-back transaction, because other agents' e2e runs left threads that broke its counts.
- `activity.sql`: inserts its own "sent" control line so it does not depend on what the shared audit log holds (it failed before my changes on the shared stack for that reason).
- `seed/seed.sql`: disables the new `creators_suppress_manual` trigger while seeding, so the seed still has exactly 2 opt-outs.

## Needs another agent
- FB: call `release_stale_sending` with the service-role client before `reserve_send` in the send route (and optionally from the Sending settings page); call `reset_allowed` / `record_reset_request` from the forgot-password action; log 2FA lines with entity type `profile` and the caller's own id (already so in `settings/security/actions.ts`); read `emails.source`.
- FC: show `emails_failed_7d`, use `audit_actions()` for the audit dropdown, add the "delete conversation" button (plain delete of the thread row as the owner).
- FD: `creators` delete error is now also raised when any non-draft email exists (error code 23503, message mentions `emails_creator_id_fkey`); the app message needs updating. A worker who tries to lift do_not_contact gets check_violation "Only the owner can take a creator off do not contact." Set and show `emails.source`.
- Owner/leader: run the VALIDATE statements in the header of migration 000100 on production after the listing query returns no rows.

## Notes
- The global cap of 200 per hour is higher than the two per-form caps (60 each, so at most 120 in total); it is a backstop that only matters if a per-form cap is raised.
- NOT VALID checks still apply to any UPDATE of an old row that breaks a rule (for example an old `http://` channel link): fix such rows first. The listing query in the migration header finds them.
- Shared-stack note: `rls.sql` counts (10 brands, 15 deals) failed once while another agent's `ZZ AUDIT FC brand` row existed; it passed after they removed it.

## Tests run
- `bash admin/dev/migrate.sh` (3 new migrations applied to the shared local database).
- `bash admin/supabase/tests/run.sh`: SQL 101 + 58 checks (rls, activity, hardening, forms, assistant, fixes) and HTTP checks all passed. Test data is rolled back; nothing left behind.
- Did not run `tsc` / vitest (no TypeScript changed).
