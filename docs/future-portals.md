# Future portals: brand and creator logins (design notes)

Status: **not built**. These are notes for the day the owner wants a section where brands, or creators, log in. Nothing here is live. It comes from the database audit (item DB-19) and has not been tested.

Read `docs/backend-plan.md`, section 4, first. It says what the first build left room for.

## What is ready today

- `creators.user_id` exists. It is unique, and it is set to empty if the login is deleted.
- Every staff rule in the database says "active staff only" (`is_staff()` and `is_owner()`). A new kind of login therefore sees **nothing** until a rule is added for it.
- The role list (`app_role`) can take new values. The checks name `owner` and `worker` one by one, so a new role gets no staff rights by accident.
- A new login gets a `profiles` row with no role.
- Since the repair job of 23 November, a worker can no longer change `creators.user_id` or `creators.created_by` directly (migration `20261123000100`). Before that, a worker could attach any login to any creator.

## What is missing or in the way

1. **No link from a brand to a login.** There is no `brand_members` table.
2. **Private and shareable data sit in the same rows.** `creators` holds the email, phone and notes. `creator_summaries` repeats them. Permissions in the database are given per role and per table, so a row rule cannot hide one column. A creator who may read "their own row" would also read the owner's notes.
3. **Deals mix both sides.** `deals.commission_cents` and the email log's internal text must not reach a brand or a creator.
4. **Staff lists.** The Users page and the `profiles` select show every profile. Portal users would show up among the staff.
5. **The app, not only the database.** `proxy.ts` lets any logged-in session reach the `(company)` pages until `requireStaff()` runs inside the page. That check exists on every page today, but a new section needs its own layout and its own check.

## The design, step by step

Do these in order. Each database step is a new migration file with rollback notes (see "Maintaining Smallfold" in `admin/README.md`).

1. **Finish the guards first.** The `user_id` and `created_by` guard is done (see above). Keep its test.
2. **New roles.** Add the values `creator` and `brand_member` to `app_role`. Do not rename `owner` or `worker`.
3. **Brand link.** Create `public.brand_members (brand_id uuid references brands on delete cascade, user_id uuid references auth.users on delete cascade, primary key (brand_id, user_id))`. Turn on row-level security. Staff manage it. A member reads only their own rows.
4. **Row rules, named per section** (the plan already says `creator_self_*` and `brand_member_*`):
   - creators: a creator reads the row where `user_id` is their own id;
   - deals, for a creator: `creator_id` is in the creators whose `user_id` is their own id;
   - deals, for a brand member: `brand_id` is in the brands they belong to.
5. **Safe columns only.** Serve portals through **separate views or functions** that return only the safe columns: no notes, no commission, no internal email text, no other person's address. Never serve a portal from `creator_summaries` or from the `creators` table itself. Test it as the portal user: select every column you can and check that nothing private comes back.
6. **Staff lists.** Make the Users page and its queries show only `role in ('owner','worker')`.
7. **App.** Add `(brand)/` and `(creator)/` folders next to `(company)/`, each with its own layout and its own `requireBrandMember()` or `requireCreator()`. Every server action and API route in them checks the session, the role and the input, as the owner's rules say. Do not reuse the staff helpers for portal users.
8. **Login for portal users.** Invite them like staff, but with the new role. Sign-up stays off. Think about whether they need two-step login (staff can set it up in Settings, Security today).
9. **Audit lines.** Record who viewed what in the portals too. Keep the audit log free of personal values (the repair job already hides email, phone and notes in it).
10. **Tests.** Write the database tests first: a creator cannot read another creator, a brand member cannot read another brand's deals, neither can read a column they should not, neither can call a staff function.

## Questions for the owner before any of this starts

- What may a creator see: their own profile, their deals, the emails Smallfold sent them?
- What may a brand see: their deals and the creators in them? Which creator details?
- Should a creator be able to change their own details, or only ask for a change?
- Does a creator's opt-out or "do not contact" setting stay in force when they log in?
- Is this a legal question too (privacy notice, who may see whose data)? It needs a lawyer. This note is not legal advice.
