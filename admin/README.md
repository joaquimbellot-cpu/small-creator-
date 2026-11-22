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

The app has seven pages in the back office:

| Page | What it does |
|---|---|
| Overview | Shows the main numbers: how many creators, emails sent, replies, deals, and commission earned. Also a chart and a list of recent activity. |
| Creators | The list of YouTube channels, with search, filters, sorting, and CSV import and export. Can refresh subscriber counts from YouTube. New applications from the website also land here, with status New. |
| Deals | Each deal with a creator, a brand, a stage, and an amount. Commission is worked out for you. |
| Emails | Writes drafts with Claude, lets you review and approve them, sends them when you click Send, keeps a log of every email, and stores templates. |
| Inbox | Messages sent through the website's brand inquiry form (the "For brands" page). |
| Claude | A chat page for the owner. Claude reads the numbers and writes email drafts for you. It can also suggest changes, which you approve with a click. See "Using Claude" below. |
| Settings | Sending limits and test mode, sender details, staff accounts, two-step login, and the audit log. |

There are two roles. A role decides what a person may do.

| Role | Can do | Cannot do |
|---|---|---|
| Owner | Everything. Including deleting records, exporting creators to CSV, changing Settings, inviting and removing staff, reading the audit log, and using the Claude page. | Nothing is blocked. |
| Worker | View and edit creators, deals, and templates. Draft and send emails (only after a click). Import creators from CSV. Open the Inbox. | Delete creators, deals, or templates. Export. Change Settings. Manage staff. Read the audit log. Use the Claude page. |

The rules are checked by the app and again by the database, so a worker cannot get around them.

### The public website

The website is the set of pages anyone can visit: the home page, How it works, For brands,
About, Questions, Contact, Apply, Privacy and Terms. The website text lives in `src/` (see the
main `README.md`). When the app is built, it also builds the website into `admin/public/`.
You never edit that folder by hand.

- **Apply** creates a new creator with status New and source "website". If the email address
  is already on file, nothing new is created. The visitor sees the same thank-you message either way.
- **Brand inquiries** (the form on the For brands page) go to the **Inbox** page.
- **Log in.** The website's menu has a "Log in" link that goes to `/login`. The menu is the
  drop-down button shown on narrow screens (860 pixels wide and less). On a wide screen, type
  your address and add `/login` at the end, for example `https://your-app.example.com/login`.
- **Protection on the forms.** A form is sent only from the website itself. A hidden field
  catches robots. Each visitor may send at most 5 forms per hour. The app stores only a keyed
  hash of the visitor's IP address, never the address itself.

## Run it on your computer (test data only)

Use this part to try the app. Everything is fake. The local test stack runs on Linux only. No real email can be sent from your
computer, because the local mail server only catches messages and shows them to you.

**You need these first:**

1. **Node.js, version 22 or newer.** Check with `node --version`. Get it from nodejs.org.
2. **Docker.** A program that runs the test database and login services in containers.
   Install it and make sure it is running.
3. **PostgreSQL, version 16.** The test database. The start script looks for it at
   `/usr/lib/postgresql/16`.

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
   The file `admin/.env.local` gets three extra settings for this: `ANTHROPIC_BASE_URL` (the
   address of the fake Claude), a fake `ANTHROPIC_API_KEY`, and `DRAFT_MODE=mock`. These are for
   testing only. Never put them in the online settings.
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

   All ten files are in `admin/supabase/migrations/`. Do not skip the last two: they hold the
   website forms (the tables and the form rules) and the Claude page's tables. Do not skip
   `20261121000800_security_hardening.sql` either: it holds the
   security fixes, including two-step login checked by the database. Never run the seed files
   (`admin/supabase/seed/`) on the online project. They create test logins with known passwords.
3. **Switch off public sign-up.** In the **Authentication** settings, turn **off**
   "Allow new users to sign up". Only the owner can invite people.
4. **Set the email links.** In **Authentication**, open the **Invite user** email template
   and the **Reset password** email template. In each, change the link to these:
   - Invite: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
5. **Connect Supabase's own email.** In the Authentication settings, find **SMTP** (custom
   SMTP). Enter the same Gmail details from Step 2. Then invites and password-reset emails
   are sent from your Gmail account.
6. **Copy three values** from **Project Settings, then API**: the Project URL, the `anon`
   key, and the `service_role` key. You will need them in Step 5. The `service_role` key is
   secret.
7. **Site URL and Redirect URLs.** Do this part again after Step 5, when you know the
   Vercel address. Set the **Site URL** to that address. Add it to the **Redirect URLs** list
   as `https://your-app.example.com/**`, using your own address.
8. **Security settings.** In **Authentication**, set the minimum password length to 12. Turn on
   **Secure password change**. Keep the built-in sign-in rate limits, and lower them if Supabase
   offers that. Keep sign-ups OFF (part 3).
9. **Keep the secret key secret.** The `service_role` key stays only in Vercel's server settings
   (Step 5). The server uses it to save website forms, to send email, and to manage staff. Never
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

### Step 5: Vercel (puts the website and the app online)

Vercel is a hosting service. It runs the app for you, and the app serves the website too.

1. Go to vercel.com and sign in with your GitHub account.
2. **Choose the right plan.** Vercel's free **Hobby** plan is for personal, non-commercial use only.
   Smallfold is a business, so use the **Pro** plan.
3. Click **Add New, then Project**, and import this GitHub repository.
4. Set **Root Directory** to `admin`. This tells Vercel that the app is in that folder.
   Leave the other build settings as Vercel shows them. Vercel runs the app's build, which
   also builds the website.
5. Open **Environment Variables**. Add every name listed in `admin/.env.example`, with its
   value from the steps above. Leave out the lines under "Testing on your computer only."
   The two Claude settings, `ANTHROPIC_ASSISTANT_MODEL` and `ASSISTANT_DAILY_LIMIT`, are optional.
6. Click **Deploy**. When it finishes, copy the address Vercel gives you. It ends in
   `.vercel.app`, unless you add your own domain.
7. Set `NEXT_PUBLIC_SITE_URL` to that address, then **redeploy**. The `NEXT_PUBLIC_` settings
   are built into the app, so a change needs a new deploy to take effect.
8. Go back to Supabase, Step 1, part 7, and set the Site URL and Redirect URLs.

### Step 6: First login (make yourself the owner)

1. In Supabase, open **Authentication**, then **Users**, then **Invite user**. Type your own
   email address and send the invite.
2. Open the invite email and follow the link. It opens a page where you choose a password of at least 12 characters.
3. In Supabase, open the **SQL Editor**. Paste the line below. Replace the placeholder with
   the same email address you invited, then click **Run**:
   ```sql
   select public.bootstrap_owner('you@example.com');
   ```
   It shows `true` when it works. It works only while there is no owner yet, so run it once.
   If it shows `false`, check the spelling of the email address.
4. Log in at your Vercel address. You are now the owner.

Do this before you invite anyone else.

### Step 7: Settings, Sending (test first)

1. Open **Settings**, then **Sending**.
2. **Test address:** type the address where test emails should arrive. Use your own.
3. **Sender postal address:** type the full postal address that appears at the bottom of
   every email. US law asks for a valid postal address on commercial email. A PO box is accepted.
4. Keep **Test mode** ticked, then save.
5. Send one test email. Open **Emails**, then **Compose**. Pick one or more creators. Choose a
   saved template, or type your goal in one sentence. Click **Draft emails**. Under **Review**, edit
   a draft if you want, then click **Approve**. Click **Send**, and confirm in the dialog. With test
   mode on, the email goes to your test address with `[TEST]` in the subject. No creator gets it.
6. Test the website forms. Open your Vercel address, go to **Apply**, and send one application
   with a test name and email. It should appear on **Creators** with status New. Then send one
   message from **For brands**. It should appear on **Inbox**. Delete the test records afterwards
   (as the owner).
7. When you are happy with the test, untick **Test mode** and save. Until a postal address is
   set, the app refuses to send to real creators.

Keep test mode on until the test email looks right.

### Step 8: Optional, two-step login for the owner

1. Open **Settings**, then **Security**.
2. Click **Set up two-step login**, then add the key to an authenticator app on your phone
   (the app shows a code each time you log in).
3. From then on, the app asks for a code at every login.

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
- **Audit log.** A record of who did what and when. Nobody can edit or delete it, not even the owner.
- **Row-level security.** The database itself checks each person's role on every read and write.
- **Two-step login in the database.** Once turned on, the database itself requires the code for the owner.
- **Only the server sends.** Only the server can call the functions that send email.
- **Login limit.** After 5 failed logins in 15 minutes, the app waits 15 minutes before it tries again.

## Tests

Run every check with one command. Before you start, the test stack (`bash admin/dev/start.sh`)
must be running, and the app must be running too. Start the app with `npm run dev`, or with
`npm run build` and then `npm run start`. Then, from inside `admin/`, run:

```
bash tests/run-all.sh
```

Run `bash admin/dev/reset.sh` before a full test run. The tests add audit lines, and those
lines cannot be deleted, so a fresh database keeps the counts right.

The script runs these suites in order. It prints one summary line for each, and it reports
an error if any suite fails:

1. **Database tests:** the row-level security rules, the guard functions, two-step login
   enforcement, and the rules for the website forms and the Claude page.
2. **Unit tests** (vitest).
3. **QA browser checks:** failed login; a worker blocked from owner actions; search and the
   creator pop-up; Overview numbers equal to the fake data; test-mode sending; opted-out and
   "do not contact" creators blocked; the public key reads nothing.
4. **Browser tests** for creators, deals and emails.
5. **Browser tests** for the website, the website forms and the Claude page. The Claude test adds one
   test creator and one draft, and removes them again.
6. **Browser test for login.** It runs last, because it trips the login limit.

Each browser test can also be run alone from inside `admin/`, for example `node lib/assistant/e2e.cjs`,
with `BASE_URL` set to your app's address. The Claude test needs the fake Claude from `dev/start.sh`.
Run `bash admin/dev/reset.sh` afterwards to remove any leftover test data.

The script starts and resets nothing. If the test data looks wrong, run `bash admin/dev/reset.sh` first.

## Not built yet

These are planned, but the app does not have them yet:

- A Kanban board for deals.
- Gmail reply tracking (replies found automatically, not marked by hand).
- Follow-up reminders.
- A scheduled subscriber refresh.
- The brand section.
- The creator section.
- A connector for the Claude app. The Claude page in the back office is the only way to talk to Claude for now.
