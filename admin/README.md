# The Smallfold app: website and back office

This one app does two jobs.

- It serves the **public website**, the pages that people visit to apply or to learn about Smallfold.
- It runs the **back office**, a private area for the owner and the staff. It runs the company side of
  Smallfold: finding creators, sending them emails, and tracking deals.

Both live in this `admin/` folder. You launch them together, with one deploy. The website is at
your main address (`/`). The back office is at `/login` and the pages after it. Search engines
are told to leave the back office alone.

This guide has three parts. Read the first part to learn what the app does. Use the second
part to try it on your computer with fake data. Use the third part to put it online.

## What it is

The app has eight pages in the back office (plus a search box that opens with Ctrl+K on every one):

| Page | What it does |
|---|---|
| Overview | Shows the main numbers: how many creators, emails sent, replies, deals, commission earned, and failed sends in the last 7 days. Also a chart and a list of recent activity. |
| Creators | The list of YouTube channels, with search, filters, sorting, and CSV import and export. Tick several creators to change their status in one go ("Change status to", then confirm); only the owner can take creators off Do not contact. Can refresh subscriber counts from YouTube. New applications from the website also land here, with status New. |
| Sponsors | The companies that pay creators: filters, contact people, tags, sponsorship history, CSV import and export. See "Creators, Sponsors, the price calculator and search" below. |
| Deals | Each deal with a creator, a brand, a stage, and an amount. Commission is worked out for you. |
| Emails | Writes drafts with Claude, lets you review and approve them, sends them when you click Send, keeps a log of every email, and stores templates. |
| Inbox | Messages sent through the website's brand inquiry form (the "For brands" page). |
| Claude | A chat page for the owner. Claude reads the numbers and writes email drafts for you. It can also suggest changes, which you approve with a click. See "Using Claude" below. |
| Settings | Sending limits and test mode, sender details, staff accounts, two-step login, and the audit log. A worker sees only **Security** (their own two-step login). The rest is owner only: a worker who opens it lands on the Overview with the note "Only the owner can open that page." |

There are two roles. A role decides what a person may do.

| Role | Can do | Cannot do |
|---|---|---|
| Owner | Everything. Including deleting records, exporting creators to CSV, changing Settings, inviting and removing staff, reading the audit log, and using the Claude page. | Nothing is blocked. |
| Worker | View and edit creators, deals, and templates. Draft and send emails (only after a click). Import creators from CSV. Open the Inbox. Set up their own two-step login. Mark a creator "do not contact". | Delete creators, deals, or templates. Export. Change Settings (other than their own two-step login). Manage staff. Read the audit log. Use the Claude page. Take a creator off "do not contact". |

The rules are checked by the app and again by the database, so a worker cannot get around them.

### Creators, Sponsors, the price calculator and search (upgrade of 25 November 2026)

| Screen | Address | What it does |
|---|---|---|
| Creators | `/creators` | Filter rail (subscribers, niche, status, country, language, sponsored by, recently sponsored, tags, lists and more), table or cards, saved views, bulk actions, a side panel at `?open=<id>`. The list shows no email address. |
| Creator profile | `/creators/<id>` | The full page of one creator: sponsorship history, suggestions, performance, price, deals, outreach, notes, tags. Opening it writes the audit line "Viewed a creator". |
| Sponsors | `/sponsors`, `/sponsors/<id>`, `/sponsors/import` | The same layout for sponsors (companies that pay creators): filters, panel, full page, contact people, tags, CSV import and (owner only) export. |
| Price calculator | `/creators/calculator` | A fair price for a sponsored video from a creator's numbers. A plain calculation: nothing is saved or sent. |
| Search | Ctrl+K or Cmd+K, or the Search button in the top bar | Finds creators (name, channel), sponsors (name, industry) and deals (creator or sponsor name), up to 6 of each. With an empty box it shows "Recently opened" (this browser tab only) and "Go to". Results hold names and one line of public context, never an email or phone, so it writes no audit line. Route: `GET /api/search?q=` (1 to 100 characters, staff only). |

**Confirmed and Detected.** Every sponsorship record has one of two labels.
*Confirmed* means a person checked it (or a deal reached Completed or Paid, which makes one by itself).
*Detected* means it was found by a program or imported without checking; it is drawn with a dashed line and a "Detected" badge.
Counts, filters, the "Active sponsor" label, match scores and every email use Confirmed records only.
Tick "Count detected records too" to include Detected ones in a count or filter. A Detected record becomes Confirmed only when
someone writes a short note saying how they checked (the database records who and when). Reject hides a record and keeps it (an import will not bring it back);
Restore undoes a reject. In this build Detected records come only from the local seed and from imports marked unverified (there is no YouTube scanner yet).

**Test data and logins (local stack only).** `bash dev/reset.sh` loads `supabase/seed/seed.sql` and then `seed-upgrade.sql`:
60 creators, 26 sponsors, 34 contact people, 115 sponsorship records (64 Confirmed, 51 Detected), 19 deals (4 at the new first stage Matched), tags, two lists and three saved views.
Logins: `owner@example.test` / `Owner-Test-Pass-2026!` and `worker@example.test` / `Worker-Test-Pass-2026!`. Details in `supabase/seed/EXPECTED.md`. Never load `seed-upgrade.sql` in production.

**New migrations, in this order** (each file runs in its own transaction, can be run twice, and starts with a header that says how to roll it back):
`20261125000100` niches, creator and sponsor columns, contact people;
`20261125000200` sponsorship records;
`20261125000300` deal amount, tags, lists, saved views;
`20261125000400` views and audit;
`20261125000500` creators list functions;
`20261125000700` sponsors list functions;
`20261125000800` matching and linking;
`20261125000900` outreach;
`20261125001000` search (one function, `global_search`).
(There is no `...000600`: the creator profile needed none.) Apply them to the live database in name order, with a backup first:
see "Applying to production" in `docs/ui-upgrade/build/database.md` (written for the first four files; the same one-file-at-a-time rule holds for the rest).

### The public website

The website is the set of pages anyone can visit: the home page, How it works, For brands,
About, Questions, Contact, Apply, Privacy and Terms. The website text lives in `src/` (see the
main `README.md`). When the app is built, it also builds the website into `admin/public/`.
You never edit that folder by hand.

- **Apply** creates a new creator with status New and source "website". If the email address
  is already on file, nothing new is created. The visitor sees the same thank-you message either way.
- **Brand inquiries** (the form on the For brands page) go to the **Inbox** page.
- **Log in.** Every page has a "Log in" link that goes to `/login`. On a phone, it is at the
  bottom of the drop-down menu. On every screen, it is also on the right of the copyright line
  at the foot of the page.
- **Page addresses.** Each page answers with or without `.html` at the end, for example
  `/apply` and `/apply.html`. Netlify drops the `.html`, so the app accepts both.
- **Protection on the forms.** A form is sent only from the website itself. A hidden field
  catches robots. Each visitor may send at most 5 forms per hour, and the site as a whole accepts
  at most 200 forms an hour. The app stores only a keyed hash of the visitor's IP address, never
  the address itself.

## Run it on your computer (test data only)

Use this part to try the app. Everything is fake. The local test stack runs on Linux only. No real email can be sent from your
computer, because the local mail server only catches messages and shows them to you.

**You need these first:**

1. **Node.js, version 22 or newer.** Check with `node --version`. Get it from nodejs.org.
2. **Docker, running.** A program that runs the test database and login services in containers.
   Install it and start it. Check with `docker info`. Your user must be allowed to use it.
3. **PostgreSQL, version 16.** The test database. The start script looks for it at
   `/usr/lib/postgresql/16`. You also need the `psql` command (check with `psql --version`).
4. **`curl`** (check with `curl --version`). If you run the script as root, you also need `runuser`.
5. **Internet for the first start.** Docker pulls two images, `supabase/gotrue:v2.177.0` and
   `postgrest/postgrest:v12.2.12`.
6. **These ports free:** 1025, 3000, 3001, 4010, 8025, 9999, 54321 and 54322.

The start script checks the tools and the Docker daemon, and stops with a plain message if one is missing.

**Then do this:**

1. Open a terminal in the main project folder (the one that contains `admin/`).
2. Start the test stack:
   ```
   bash admin/dev/start.sh
   ```
   The first run takes a few minutes. It starts the test database, the test login service,
   the mail catcher, and a **fake Claude** on port 4010. It loads about 60 invented creators. It also creates
   `admin/.env.local` with random test keys. The script is ready when it prints
   "Local stack is up."
   The fake Claude answers the Claude page and the email drafts without calling Anthropic.
   The file `admin/.env.local` gets four extra settings for this: `ANTHROPIC_BASE_URL` (the
   address of the fake Claude), a fake `ANTHROPIC_API_KEY`, `DRAFT_MODE=mock`, and
   `EMAIL_FROM=smallfold-test@example.test` (the test sender; without it every local send fails).
   These are for testing only. Never put them in the online settings. If your `.env.local` is
   older, run `start.sh` again: it adds what is missing and keeps the rest.
3. Start the app. Run these two commands:
   ```
   cd admin
   npm install
   npm run dev
   ```
   Run `npm install` only the first time. If your shell already sets `ANTHROPIC_BASE_URL`,
   start the app with `env -u ANTHROPIC_BASE_URL npm run dev` instead, so the fake Claude is used.
4. Open http://localhost:3000 in your browser. You see the website. Use the Log in link in
   the menu, or go to http://localhost:3000/login.
5. Log in with one of the test accounts. The emails and passwords are in
   `admin/supabase/seed/EXPECTED.md`. The owner account can do everything, including the Claude page.
   The worker account is useful for checking the limits on what a worker may do.
6. To see the emails the app would send, open the mail catcher at http://localhost:8025.
7. To stop everything, run this from the main project folder:
   ```
   bash admin/dev/stop.sh
   ```
   Your test data is kept.
8. To wipe the test data and start again with fresh fake data, run:
   ```
   bash admin/dev/reset.sh
   ```
   A reset also makes new local test keys. Stop the app and start it again afterwards
   (`npm run dev`). If you test the built app with `npm run start`, run `npm run build` again first,
   because the build keeps the old public key.

Log files are in `admin/dev/.logs/`. The file `admin/.env.local` holds test secrets. Git
ignores it, so it is never uploaded.

## Put it online, step by step

You will make accounts with four services and one hosting company. Do the steps in order.
Keep every key you copy in a password manager. Never paste a key into a chat or an email.

**Smallfold is already online** at https://smallfold.netlify.app. Steps 1, 5 and 6 are done.
The steps below say how each part is set up, so you can check it or do it again. The note
`docs/handoff.md` lists what is done and what is left.

### Step 1: Supabase (the database and the login)

Supabase is a service that hosts the database and handles logins and invitations.

1. Go to supabase.com and create a free project. Choose a region and a database password.
2. **Create the tables.** Open the **SQL Editor**. Open each file below, in this order,
   copy the whole file, paste it into the editor, and click **Run**:
   1. `20261121000100_extensions_and_types.sql`
   2. `20261121000200_tables.sql`
   3. `20261121000300_helpers_and_triggers.sql`
   4. `20261121000400_functions.sql`
   5. `20261121000500_rls_and_grants.sql`
   6. `20261121000600_recent_activity.sql`
   7. `20261121000700_recent_activity_exclusions.sql`
   8. `20261121000800_security_hardening.sql`
   9. `20261122000900_website_forms.sql`
   10. `20261122001000_assistant.sql`
   11. `20261122001100_forms_hardening.sql`
   12. `20261123000100_creator_and_email_guards.sql`
   13. `20261123000200_audit_logins_forms.sql`
   14. `20261123000300_stats_activity_indexes.sql`

   All fourteen files are in `admin/supabase/migrations/`. This list is the folder in file-name order. If the folder
   has more files than this list, run those too, in order. Do not skip the last three of the first
   eleven: they hold the website forms (the tables and the form rules), the Claude page's tables, and
   the stricter rules for the forms. Do not skip `20261121000800_security_hardening.sql` either: it
   holds the security fixes, including two-step login checked by the database.
   The three files dated `20261123` hold the repair job's database changes: guards on creators and
   emails, hidden personal values in the audit log, login and password-reset limits, a count of failed
   sends, and faster lists. Each starts with a comment that says what it does, why it is safe on a
   database with real rows, and how to roll it back. The first one also ends with `VALIDATE` lines that
   you run by hand after a check query returns no rows (the comment explains).
   Never run the seed files (`admin/supabase/seed/`) on the online project. They create test logins
   with known passwords. **On a project that already has data, take a backup first and run only the
   files that are new** (see "Maintaining Smallfold" below).
3. **Switch off public sign-up.** In the **Authentication** settings, turn **off**
   "Allow new users to sign up". Only the owner can invite people.
4. **Leave the email templates as they are.** Supabase's free plan does not let you edit the
   **Invite user** and **Reset password** email templates. The default templates work. The app
   tells Supabase to send each link to `/auth/confirm` on your site, and the app reads the link
   there. Those links reach `/auth/confirm`, which passes them on to `/auth/hash`, the page that reads
   the tokens. (Check your plan: Supabase may let you edit these templates now.) If you can edit them, you may set these links instead, but you do not have to:
   - Invite: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
5. **Connect Supabase's own email.** Until you do this, Supabase sends invites and
   password-reset emails itself, with two limits on the free plan:
   - they only reach the email addresses of your own Supabase team, and
   - at most 2 emails are sent per hour.

   So a staff invite does not arrive until this part is done. In the Authentication settings,
   find **SMTP** (custom SMTP). Enter the same Gmail details from Step 2 below. Then invites and
   password-reset emails are sent from your Gmail account, to any address.
6. **Copy three values** from **Project Settings, then API**: the Project URL, the `anon`
   key, and the `service_role` key. You will need them in Step 5. The `service_role` key is
   secret.
7. **Site URL and Redirect URLs.** Do this part again after Step 5, when you know the
   Netlify address. Set the **Site URL** to that address. Add it to the **Redirect URLs** list
   as `https://your-app.example.com/**`, using your own address. Today both use
   `https://smallfold.netlify.app`. If you add your own domain later, change both.
8. **Security settings.** In **Authentication**, set the minimum password length to 12. Turn on
   **Secure password change**. Keep the built-in sign-in rate limits, and lower them if Supabase
   offers that. Keep sign-ups OFF (part 3).
9. **Keep the secret key secret.** The `service_role` key stays only in Netlify's environment
   variables (Step 5). The server uses it to save website forms, to send email, and to manage staff. Never
   put it in a file, in the browser, or in a chat.

### Step 2: Gmail (sends the emails)

1. Sign in to your Google account. Go to **Security**, then **2-Step Verification**, and turn it on.
2. In the same place, open **App passwords**. Create one. Name it "Smallfold back office".
3. Copy the 16-letter password. Google shows it once.

Use these settings everywhere the app asks for mail details:

| Setting | Value |
|---|---|
| Host | `smtp.gmail.com` |
| Port | `465` |
| Secure | `true` |
| User | your Gmail address |
| Password | the 16-letter app password |

### Step 3: Anthropic (writes the email drafts and runs the Claude page)

1. Go to console.anthropic.com and sign in.
2. Open **API Keys** and create a key. Copy it once.
3. Anthropic charges for API use, so you may need to add a payment method first.
   Every email draft and every message on the Claude page is a paid use.

The same key powers the Claude page. Without it, the Claude page says that Claude is not connected yet.

### Step 4: YouTube (subscriber counts)

1. Go to the Google Cloud Console (console.cloud.google.com). Create a **new project**
   and give it a name.
2. Open **APIs & Services**, then **Library**. Search for **YouTube Data API v3** and
   click **Enable**.
3. Open **APIs & Services**, then **Credentials**. Click **Create credentials**, then
   **API key**. Copy the key.
4. Open the key's settings and **restrict** it to **YouTube Data API v3** only. Save.

### Step 5: Netlify (puts the website and the app online)

Netlify is a hosting service. It runs the app for you, and the app serves the website too.
Smallfold is the Netlify project `smallfold`, at https://smallfold.netlify.app.

1. Go to netlify.com and sign in. Create a project, or open the project `smallfold`.
2. **Build settings.** You do not type these into Netlify. The file `netlify.toml`, in the main
   project folder, holds them: the app is in the `admin` folder, the build command is
   `npm run build`, the Node.js version is 22, and Netlify's Next.js runtime is switched on.
   The build also builds the website.
3. **Environment variables.** In the project, open **Project configuration**, then
   **Environment variables**. Add every name listed in `admin/.env.example`, with its value
   from the steps above. Leave out the lines under "Testing on your computer only."
   - **Enter `NEXT_PUBLIC_SITE_URL` first, before the first deploy.** It is the address Netlify gives
     the project (for example `https://your-app.netlify.app`), with no slash at the end. Every email's
     opt-out link is built from it. If it is empty, the links point at `localhost` and do not work.
   - Tick **Contains secret values** for each line marked SECRET in that file.
   - Set `ASSISTANT_DEADLINE_MS` to `50000`. Netlify stops a request after 60 seconds, so the
     Claude page must finish its answer before that.
   - `ANTHROPIC_MODEL`, `ANTHROPIC_ASSISTANT_MODEL` and `ASSISTANT_DAILY_LIMIT` are optional.
   - Type each key into Netlify yourself. Never paste a key into a chat.
4. **Deploy.** There are two ways.
   - **By upload (how it is done today).** The GitHub repository is not connected to Netlify.
     A new version goes online only when someone uploads it. The steps are in
     `docs/handoff.md`: one with the Netlify command-line tool (for a person), one with the
     Netlify agent tools. Both use pinned versions.
   - **From GitHub (optional).** In **Project configuration**, then **Build & deploy**, link
     this GitHub repository and choose the branch. Then every push to that branch goes online
     on its own.
5. If you change `NEXT_PUBLIC_SITE_URL` later (for example, when you add your own domain), deploy
   again. The `NEXT_PUBLIC_` settings are built into the app, so a change takes effect only
   with a new deploy.
6. Go back to Supabase, Step 1, part 7, and set the Site URL and Redirect URLs.
7. **Who can see the site.** Visitor access is off, so the site is **public**. Search engines are
   asked to skip it (`noindex`). To lock it again, open **Project configuration**, then
   **Access & security**, then **Visitor access**, and turn team login on. Check the wording in
   Netlify, because menu names change.

### Step 6: First login (make yourself the owner)

This is how the owner's account was made. Do it again only if you start a new Supabase project.

1. In Supabase, open **Authentication**, then **Users**. Click **Add user**, then
   **Create new user**. Type your own email address and a password of at least 12 characters.
   Keep **Auto Confirm User** ticked. This way needs no email, so the free plan's email limits
   (Step 1, part 5) do not get in the way.
2. In Supabase, open the **SQL Editor**. Paste the line below. Replace the placeholder with
   the same email address, then click **Run**:
   ```sql
   select public.bootstrap_owner('you@example.com');
   ```
   It shows `true` when it works. It works only while there is no owner yet, so run it once.
   If it shows `false`, check the spelling of the email address.
3. Log in at your Netlify address, at `/login`. You are now the owner.
4. Turn on two-step login straight away (Step 8).

Do this before you invite anyone else. Invite staff from **Settings** in the back office, after
Supabase's own email is connected (Step 1, part 5).

### Step 7: Settings, Sending (test first)

1. Open **Settings**, then **Sending**.
2. **Test address:** type the address where test emails should arrive. Use your own.
3. **Sender postal address:** type the full postal address that appears at the bottom of
   every email. US law asks for a valid postal address on commercial email. A PO box is accepted.
4. Keep **Test mode** ticked, then save.
5. Send one test email. Open **Emails**, then **Compose**. Pick one or more creators (Draft works for up to 25 creators at a time). Choose a
   saved template, or type your goal in one sentence. Click **Draft emails**. Under **Review**, edit
   a draft if you want, then click **Approve**. Click **Send**, and confirm in the dialog. With test
   mode on, the email goes to your test address with `[TEST]` in the subject. No creator gets it.
6. Test the website forms. Open your Netlify address, go to **Apply**, and send one application
   with a test name and email. It should appear on **Creators** with status New. Then send one
   message from **For brands**. It should appear on **Inbox**. Delete the test records afterwards
   (as the owner).
7. When you are happy with the test, untick **Test mode** and save. Until a postal address is
   set, the app refuses to send to real creators.

Keep test mode on until the test email looks right.

### Step 8: Two-step login (every staff member)

1. Open **Settings**, then **Security**. Owners and workers can both do this for their own login.
2. Click **Set up two-step login**, then add the key to an authenticator app on your phone
   (the app shows a code each time you log in).
3. From then on, the app asks for a code at every login. The database also refuses a
   password-only session for that person.

The owner should turn it on straight away. Ask each worker to do the same. It is not forced.

## Using Claude

The **Claude** page is for the owner only. It is a chat. Type what you want in plain words, for example
"How many creators are waiting for a first email?" or "Draft a follow-up to creators who did not reply."

- **Claude can read:** the Overview numbers, creators, deals, the email log, templates and the Inbox.
  Claude never sees creators' email addresses, phone numbers or private notes.
- **Claude can write email drafts.** Each draft goes to **Review**, as always. You still
  read it, you still click **Approve**, and you still click **Send**.
- **Claude can propose changes.** It can propose adding a creator, editing a creator, or moving a deal
  to another stage. Each proposal shows up on the page with an **Approve** button. Nothing changes until you
  click it.
- **Claude can never** send an email, delete anything, export data, or change Settings or staff.
  For those, it tells you where to click.
- **Limits.** Each message may take up to 12 steps. Each owner may send up to 100 messages a day
  (the UTC day). The daily limit is set by `ASSISTANT_DAILY_LIMIT`. The model is `claude-opus-5-5`
  unless you set `ANTHROPIC_ASSISTANT_MODEL`.
- **Cost.** Anthropic charges for each use, so the daily limit helps keep the cost in check.
- Text from creators and from the Inbox is passed to Claude as data only. Claude never follows
  instructions written inside it.
- Each conversation is saved in your own database, and each action is recorded in the audit log.
  The owner can delete a whole conversation with the **Delete conversation** button.

## Safety built in

- **No automatic sending.** Every email needs a person to approve it and click Send.
- **Daily limit.** The app sends at most 30 emails a day by default. You can change this in Settings.
- **Delay.** At least 5 seconds pass between two emails.
- **Test mode.** Every email goes to your test address, with `[TEST]` in the subject.
- **Opt-out.** Every email has an unsubscribe link. Pressing it adds the address to a suppression list.
- **Suppression list.** No email is ever sent to an address on the list.
- **Do not contact.** A creator marked "do not contact" cannot be emailed.
- **Website forms.** Only the site itself may post a form. A hidden field catches robots. Each visitor
  may send 5 forms an hour. Visitors' IP addresses are kept only as a keyed hash.
- **Claude limits.** Claude cannot send, delete, export, or change Settings. Every change it
  suggests waits for your click. Each message is capped at 12 steps and each owner at a daily limit.
- **Audit log.** A record of who did what and when. Nobody can edit or delete it, not even the owner. For
  creators it records that an email, phone or note "changed", not the value itself (lines written before
  23 November may still hold old values).
- **Export is logged first.** The creators export writes its audit line before it sends the file. If the line
  cannot be saved, nothing is exported and you see "Could not record the export in the audit log."
- **Clear messages when a service is down.** If the login service or the database does not answer, you see
  "Something went wrong. Please try again." and the try is not counted as a failed login. A send that went out but
  could not be recorded tells you so, and the run stops, so nobody sends the same email twice.
- **Row-level security.** The database itself checks each person's role on every read and write.
- **Two-step login in the database.** Once a person turns it on, the database itself requires the code for that person.
- **Only the server sends.** Only the server can call the functions that send email.
- **Login limit.** After 5 failed logins in 15 minutes from one IP address, or 5 for one email address from one
  IP address, or 20 for one email address from any addresses, more tries are refused until the old failures are
  over 15 minutes old.
- **Password reset limit.** At most 3 reset emails an hour for one email address or one IP address. The page
  gives the same answer either way, so nobody learns which addresses have a login.

## Tests

### Set up once

- **Playwright** runs the browser tests. It is not in `package.json`. From inside `admin/`, run
  `npm install --no-save playwright` and then `npx playwright install chromium`.
  (`--no-save` keeps it out of `package.json`. A later `npm install` removes it, so run it again.)
  On the build sandbox a copy is already in `/opt/node-tools/node_modules`; `tests/run-all.sh` uses it
  only if that folder exists and `NODE_PATH` is not set.
- You need `psql` too (see "You need these first").

### Quick checks (no stack needed)

From inside `admin/`:

- `npm test` runs the unit tests (vitest).
- `npm run typecheck` checks the types.
- `npm run lint` runs oxlint. It prints warnings and exits cleanly unless there is an error.

GitHub runs `npm ci`, `npm run typecheck`, `npm test` and `npm run lint` on every push and pull
request (`.github/workflows/ci.yml`). It does not run the database or browser tests.

### Every check

Run every check with one command. Before you start, the test stack (`bash admin/dev/start.sh`)
must be running, and the app must be running too. Start the app with
`env -u ANTHROPIC_BASE_URL npm run dev`, or with `env -u ANTHROPIC_BASE_URL npm run build` and then
`env -u ANTHROPIC_BASE_URL npm run start`. (`env -u` is needed only if your shell sets
`ANTHROPIC_BASE_URL`: the app must use the fake Claude from `.env.local`.) Then, from inside `admin/`, run:

```
bash tests/run-all.sh
```

Three things to know:

1. Run `bash admin/dev/reset.sh` before a full test run. The tests add audit lines, and those
   lines cannot be deleted, so a fresh database keeps the counts right.
2. **Restart the app after `reset.sh`.** A reset makes new keys, and a running app still has the old
   ones. If you use the built app, run `npm run build` again too.
3. The login suite runs last and uses up the login limit. A second full run within 15 minutes
   will probably fail for that reason. Run `reset.sh` again, and restart the app, before another full run.

The script runs these suites in order. It prints one summary line for each, and it reports
an error if any suite fails:

1. **Database tests** (`supabase/tests/run.sh`, database checks only): the row-level security rules, the guard functions,
   two-step login enforcement, the rules for the website forms and the Claude page, and the repair job's
   rules (`fixes.sql`). Each SQL file runs in its own rolled-back transaction. Then HTTP checks through the gateway.
2. **Unit tests** (vitest).
3. **QA browser checks:** failed login; a worker blocked from owner actions; search box and the
   creator and sponsor side panels and pages; Overview numbers equal to the fake data; test-mode sending; opted-out and
   "do not contact" creators blocked; the public key reads nothing.
4. **Browser tests** for creators, deals and emails.
5. **Browser tests** for the website, the website forms and the Claude page. The Claude test adds one
   test creator and one draft, and removes them again.
6. **Browser test for login.** It runs last, because it trips the login limit.

Each browser test can also be run alone from inside `admin/`, for example `node lib/assistant/e2e.cjs`,
with `BASE_URL` set to your app's address. The Claude test needs the fake Claude from `dev/start.sh`.
Screenshots go to a `smallfold-shots` folder in your system's temp folder, unless you set `SHOT_DIR` or `SHOTS`.
Run `bash admin/dev/reset.sh` afterwards to remove any leftover test data.

The script starts and resets nothing. If the test data looks wrong, run `bash admin/dev/reset.sh` first.

To run a second dev server beside the first, set `NEXT_DIST_DIR` (for example `NEXT_DIST_DIR=.next-test`).
Next.js then rewrites the tracked file `admin/tsconfig.json`. Put it back with
`git checkout -- admin/tsconfig.json`, and delete the extra folder.

## Maintaining Smallfold

Short how-tos for the person who looks after the live site. Menu names at Netlify and Supabase change
now and then: if a name below is missing, look for the nearest one. Anything marked "check your plan"
is something we could not confirm for your Supabase or Netlify plan.

### Add a database change (a migration)

The database lives in Supabase. Production is changed by hand, so go slowly.

1. **Write it as a new file** in `admin/supabase/migrations/`, named `<date><number>_<topic>.sql`, for example
   `20261201000100_add_something.sql`. The number must be higher than the last file. **Never edit a file that
   has already been applied.**
2. **Start the file with a comment** that says what it does, whether it is safe on the live database (which has
   real rows), and how to roll it back. Nothing may delete or rewrite existing data without a backup step first.
3. **Test it here.** Start the test stack, then run `bash admin/dev/migrate.sh`. It applies only the files that
   are new, each in one transaction together with its record in `supabase_migrations.schema_migrations`.
   Then run `bash admin/supabase/tests/run.sh`. Add a check to the SQL tests for what you changed.
4. **Back up production** (see "Back up the database" below). Do not skip this.
5. **Apply it in production.** In the Supabase **SQL Editor**, paste the new file and click **Run**. Apply files
   one at a time, in file-name order, and read each result. If one fails, stop, and use its rollback notes.
6. **Then deploy the app** (`docs/handoff.md`). Deploy the database first, because the new app code may call
   a new function. Old app code keeps working with a new database, unless the file says otherwise.
7. **Update the list** in Step 1, part 2 of this guide, and write the change in `docs/handoff.md`.

### Where the logs are

- **The app (server side):** Netlify, your project, then **Logs** (function logs). Look at the lines around the time of the problem.
- **The database and login:** Supabase, then **Logs** (Postgres, API and Auth).
- **Who did what:** the back office, **Settings**, then **Audit**.
- **Is it up?** Open `https://your-address/api/health`. It answers `{"ok":true}` when the app can read the database,
  and `503` with `{"ok":false}` when it cannot. It needs no login. Point a free uptime service at that address
  (the owner picks which one).
- **Mail:** the Gmail **Sent** folder of the sending account. The back office email log shows the status of each message.
- **On your computer:** `admin/dev/.logs/`.

### Back up the database

- **Check your plan.** Supabase may keep daily backups on some plans, and may not on the free plan. Find out
  in the dashboard (Database, then Backups), and do not rely on it until you have seen a backup there.
- **A backup you make yourself**, before every production migration. In Supabase, open **Connect** and copy
  the database connection string (use the pooler one if your network has no IPv6). Then, on your computer, with
  `pg_dump` version 16 or newer:
  ```
  pg_dump "<connection string>" --schema=public --no-owner -f smallfold-backup-<date>.sql
  ```
  This saves every Smallfold table. The file holds personal data (creator emails and phones), so keep it private
  (a password manager's file store or an encrypted disk) and delete old ones. Never put it in git or in a chat.
  Staff logins live in Supabase's own `auth` tables, which this does not copy.
- **Restore.** Restoring is a serious step: ask for help. Restore into a new empty Supabase project first, check
  it, and only then think about the live one.
- A backup records one moment. Emails sent after it are not undone by a restore.

### Roll back a bad Netlify deploy

1. In Netlify, open the project, then **Deploys**.
2. Click the last good deploy, then **Publish deploy**. The old version is live again in moments.
3. Fix the problem, then deploy again (`docs/handoff.md`).

This does **not** undo database changes. A migration is undone with the rollback notes at the top of its file,
or from a backup. Environment variables are not rolled back: if you changed one, change it back and deploy again.

### Rotate the service-role key

Do this if the key was ever pasted somewhere it should not be, or if someone who knew it has left.

1. In Supabase, open **Project Settings**, then **API**. Make a new secret key, or reset the JWT secret
   (check your plan and the dashboard: newer projects can replace one key at a time, and the older way changes
   the `anon` key too and signs everyone out).
2. In Netlify, open **Environment variables**, and replace `SUPABASE_SERVICE_ROLE_KEY` (tick **Contains secret values**).
   If the `anon` key changed too, replace `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Deploy again. `NEXT_PUBLIC_` values are built in, and the others are read when the app starts.
4. Open `/api/health`. It should answer `{"ok":true}`. Log in and open a page to check.
5. Only then revoke the old key in Supabase.

## Not built yet

These are planned, but the app does not have them yet:

- A Kanban board for deals.
- Gmail reply tracking (replies found automatically, not marked by hand).
- Follow-up reminders.
- A scheduled subscriber refresh.
- The brand section.
- The creator section. (Design notes for both: `docs/future-portals.md`.)
- A connector for the Claude app. The Claude page in the back office is the only way to talk to Claude for now.
