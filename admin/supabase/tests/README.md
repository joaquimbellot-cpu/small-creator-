# Database tests and contract notes

Run: `admin/dev/start.sh` then `admin/supabase/tests/run.sh` (SQL in one rolled-back transaction, then HTTP through the gateway).

Contract notes for the app code:
- RPC argument names: `reserve_send(email_id)`, `mark_sent(email_id, message_id)`, `mark_failed(email_id, error)`,
  `mark_replied(email_id)`, `opt_out(email, reason)`, `bootstrap_owner(email)`, `login_allowed(email, ip)`,
  `record_login_attempt(email, ip, success)`, `log_audit(action, entity_type, entity_id, details, p_actor)`, `stats_overview()`.
- Send functions return jsonb `{ok, ...}`; on refusal `{ok:false, reason}` with reason one of `forbidden`, `not_found`,
  `not_approved`, `do_not_contact`, `suppressed`, `test_email_missing`, `postal_address_missing`, `daily_limit`, `too_soon`.
- Clients can only draft, edit, approve (`draft -> approved`), un-approve and retry (`failed -> draft`) emails directly;
  `sending/sent/failed/replied` come only from the functions. Staff may delete unsent (draft/approved) emails.
- Audit actions written by triggers: `<entity>.<created|updated|deleted>`, plus `email.status_changed` and
  `profile.role_changed`; entity types: creator, deal, brand, email, template, settings, suppression, profile.
  `details.label` is a display name (kept after deletes); updates carry `details.changes.<column>.{from,to}`.
- `stats_overview().weekly` is `[{week_start, sent, replies}]`, 12 entries, oldest first.
- Deleting a creator with deals is refused (FK restrict); the creator's emails are deleted with them.
